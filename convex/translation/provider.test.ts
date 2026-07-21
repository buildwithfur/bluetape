import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TRANSLATION_MODEL,
  parseProviderResults,
  targetLanguageForLocale,
  targetLanguageTagForLocale,
  TranslationProviderError,
} from './provider'

const input = {
  id: 'field-0',
  text: 'you dont anyhow throw things around',
  targetLocale: 'id',
  mode: 'instruction' as const,
}

describe('translation provider response validation', () => {
  it('maps the app locale my explicitly to Burmese, not Malay', () => {
    expect(targetLanguageForLocale('my')).toContain('Burmese')
    expect(targetLanguageForLocale('my')).toContain('never Malay')
    expect(targetLanguageTagForLocale('my')).toBe('my-MM')
    expect(() => targetLanguageForLocale('ms')).toThrow(
      'provider_unsupported_target_locale',
    )
  })

  it('returns a validated result and computes source/target equality itself', () => {
    const [result] = parseProviderResults(
      JSON.stringify({
        results: [{
          id: 'field-0',
          detectedSourceLocale: 'en-SG',
          normalizedSource: 'Do not throw things around carelessly.',
          translatedText: 'Jangan melempar barang sembarangan.',
          sourceIsTarget: true,
        }],
      }),
      [input],
    )

    expect(result.sourceIsTarget).toBe(false)
    expect(result.model).toBe(DEFAULT_TRANSLATION_MODEL)
  })

  it('rejects malformed and incomplete output', () => {
    expect(() => parseProviderResults('not json', [input])).toThrow(
      TranslationProviderError,
    )
    expect(() =>
      parseProviderResults(JSON.stringify({ results: [] }), [input]),
    ).toThrow('provider_invalid_shape')
  })
})
