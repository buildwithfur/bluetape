import { env } from "../_generated/server";

export type GoogleAuthCredentials = {
  clientId: string;
  clientSecret: string;
};

/** Returns credentials only when the Google provider is fully configured. */
export function getGoogleAuthCredentials(): GoogleAuthCredentials | null {
  const clientId = env.AUTH_GOOGLE_ID?.trim();
  const clientSecret = env.AUTH_GOOGLE_SECRET?.trim();

  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}
