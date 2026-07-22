import { httpRouter } from "convex/server";
import { env, httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import type { Id } from "./_generated/dataModel";
import { sha256Hex } from "./lib/sha256";

const http = httpRouter();

// Auth routes for JWT verification and OAuth callbacks
auth.addHttpRoutes(http);

// ─── API Routes (prefix: /api/) ───────────────────────────────────────
// Agents call these endpoints with JSON request/response bodies.
//
// Auth: set BLAUTAPE_API_KEY env var (via `npx convex env set` or dashboard).
//       Pass as `Authorization: Bearer <key>` header.
//       If unset, the API is open (dev mode).
//
// Examples:
//   # Today dashboard
//   curl https://<deployment>.convex.site/api/today?date=2026-07-07
//
//   # Create task
//   curl -X POST https://<deployment>.convex.site/api/tasks \
//     -H "Content-Type: application/json" \
//     -d '{"title":"Buy milk"}'
//
//   # List pending grocery items
//   curl https://<deployment>.convex.site/api/grocery

http.route({
  pathPrefix: "/api/",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    try {
      const { pathname, searchParams: params } = parseRequest(req);
      // Help and root are public
      if (pathname !== "help" && pathname !== "/" && pathname !== "") {
        const { familyId } = await authenticateRequest(ctx, req);
        return await handleGet(ctx, familyId, pathname, params);
      }
      return await handleGet(ctx, null, pathname, params);
    } catch (e: any) {
      return jsonResponse(
        { error: e.message || "Internal error" },
        e.status || 500,
      );
    }
  }),
});

// ─── Recipe worker routes ─────────────────────────────────────────────

function constantTimeEqual(left: string, right: string): boolean {
  const max = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < max; index++) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function authenticateRecipeWorker(req: Request): void {
  const configured = env.RECIPE_WORKER_SECRET;
  const header = req.headers.get("Authorization");
  const provided = header?.startsWith("Bearer ") ? header.slice(7) : "";
  if (!configured || !provided || !constantTimeEqual(configured, provided)) {
    throw Object.assign(new Error("Invalid recipe worker credentials"), { status: 401 });
  }
}

function recipeWorkerRoute(
  path: string,
  handler: (
    ctx: Parameters<Parameters<typeof httpAction>[0]>[0],
    body: Record<string, any>,
  ) => Promise<unknown>,
) {
  http.route({
    path,
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      try {
        authenticateRecipeWorker(req);
        const result = await handler(ctx, await parseBody(req));
        return jsonResponse(result);
      } catch (error: any) {
        return jsonResponse({ error: error.message || "Internal error" }, error.status || 500);
      }
    }),
  });
}

recipeWorkerRoute("/recipe-worker/claim", async (ctx, body) =>
  ctx.runMutation(internal.recipes.claimNext, { workerId: String(body.workerId || "worker") }));

recipeWorkerRoute("/recipe-worker/stage", async (ctx, body) =>
  ctx.runMutation(internal.recipes.updateWorkerStage, {
    jobId: body.jobId,
    leaseToken: body.leaseToken,
    stage: body.stage,
  }));

recipeWorkerRoute("/recipe-worker/complete", async (ctx, body) =>
  ctx.runMutation(internal.recipes.completeWorkerDraft, {
    jobId: body.jobId,
    leaseToken: body.leaseToken,
    title: body.title,
    sections: body.sections,
    ingredients: body.ingredients,
    steps: body.steps,
    sourceName: body.sourceName,
    sourceImageUrl: body.sourceImageUrl,
    sourceLanguage: body.sourceLanguage,
  }));

recipeWorkerRoute("/recipe-worker/fail", async (ctx, body) =>
  ctx.runMutation(internal.recipes.failWorkerJob, {
    jobId: body.jobId,
    leaseToken: body.leaseToken,
    errorCode: body.errorCode,
    message: body.message,
  }));

http.route({
  pathPrefix: "/api/",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    try {
      const { pathname } = parseRequest(req);
      const body = await parseBody(req);
      const { familyId } = await authenticateRequest(ctx, req);
      return await handlePost(ctx, familyId, pathname, body);
    } catch (e: any) {
      return jsonResponse(
        { error: e.message || "Internal error" },
        e.status || 500,
      );
    }
  }),
});

http.route({
  pathPrefix: "/api/",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }),
});

// ─── Authentication ───────────────────────────────────────────────────

