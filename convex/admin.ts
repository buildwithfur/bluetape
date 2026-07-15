import { mutation, env } from "./_generated/server";

/**
 * Dev-only nuclear option: wipes ALL application data (families, members,
 * pages, routines, tasks, groceryItems, routineCompletions, links,
 * userProfiles, apiKeys, secrets). Leaves the auth `users` table intact so
 * accounts can still sign in (they'll re-bootstrap a profile + family).
 *
 * Gated by the `ALLOW_DEV_WIPE` env var, which must equal "true". This var
 * is set ONLY on dev deployments (`npx convex env set ALLOW_DEV_WIPE true`);
 * in production it is unset and this mutation throws. Safe to ship.
 *
 * Usage (against the dev deployment):
 *   npx convex env set ALLOW_DEV_WIPE true
 *   npx convex run admin:wipeEverything '{}'
 *   npx convex env remove ALLOW_DEV_WIPE   # optional lockdown
 */
export const wipeEverything = mutation({
  args: {},
  handler: async (ctx) => {
    if (env.ALLOW_DEV_WIPE !== "true") {
      throw new Error(
        "wipeEverything is disabled. Set ALLOW_DEV_WIPE=true on the dev deployment first.",
      );
    }

    const tables = [
      "familyMembers",
      "families",
      "pages",
      "links",
      "routines",
      "tasks",
      "groceryItems",
      "routineCompletions",
      "userProfiles",
      "apiKeys",
      "secrets",
    ] as const;

    for (const table of tables) {
      let done = false;
      while (!done) {
        // No family index for a global wipe; plain table scan with take().
        const docs = await ctx.db.query(table).take(200);
        for (const d of docs) {
          await ctx.db.delete(d._id);
        }
        done = docs.length < 200;
      }
    }
    return { ok: true, message: "All application data wiped." };
  },
});
