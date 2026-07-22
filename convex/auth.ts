import { convexAuth } from "@convex-dev/auth/server";
import { Email } from "@convex-dev/auth/providers/Email";
import { Password } from "@convex-dev/auth/providers/Password";
import Google from "@auth/core/providers/google";
import { env } from "./_generated/server";
import { getGoogleAuthCredentials } from "./lib/authSettings";

const AUTH_CODE_MAX_AGE_SECONDS = 15 * 60;
const DEFAULT_AUTH_EMAIL_FROM = "Bluetape <onboarding@resend.dev>";

type AuthEmailPurpose = "verify" | "reset";

function generateSixDigitCode(): string {
  const range = 1_000_000;
  const maxUnbiasedValue = Math.floor(0x1_0000_0000 / range) * range;
  const values = new Uint32Array(1);

  do {
    crypto.getRandomValues(values);
  } while (values[0] >= maxUnbiasedValue);

  return String(values[0] % range).padStart(6, "0");
}

function authEmailProvider(id: string, purpose: AuthEmailPurpose) {
  return Email({
    id,
    from: env.AUTH_EMAIL_FROM?.trim() || DEFAULT_AUTH_EMAIL_FROM,
    maxAge: AUTH_CODE_MAX_AGE_SECONDS,
    generateVerificationToken: async () => generateSixDigitCode(),
    async sendVerificationRequest({ identifier, token, provider }) {
      const apiKey = env.AUTH_RESEND_KEY?.trim();
      if (!apiKey) {
        throw new Error("Authentication email delivery is not configured");
      }

      const isVerification = purpose === "verify";
      const subject = isVerification
        ? "Verify your Bluetape email"
        : "Reset your Bluetape password";
      const explanation = isVerification
        ? "Use this code to finish creating your Bluetape account."
        : "Use this code to choose a new password for your Bluetape account.";

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: provider.from,
          to: identifier,
          subject,
          text: `${explanation}\n\n${token}\n\nThis code expires in 15 minutes. If you did not request it, you can ignore this email.`,
          html: `
            <div style="font-family: Arial, sans-serif; color: #171a20; line-height: 1.5">
              <h1 style="color: #0a2950; font-size: 24px">${subject}</h1>
              <p>${explanation}</p>
              <p style="font-family: monospace; font-size: 32px; font-weight: 700; letter-spacing: 0.18em; color: #0a2950">${token}</p>
              <p>This code expires in 15 minutes.</p>
              <p style="color: #5a5660">If you did not request it, you can ignore this email.</p>
            </div>
          `,
        }),
      });

      if (!response.ok) {
        throw new Error(`Authentication email delivery failed (${response.status})`);
      }
    },
  });
}

const verifyEmail = authEmailProvider("password-verify", "verify");
const resetPassword = authEmailProvider("password-reset", "reset");
const googleCredentials = getGoogleAuthCredentials();

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    ...(googleCredentials
      ? [Google(googleCredentials)]
      : []),
    Password({
      verify: verifyEmail,
      reset: resetPassword,
      profile(params) {
        // Map sign-up params to the auth users table.
        // Only 'name' and 'email' are available on the auth users table;
        // role/displayName are stored in userProfiles separately.
        return {
          email: params.email as string,
          name: (params.displayName as string) ?? (params.email as string),
        };
      },
    }),
  ],
});
