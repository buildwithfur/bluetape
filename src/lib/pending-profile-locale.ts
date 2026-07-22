import { isSupportedLocale, type SupportedLocale } from '@/i18n'

const PENDING_PROFILE_LOCALE_KEY = 'bluetape.pending-profile-locale'

/**
 * Carries a just-created account's language selection across the short auth
 * transition until its userProfile can be created.
 */
export function savePendingProfileLocale(locale: SupportedLocale) {
  try {
    window.sessionStorage.setItem(PENDING_PROFILE_LOCALE_KEY, locale)
  } catch {
    // Profile creation still succeeds with its English fallback if storage is unavailable.
  }
}

export function getPendingProfileLocale(): SupportedLocale | null {
  try {
    const locale = window.sessionStorage.getItem(PENDING_PROFILE_LOCALE_KEY)
    return locale && isSupportedLocale(locale) ? locale : null
  } catch {
    return null
  }
}

export function clearPendingProfileLocale() {
  try {
    window.sessionStorage.removeItem(PENDING_PROFILE_LOCALE_KEY)
  } catch {
    // Nothing to clean up when storage is unavailable.
  }
}
