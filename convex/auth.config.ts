/**
 * Auth configuration for @convex-dev/auth JWT verification.
 *
 * The domain must point to the Convex site URL where the HTTP router
 * serves the JWKS endpoint (configured in convex/http.ts).
 *
 * Convex supplies CONVEX_SITE_URL for the selected deployment.
 */
export default {
  providers: [
    {
      // The domain where Convex can fetch JWKS for verifying auth tokens.
      // This is served by our own HTTP router at /.well-known/jwks.json
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
