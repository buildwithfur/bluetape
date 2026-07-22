import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import my from './locales/my.json'
import id from './locales/id.json'
import {
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from '@convex/supportedLocales'

const resources = {
  en: { translation: en },
  my: { translation: my },
  id: { translation: id },
} as const satisfies Record<SupportedLocale, { translation: Record<string, string> }>

export type { SupportedLocale } from '@convex/supportedLocales'
export const supportedLocales = SUPPORTED_LOCALES

const languageDetails: Record<SupportedLocale, { flag: string; nativeName: string }> = {
  en: { flag: '🇬🇧', nativeName: 'English' },
  my: { flag: '🇲🇲', nativeName: 'မြန်မာ' },
  id: { flag: '🇮🇩', nativeName: 'Bahasa Indonesia' },
}

/** Supported UI locales, labelled in their own language for language pickers. */
export const supportedLanguageOptions = supportedLocales.map((locale) => ({
  locale,
  ...languageDetails[locale],
}))

export function isSupportedLocale(locale: string): locale is SupportedLocale {
  return supportedLocales.includes(locale as SupportedLocale)
}

/** UI strings are locale-keyed and the user's profile chooses the locale. */
void i18n.use(initReactI18next).init({
  resources,
  lng: resolveInitialLocale(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
})

function resolveInitialLocale(): SupportedLocale {
  return 'en'
}

export default i18n