/**
 * Authenticate the request and resolve the family the key is bound to.
 * The Bearer token is hashed and looked up in the `apiKeys` table; the
 * familyId comes from the key binding, NOT from the client. A key can
 * only ever act in its own family — there is no way to pass a different
 * familyId.
 */
async function authenticateRequest(
  ctx: Parameters<Parameters<typeof httpAction>[0]>[0],
  req: Request,
): Promise<{ familyId: Id<"families">; label: string | null }> {
  const header = req.headers.get("Authorization");
  if (!header || !header.startsWith("Bearer ")) {
    throw Object.assign(
      new Error(
        "Authentication required. Create an API key in the app (Family → API keys) and pass Authorization: Bearer <key>",
      ),
      { status: 401 },
    );
  }
  const token = header.slice("Bearer ".length);
  const keyHash = await sha256Hex(token);
  const binding = await ctx.runQuery(internal.apiKeys.getByHash, { keyHash });
  if (!binding) {
    throw Object.assign(new Error("Invalid or revoked API key"), { status: 401 });
  }
  return { familyId: binding.familyId, label: binding.label };
}

// ─── Helpers ──────────────────────────────────────────────────────────

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function parseRequest(req: Request) {
  const url = new URL(req.url);
  const pathname = url.pathname.replace(/^\/api\//, "") || "/";
  return { pathname, searchParams: url.searchParams };
}

async function parseBody(req: Request): Promise<Record<string, any>> {
  const text = await req.text();
  if (!text) return {};
  return JSON.parse(text);
}

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

function pathSegments(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

/** Get today's date as YYYY-MM-DD in Asia/Singapore (UTC+8). */
function todayDate(): string {
  const now = new Date();
  const sg = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return sg.toISOString().slice(0, 10);
}

// ─── GET Handlers ─────────────────────────────────────────────────────

async function handleGet(
  ctx: Parameters<Parameters<typeof httpAction>[0]>[0],
  familyId: Id<"families"> | null,
  pathname: string,
  params: URLSearchParams,
): Promise<Response> {
  const segs = pathSegments(pathname);
  const resource = segs[0] ?? "";
  // Public routes (help) don't need a familyId.
  const fid = (familyId ?? "") as any;

  switch (resource) {
    case "":
    case "help": {
      return jsonResponse({
        endpoints: {
          "GET  /api/today?date=YYYY-MM-DD": "Today dashboard",
          "GET  /api/tasks": "List tasks (?status=pending|done)",
          "GET  /api/grocery": "List pending shopping items",
          "GET  /api/routines": "List active routines",
          "GET  /api/pages": "List pages (?type=item|rule)",
          "GET  /api/pages/:slug": "Get page by slug",
          "GET  /api/search?q=...": "Search pages by title",
          "POST /api/tasks": "Create task {title, dueDate?}",
          "POST /api/tasks/:id/done": "Mark task done",
          "POST /api/grocery": "Add item {name, quantity?}",
          "POST /api/grocery/:id/bought": "Mark item bought",
          "POST /api/grocery/:id/unbought": "Unmark bought",
          "POST /api/routines": "Create routine {title, frequency, ...}",
          "POST /api/routines/:id/toggle": "Toggle completion {date?}",
          "POST /api/pages": "Create/update page {title, type, content, ...}",
          "POST /api/setup": "Set/change API key {apiKey: \"...\"}",
          "POST /api/completions/toggle": "Toggle routine completion shorthand",
          "note": "Auth: Bearer <key>. Keys are bound to one family at creation (in-app, by the family owner) and can only act within that family — no familyId is passed by the client.",
        },
      });
    }

    case "today": {
      const actualToday = todayDate();
      const date = params.get("date") || actualToday;
      const result = await ctx.runQuery(internal.api.today, {
        familyId: fid,
        date,
        includeUndatedTasks: date === actualToday,
      });
      return jsonResponse(result);
    }

    case "tasks": {
      const status = params.get("status") || undefined;
      const result = await ctx.runQuery(internal.api.listTasks, {
        familyId: fid,
        status: status as "pending" | "done" | undefined,
      });
      return jsonResponse(result);
    }

    case "grocery": {
      const result = await ctx.runQuery(internal.api.listGrocery, { familyId: fid });
      return jsonResponse(result);
    }

    case "routines": {
      const result = await ctx.runQuery(internal.api.listRoutines, { familyId: fid });
      return jsonResponse(result);
    }

    case "pages": {
      if (segs.length >= 2) {
        const result = await ctx.runQuery(internal.api.getPageBySlug, {
          familyId: fid,
          slug: segs[1],
        });
        return jsonResponse(result || { error: "Page not found" }, result ? 200 : 404);
      }
      const type = params.get("type");
      if (type) {
        const result = await ctx.runQuery(internal.api.listPagesByType, {
          familyId: fid,
          type: type as any,
        });
        return jsonResponse(result);
      }
      return jsonResponse({ error: "Query param 'type' required (?type=item|rule)" }, 400);
    }

    case "search": {
      const q = params.get("q");
      if (!q) return jsonResponse({ error: "Query param 'q' required" }, 400);
      const allPages = await ctx.runQuery(internal.api.allTitles, { familyId: fid });
      const matches = allPages.filter((p: any) =>
        p.title.toLowerCase().includes(q.toLowerCase()),
      );
      return jsonResponse(matches);
    }

    default:
      return jsonResponse({ error: `Unknown resource: ${resource}` }, 404);
  }
}

// ─── POST Handlers ────────────────────────────────────────────────────

async function handlePost(
  ctx: Parameters<Parameters<typeof httpAction>[0]>[0],
  familyId: Id<"families"> | null,
  pathname: string,
  body: Record<string, any>,
): Promise<Response> {
  const segs = pathSegments(pathname);
  const resource = segs[0];
  const fid = familyId as any;
  if (!familyId) {
    return jsonResponse({ error: "Authentication required" }, 401);
  }

  switch (resource) {
    // ── Tasks ──────────────────────────────────────────────
    case "tasks": {
      if (segs.length === 1) {
        const result = await ctx.runMutation(internal.api.addTask, {
          familyId: fid,
          title: body.title,
          dueDate: body.dueDate,
        });
        return jsonResponse(result, 201);
      }
      if (segs.length === 3 && segs[2] === "done") {
        const result = await ctx.runMutation(internal.api.markTaskDone, {
          taskId: segs[1] as any,
        });
        return jsonResponse(result);
      }
      break;
    }

    // ── Grocery ────────────────────────────────────────────
    case "grocery": {
      if (segs.length === 1) {
        const result = await ctx.runMutation(internal.api.addGroceryItem, {
          familyId: fid,
          name: body.name,
          quantity: body.quantity,
        });
        return jsonResponse(result, 201);
      }
      if (segs.length === 3 && segs[2] === "bought") {
        const result = await ctx.runMutation(internal.api.markGroceryBought, {
          itemId: segs[1] as any,
        });
        return jsonResponse(result);
      }
      if (segs.length === 3 && segs[2] === "unbought") {
        const result = await ctx.runMutation(internal.api.unmarkGroceryBought, {
          itemId: segs[1] as any,
        });
        return jsonResponse(result);
      }
      break;
    }

    // ── Routines ───────────────────────────────────────────
    case "routines": {
      if (segs.length === 1) {
        const result = await ctx.runMutation(internal.api.createRoutine, {
          familyId: fid,
          title: body.title,
          description: body.description,
          frequency: body.frequency,
          dayOfWeek: body.dayOfWeek,
          dayOfMonth: body.dayOfMonth,
          pageId: body.pageId,
        });
        return jsonResponse(result, 201);
      }
      if (segs.length === 3 && segs[2] === "toggle") {
        const result = await ctx.runMutation(internal.api.toggleRoutineCompletion, {
          routineId: segs[1] as any,
          date: body.date || todayDate(),
        });
        return jsonResponse(result);
      }
      break;
    }

    // ── Pages ──────────────────────────────────────────────
    case "pages": {
      const result = await ctx.runMutation(internal.api.savePage, {
        familyId: fid,
        pageId: body.pageId || undefined,
        title: body.title,
        type: body.type,
        content: body.content || "",
        location: body.location,
        pinnedToToday: body.pinnedToToday,
      });
      return jsonResponse(result, body.pageId ? 200 : 201);
    }

    // ── Completions (shorthand) ────────────────────────────
    case "completions": {
      if (segs.length >= 2 && segs[1] === "toggle") {
        const result = await ctx.runMutation(internal.api.toggleRoutineCompletion, {
          routineId: body.routineId,
          date: body.date || todayDate(),
        });
        return jsonResponse(result);
      }
      break;
    }
  }

  return jsonResponse({ error: "Not found" }, 404);
}

export default http;
