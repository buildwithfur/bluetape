import { env } from "../_generated/server";

export type GoogleAuthCredentials = {
  clientId: string;
  clientSecret: string;
};

export type AuthEmailSettings = {
  apiKey: string;
  from: string;
};

/** Returns credentials only when the Google provider is fully configured. */
export function getGoogleAuthCredentials(): GoogleAuthCredentials | null {
  const clientId = env.AUTH_GOOGLE_ID?.trim();
  const clientSecret = env.AUTH_GOOGLE_SECRET?.trim();

  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/**
 * Email verification and password reset must only be enabled when delivery is
 * configured. Otherwise adding the verify provider locks existing password
 * accounts behind an OTP that the deployment cannot send.
 */
export function getAuthEmailSettings(): AuthEmailSettings | null {
  const apiKey = env.AUTH_RESEND_KEY?.trim();
  const from = env.AUTH_EMAIL_FROM?.trim();
  if (!apiKey || !from || !isValidEmailSender(from)) return null;

  return { apiKey, from };
}

function isValidEmailSender(value: string): boolean {
  const displayAddress = value.match(/^[^<>]+<([^<>\s]+@[^<>\s]+)>$/)?.[1];
  const address = displayAddress ?? value;
  return /^[^<>\s@]+@[^<>\s@]+$/.test(address);
}
