/** Locale codes supported by both the frontend resource bundle and profiles. */
export const SUPPORTED_LOCALES = ['en', 'my'] as const

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]
