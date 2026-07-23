export const USERNAME_PASSWORD_PROVIDER = "username-password";

const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])?$/;

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidUsername(value: string): boolean {
  const username = normalizeUsername(value);
  return username.length >= 3 && username.length <= 32 && USERNAME_PATTERN.test(username);
}

export function validateUsername(value: string): string {
  const username = normalizeUsername(value);
  if (!isValidUsername(username)) {
    throw new Error("Username must be 3–32 characters and use only letters, numbers, dots, hyphens, or underscores");
  }
  return username;
}

export function validateUsernamePassword(value: string): void {
  if (value.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
}

/** A private auth-account identifier. It is never offered as an email login. */
export function usernameAccountId(username: string): string {
  return `${validateUsername(username)}@username.invalid`;
}
