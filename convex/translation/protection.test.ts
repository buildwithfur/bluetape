import { describe, expect, it } from 'vitest'
import {
  protectTranslatableText,
  restoreTranslatedText,
} from './protection'

describe('translation content protection', () => {
  it('restores wiki targets, URLs, code, and numbers exactly', () => {
    const source =
      'Hang 2 shirts near [[Laundry Room|washer]], see https://example.com/a?b=3 and run `timer 15`.'
    const protectedText = protectTranslatableText(source)

    expect(protectedText.text).not.toContain('https://example.com')
    expect(protectedText.text).toContain('[[__BT_')
    expect(
      restoreTranslatedText(protectedText.text, protectedText),
    ).toBe(source)
  })

  it('rejects missing or duplicated protected values', () => {
    const protectedText = protectTranslatableText('Buy 2 bags from https://example.com')
    const first = protectedText.tokens[0]?.placeholder
    expect(first).toBeDefined()

    expect(() => restoreTranslatedText('Buy bags', protectedText)).toThrow(
      'protected_token_missing',
    )
    expect(() =>
      restoreTranslatedText(`${protectedText.text} ${first}`, protectedText),
    ).toThrow('protected_token_duplicated')
  })
})
