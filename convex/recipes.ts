import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { canonicalizeWikiReferences } from "./wiki";
import { isOwner, requireFamilyMember } from "./permissions";

const sourceTypeValidator = v.union(
  v.literal("tiktok"),
  v.literal("instagram"),
  v.literal("youtube"),
  v.literal("website"),
);

const workerStageValidator = v.union(
  v.literal("reading_source"),
  v.literal("reading_caption"),
  v.literal("transcribing"),
  v.literal("extracting_recipe"),
);

const MAX_ITEMS = 100;
const LEASE_MS = 5 * 60 * 1000;
const TRACKING_PARAMS = new Set([
  "fbclid", "gclid", "igsh", "igshid", "si", "feature",
  "utm_campaign", "utm_content", "utm_medium", "utm_source", "utm_term",
]);

type SourceType = "tiktok" | "instagram" | "youtube" | "website";

function sourceTypeFor(hostname: string): SourceType {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";
  if (host === "instagram.com" || host.endsWith(".instagram.com")) return "instagram";
  if (host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com")) return "youtube";
  return "website";
}

export function normalizeRecipeSource(raw: string): {
  sourceUrl: string;
  normalizedSourceUrl: string;
  sourceDomain: string;
  sourceType: SourceType;
} {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Enter a valid public recipe URL");
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
    throw new Error("Enter a public http or https URL");
  }
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  const sourceUrl = url.toString();
  return {
    sourceUrl,
    normalizedSourceUrl: sourceUrl,
    sourceDomain: url.hostname.replace(/^www\./, ""),
    sourceType: sourceTypeFor(url.hostname),
  };
}

function canManage(
  recipe: Doc<"recipes">,
  access: Awaited<ReturnType<typeof requireFamilyMember>>,
): boolean {
  return recipe.createdBy === access.userId ||
    access.membership.role === "admin" || isOwner(access.family, access.userId);
}

function cleanTitle(value: string): string {
  const title = value.trim();
  if (!title) throw new Error("Recipe title is required");
  if (title.length > 200) throw new Error("Recipe title is too long");
  return title;
}

function cleanItems(values: string[], kind: "ingredient" | "step"): string[] {
  const items = values.map((value) => value.trim()).filter(Boolean);
  if (items.length === 0) throw new Error(`Add at least one ${kind}`);
  if (items.length > MAX_ITEMS) throw new Error(`Too many ${kind}s`);
  const maxLength = kind === "ingredient" ? 500 : 4000;
  if (items.some((item) => item.length > maxLength)) {
    throw new Error(`A ${kind} is too long`);
  }
  return items;
}

async function childrenFor(ctx: QueryCtx | MutationCtx, recipeId: Id<"recipes">) {
  const [ingredients, steps] = await Promise.all([
    ctx.db.query("recipeIngredients")
      .withIndex("by_recipe_and_sort_order", (q) => q.eq("recipeId", recipeId))
      .take(MAX_ITEMS + 1),
    ctx.db.query("recipeSteps")
      .withIndex("by_recipe_and_sort_order", (q) => q.eq("recipeId", recipeId))
      .take(MAX_ITEMS + 1),
  ]);
  if (ingredients.length > MAX_ITEMS || steps.length > MAX_ITEMS) {
    throw new Error("Recipe has too many rows");
  }
  return { ingredients, steps };
}

async function replaceChildren(
  ctx: MutationCtx,
  recipe: Doc<"recipes">,
  ingredients: string[],
  steps: string[],
) {
  const existing = await childrenFor(ctx, recipe._id);
  for (const row of [...existing.ingredients, ...existing.steps]) {
    await ctx.db.delete(row._id);
  }
  for (const [sortOrder, text] of ingredients.entries()) {
    await ctx.db.insert("recipeIngredients", {
      familyId: recipe.familyId,
      recipeId: recipe._id,
      text,
      sortOrder,
    });
  }
  for (const [sortOrder, text] of steps.entries()) {
    await ctx.db.insert("recipeSteps", {
      familyId: recipe.familyId,
      recipeId: recipe._id,
      text,
      sortOrder,
    });
  }
}

