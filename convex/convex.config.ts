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
    /** Server-only OpenRouter credentials for on-demand text translation. */
    OPENROUTER_API_KEY: v.optional(v.string()),
    /** Optional model override; defaults to Xiaomi MiMo V2.5 in the adapter. */
    OPENROUTER_TRANSLATION_MODEL: v.optional(v.string()),
    /**
     * Optional OpenRouter reasoning effort for the translation model.
     * Defaults to "none"; use "low" for models such as gpt-oss that require
     * reasoning to remain enabled.
     */
    OPENROUTER_TRANSLATION_REASONING_EFFORT: v.optional(v.string()),
    /** Rotatable bearer secret used only by the external recipe worker. */
    RECIPE_WORKER_SECRET: v.optional(v.string()),
    /** Resend API key used for auth verification and password-reset emails. */
    AUTH_RESEND_KEY: v.optional(v.string()),
    /** Verified Resend sender, for example "Bluetape <auth@example.com>". */
    AUTH_EMAIL_FROM: v.optional(v.string()),
    /** Google OAuth web-client credentials. */
    AUTH_GOOGLE_ID: v.optional(v.string()),
    AUTH_GOOGLE_SECRET: v.optional(v.string()),
  },
});
