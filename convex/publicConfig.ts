import { v } from "convex/values";
import { query } from "./_generated/server";
import { getGoogleAuthCredentials } from "./lib/authSettings";

/** Public capability flags only. No credential values leave the backend. */
export const authProviders = query({
  args: {},
  returns: v.object({ google: v.boolean() }),
  handler: async () => ({
    google: getGoogleAuthCredentials() !== null,
  }),
});
