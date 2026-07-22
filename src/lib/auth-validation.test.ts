import { describe, expect, it } from 'vitest'
import {
  AUTH_CODE_LENGTH,
  MIN_PASSWORD_LENGTH,
  isValidAuthCode,
  isValidEmail,
  isValidPassword,
} from './auth-validation'

describe('auth validation', () => {
  it('accepts ordinary email addresses and trims surrounding whitespace', () => {
    expect(isValidEmail('pone.chit@example.com')).toBe(true)
    expect(isValidEmail('  pone.chit@example.com  ')).toBe(true)
  })

  it('rejects incomplete email addresses', () => {
    expect(isValidEmail('pone.chit')).toBe(false)
    expect(isValidEmail('pone@')).toBe(false)
    expect(isValidEmail('')).toBe(false)
  })

  it(`requires passwords to contain at least ${MIN_PASSWORD_LENGTH} characters`, () => {
    expect(isValidPassword('a'.repeat(MIN_PASSWORD_LENGTH - 1))).toBe(false)
    expect(isValidPassword('a'.repeat(MIN_PASSWORD_LENGTH))).toBe(true)
  })

  it(`requires a ${AUTH_CODE_LENGTH}-digit authentication code`, () => {
    expect(isValidAuthCode('123456')).toBe(true)
    expect(isValidAuthCode(' 123456 ')).toBe(true)
    expect(isValidAuthCode('12345')).toBe(false)
    expect(isValidAuthCode('12345a')).toBe(false)
  })
})