async function findJobForRecipe(
  ctx: QueryCtx | MutationCtx,
  recipe: Doc<"recipes">,
) {
  return ctx.db.query("recipeImportJobs")
    .withIndex("by_family_and_normalized_source_url", (q) =>
      q.eq("familyId", recipe.familyId).eq("normalizedSourceUrl", recipe.normalizedSourceUrl))
    .unique();
}

export const list = query({
  args: { familyId: v.id("families") },
  handler: async (ctx, args) => {
    await requireFamilyMember(ctx, args.familyId);
    return ctx.db.query("recipes")
      .withIndex("by_family_and_status_and_updated_at", (q) =>
        q.eq("familyId", args.familyId).eq("status", "published"))
      .order("desc")
      .take(100);
  },
});

export const listImports = query({
  args: { familyId: v.id("families") },
  handler: async (ctx, args) => {
    await requireFamilyMember(ctx, args.familyId);
    const jobs = await ctx.db.query("recipeImportJobs")
      .withIndex("by_family_and_created_at", (q) => q.eq("familyId", args.familyId))
      .order("desc")
      .take(50);
    return jobs.filter((job) => job.status !== "published");
  },
});

export const get = query({
  args: { recipeId: v.string() },
  handler: async (ctx, args) => {
    const recipeId = ctx.db.normalizeId("recipes", args.recipeId);
    if (!recipeId) return null;
    const recipe = await ctx.db.get(recipeId);
    if (!recipe) return null;
    const access = await requireFamilyMember(ctx, recipe.familyId);
    if (recipe.status !== "published" && !canManage(recipe, access)) return null;
    const children = await childrenFor(ctx, recipe._id);
    return { recipe, ...children, canManage: canManage(recipe, access) };
  },
});

export const getImport = query({
  args: { jobId: v.string() },
  handler: async (ctx, args) => {
    const jobId = ctx.db.normalizeId("recipeImportJobs", args.jobId);
    if (!jobId) return null;
    const job = await ctx.db.get(jobId);
    if (!job) return null;
    const access = await requireFamilyMember(ctx, job.familyId);
    const recipe = await ctx.db.get(job.recipeId);
    if (!recipe || !canManage(recipe, access)) return null;
    const children = await childrenFor(ctx, recipe._id);
    return { job, recipe, ...children };
  },
});

