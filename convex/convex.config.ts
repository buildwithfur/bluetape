import { defineApp } from "convex/server";
import { v } from "convex/values";

/**
 * App-level configuration. Environment variables are set via
 * `npx convex env set <NAME> <value>` and read in functions via the
 * `env` export from `./_generated/server`.
 */
export default defineApp({
  env: {
    /**
     * When "true", the dev-only `admin.wipeEverything` mutation is allowed.
     * Set ONLY on dev deployments (via `npx convex env set ALLOW_DEV_WIPE true`).
     * Never set on production — the gate throws otherwise.
     */
    ALLOW_DEV_WIPE: v.optional(v.string()),
  },
});
