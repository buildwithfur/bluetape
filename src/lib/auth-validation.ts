export const MIN_PASSWORD_LENGTH = 8
export const AUTH_CODE_LENGTH = 6

export function isValidUsername(value: string): boolean {
  const username = value.trim().toLowerCase()
  return username.length >= 3 && username.length <= 32 && /^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])?$/.test(username)
}

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase()
}

export function isValidEmail(value: string): boolean {
  const email = value.trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function isValidPassword(value: string): boolean {
  return value.length >= MIN_PASSWORD_LENGTH
}

export function isValidAuthCode(value: string): boolean {
  return new RegExp(`^\\d{${AUTH_CODE_LENGTH}}$`).test(value.trim())
}