export const createImport = mutation({
  args: { familyId: v.id("families"), url: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await requireFamilyMember(ctx, args.familyId);
    const source = normalizeRecipeSource(args.url);
    const existing = await ctx.db.query("recipes")
      .withIndex("by_family_and_normalized_source_url", (q) =>
        q.eq("familyId", args.familyId).eq("normalizedSourceUrl", source.normalizedSourceUrl))
      .unique();
    if (existing) {
      const job = await findJobForRecipe(ctx, existing);
      return {
        kind: existing.status === "published" ? "recipe" as const : "import" as const,
        recipeId: existing._id,
        jobId: job?._id,
      };
    }

    const now = Date.now();
    const recipeId = await ctx.db.insert("recipes", {
      familyId: args.familyId,
      title: "",
      status: "draft",
      ...source,
      searchText: "",
      ingredientCount: 0,
      stepCount: 0,
      createdBy: userId,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now,
    });
    const jobId = await ctx.db.insert("recipeImportJobs", {
      familyId: args.familyId,
      recipeId,
      ...source,
      createdBy: userId,
      status: "queued",
      stage: "queued",
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    return { kind: "import" as const, recipeId, jobId };
  },
});

export const retryImport = mutation({
  args: { jobId: v.id("recipeImportJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Recipe import not found");
    const recipe = await ctx.db.get(job.recipeId);
    if (!recipe) throw new Error("Recipe draft not found");
    const access = await requireFamilyMember(ctx, job.familyId);
    if (!canManage(recipe, access)) throw new Error("You cannot retry this import");
    await ctx.db.patch(args.jobId, {
      status: "queued",
      stage: "queued",
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      lastErrorCode: undefined,
      lastErrorMessage: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const publish = mutation({
  args: {
    jobId: v.id("recipeImportJobs"),
    title: v.string(),
    ingredients: v.array(v.string()),
    steps: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Recipe import not found");
    const recipe = await ctx.db.get(job.recipeId);
    if (!recipe) throw new Error("Recipe draft not found");
    const access = await requireFamilyMember(ctx, recipe.familyId);
    if (!canManage(recipe, access)) throw new Error("You cannot publish this recipe");
    const title = await canonicalizeWikiReferences(ctx, recipe.familyId, cleanTitle(args.title));
    const ingredients = await Promise.all(cleanItems(args.ingredients, "ingredient").map((item) =>
      canonicalizeWikiReferences(ctx, recipe.familyId, item)));
    const steps = await Promise.all(cleanItems(args.steps, "step").map((item) =>
      canonicalizeWikiReferences(ctx, recipe.familyId, item)));
    await replaceChildren(ctx, recipe, ingredients, steps);
    const now = Date.now();
    await ctx.db.patch(recipe._id, {
      title,
      status: "published",
      searchText: `${title}\n${ingredients.join("\n")}`.toLowerCase(),
      ingredientCount: ingredients.length,
      stepCount: steps.length,
      updatedBy: access.userId,
      updatedAt: now,
      reviewedAt: now,
    });
    await ctx.db.patch(job._id, {
      status: "published",
      stage: "published",
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      updatedAt: now,
    });
    return recipe._id;
  },
});

export const update = mutation({
  args: {
    recipeId: v.id("recipes"),
    title: v.string(),
    ingredients: v.array(v.string()),
    steps: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const recipe = await ctx.db.get(args.recipeId);
    if (!recipe) throw new Error("Recipe not found");
    const access = await requireFamilyMember(ctx, recipe.familyId);
    if (!canManage(recipe, access)) throw new Error("You cannot edit this recipe");
    const title = await canonicalizeWikiReferences(ctx, recipe.familyId, cleanTitle(args.title));
    const ingredients = await Promise.all(cleanItems(args.ingredients, "ingredient").map((item) =>
      canonicalizeWikiReferences(ctx, recipe.familyId, item)));
    const steps = await Promise.all(cleanItems(args.steps, "step").map((item) =>
      canonicalizeWikiReferences(ctx, recipe.familyId, item)));
    await replaceChildren(ctx, recipe, ingredients, steps);
    await ctx.db.patch(recipe._id, {
      title,
      searchText: `${title}\n${ingredients.join("\n")}`.toLowerCase(),
      ingredientCount: ingredients.length,
      stepCount: steps.length,
      updatedBy: access.userId,
      updatedAt: Date.now(),
      manuallyEditedAt: Date.now(),
    });
    return recipe._id;
  },
});

async function deleteTranslationsFor(
  ctx: MutationCtx,
  familyId: Id<"families">,
  entityType: "recipe" | "recipeIngredient" | "recipeStep",
  entityId: Id<"recipes"> | Id<"recipeIngredients"> | Id<"recipeSteps">,
) {
  const rows = await ctx.db.query("contentTranslations")
    .withIndex("by_entity_field_locale", (q) =>
      q.eq("familyId", familyId).eq("entityType", entityType).eq("entityId", entityId))
    .take(21);
  if (rows.length > 20) throw new Error("Too many cached translations for recipe content");
  for (const row of rows) await ctx.db.delete(row._id);
}

export const remove = mutation({
  args: { recipeId: v.id("recipes") },
  handler: async (ctx, args) => {
    const recipe = await ctx.db.get(args.recipeId);
    if (!recipe) throw new Error("Recipe not found");
    const access = await requireFamilyMember(ctx, recipe.familyId);
    if (!canManage(recipe, access)) throw new Error("You cannot delete this recipe");
    const children = await childrenFor(ctx, recipe._id);
    await deleteTranslationsFor(ctx, recipe.familyId, "recipe", recipe._id);
    for (const ingredient of children.ingredients) {
      await deleteTranslationsFor(ctx, recipe.familyId, "recipeIngredient", ingredient._id);
      await ctx.db.delete(ingredient._id);
    }
    for (const step of children.steps) {
      await deleteTranslationsFor(ctx, recipe.familyId, "recipeStep", step._id);
      await ctx.db.delete(step._id);
    }
    const job = await findJobForRecipe(ctx, recipe);
    if (job) await ctx.db.delete(job._id);
    await ctx.db.delete(recipe._id);
    return null;
  },
});

function validLease(job: Doc<"recipeImportJobs">, leaseToken: string): boolean {
  return job.status === "processing" && job.leaseToken === leaseToken &&
    (job.leaseExpiresAt ?? 0) >= Date.now();
}

export const claimNext = internalMutation({
  args: { workerId: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const queued = await ctx.db.query("recipeImportJobs")
      .withIndex("by_status_and_created_at", (q) => q.eq("status", "queued"))
      .order("asc")
      .take(1);
    const expired = queued.length > 0 ? [] : await ctx.db.query("recipeImportJobs")
      .withIndex("by_status_and_lease_expires_at", (q) =>
        q.eq("status", "processing").lt("leaseExpiresAt", now))
      .order("asc")
      .take(1);
    const job = queued[0] ?? expired[0];
    if (!job) return null;
    const leaseToken = `${args.workerId}:${crypto.randomUUID()}`;
    await ctx.db.patch(job._id, {
      status: "processing",
      stage: "reading_source",
      leaseToken,
      leaseExpiresAt: now + LEASE_MS,
      attemptCount: job.attemptCount + 1,
      updatedAt: now,
    });
    return {
      jobId: job._id,
      recipeId: job.recipeId,
      sourceUrl: job.sourceUrl,
      sourceType: job.sourceType,
      leaseToken,
    };
  },
});

export const updateWorkerStage = internalMutation({
  args: {
    jobId: v.id("recipeImportJobs"),
    leaseToken: v.string(),
    stage: workerStageValidator,
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || !validLease(job, args.leaseToken)) throw new Error("Recipe import lease expired");
    await ctx.db.patch(job._id, {
      stage: args.stage,
      leaseExpiresAt: Date.now() + LEASE_MS,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const completeWorkerDraft = internalMutation({
  args: {
    jobId: v.id("recipeImportJobs"),
    leaseToken: v.string(),
    title: v.string(),
    ingredients: v.array(v.string()),
    steps: v.array(v.string()),
    sourceName: v.optional(v.string()),
    sourceImageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || !validLease(job, args.leaseToken)) throw new Error("Recipe import lease expired");
    const recipe = await ctx.db.get(job.recipeId);
    if (!recipe) throw new Error("Recipe draft not found");
    const title = cleanTitle(args.title);
    const ingredients = cleanItems(args.ingredients, "ingredient");
    const steps = cleanItems(args.steps, "step");
    await replaceChildren(ctx, recipe, ingredients, steps);
    const now = Date.now();
    await ctx.db.patch(recipe._id, {
      title,
      sourceName: args.sourceName?.trim() || undefined,
      sourceImageUrl: args.sourceImageUrl?.trim() || undefined,
      searchText: `${title}\n${ingredients.join("\n")}`.toLowerCase(),
      ingredientCount: ingredients.length,
      stepCount: steps.length,
      updatedAt: now,
    });
    await ctx.db.patch(job._id, {
      status: "needs_review",
      stage: "needs_review",
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      lastErrorCode: undefined,
      lastErrorMessage: undefined,
      updatedAt: now,
    });
    return null;
  },
});

export const failWorkerJob = internalMutation({
  args: {
    jobId: v.id("recipeImportJobs"),
    leaseToken: v.string(),
    errorCode: v.string(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.leaseToken !== args.leaseToken) return null;
    await ctx.db.patch(job._id, {
      status: "failed",
      stage: "failed",
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      lastErrorCode: args.errorCode.slice(0, 100),
      lastErrorMessage: args.message.slice(0, 500),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export { sourceTypeValidator };
