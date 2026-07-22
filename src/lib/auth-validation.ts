export const MIN_PASSWORD_LENGTH = 8
export const AUTH_CODE_LENGTH = 6

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
