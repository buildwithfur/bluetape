import { useEffect, useRef, useState } from 'react'
import { CaretDown } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import { useAuthActions } from '@convex-dev/auth/react'
import { Button } from '@/components/Button'
import i18n, { isSupportedLocale, supportedLanguageOptions, type SupportedLocale } from '@/i18n'
import { savePendingProfileLocale } from '@/lib/pending-profile-locale'

/** Per-user accounts via @convex-dev/auth password provider (PLAN.md §6.8).
 * Two flows: signIn (existing) and signUp (new account). After auth, App
 * gating bootstraps the userProfiles row if missing. */
export default function Login() {
  const { t } = useTranslation()
  const { signIn } = useAuthActions()
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [languageOpen, setLanguageOpen] = useState(false)
  const [locale, setLocale] = useState<SupportedLocale>(() => {
    const currentLocale = i18n.resolvedLanguage ?? i18n.language
    return isSupportedLocale(currentLocale) ? currentLocale : 'en'
  })
  const languageMenuRef = useRef<HTMLDivElement>(null)

  const selectedLanguage = supportedLanguageOptions.find((option) => option.locale === locale)!

  useEffect(() => {
    if (!languageOpen) return
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!languageMenuRef.current?.contains(event.target as Node)) setLanguageOpen(false)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setLanguageOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [languageOpen])

  function selectLanguage(nextLocale: SupportedLocale) {
    setLocale(nextLocale)
    setLanguageOpen(false)
    void i18n.changeLanguage(nextLocale)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!email || !password) {
      setError(t('login.error'))
      return
    }
    setBusy(true)
    try {
      if (mode === 'signUp') {
        await signIn('password', {
          email,
          password,
          flow: 'signUp',
          displayName: displayName || email,
        })
        savePendingProfileLocale(locale)
      } else {
        await signIn('password', { email, password, flow: 'signIn' })
      }
      // App gating reacts to isAuthenticated and routes onward.
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (mode === 'signUp' && message.includes('already exists')) {
        setMode('signIn')
        setError(t('login.accountExists'))
      } else if (mode === 'signIn' && message.includes('InvalidSecret')) {
        setError(t('login.invalidCredentials'))
      } else {
        setError(message || t('login.error'))
      }
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex flex-col justify-center app-max-w mx-auto w-full page-px">
        <div className="mb-10 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[30px] font-semibold tracking-[-0.02em] text-ink">
              {mode === 'signIn' ? t('login.title') : t('login.createAccount')}
            </h1>
            <p className="mono-md mt-1 text-text-tertiary">{t('login.subtitle')}</p>
          </div>
          <div ref={languageMenuRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setLanguageOpen((open) => !open)}
              aria-label={t('login.language')}
              aria-haspopup="menu"
              aria-expanded={languageOpen}
              className="inline-flex h-11 items-center gap-1.5 rounded-xs px-2.5 text-sm font-medium text-ink-700 transition-colors hover:bg-surface-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <span aria-hidden="true">{selectedLanguage.flag}</span>
              <CaretDown size={14} weight="bold" aria-hidden="true" />
            </button>
            {languageOpen && (
              <div
                role="menu"
                aria-label={t('login.languageMenu')}
                className="absolute right-0 top-full z-40 mt-1 w-52 rounded-sm bg-surface-floating p-1.5 shadow-[0_8px_24px_rgba(10,41,80,0.12)]"
              >
                {supportedLanguageOptions.map((option) => (
                  <button
                    key={option.locale}
                    type="button"
                    role="menuitemradio"
                    aria-checked={option.locale === locale}
                    onClick={() => selectLanguage(option.locale)}
                    className="flex min-h-11 w-full items-center gap-3 rounded-xs px-3 text-left text-[16px] font-medium text-text-primary transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  >
                    <span aria-hidden="true">{option.flag}</span>
                    <span>{option.nativeName}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          {mode === 'signUp' && (
            <label className="flex flex-col gap-1.5">
              <span className="label-caps text-text-tertiary">{t('login.displayName')}</span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="h-12 px-3 rounded-xs bg-surface border border-border-line text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-colors"
                placeholder={t('login.displayNamePlaceholder')}
              />
            </label>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="label-caps text-text-tertiary">{t('login.email')}</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 px-3 rounded-xs bg-surface border border-border-line text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-colors"
              placeholder={t('login.emailPlaceholder')}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="label-caps text-text-tertiary">{t('login.password')}</span>
            <input
              type="password"
              autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 px-3 rounded-xs bg-surface border border-border-line text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-colors"
              placeholder={t('login.passwordPlaceholder')}
            />
          </label>
          {error && <p className="text-sm text-error-accent">{error}</p>}
          <Button type="submit" variant="primary" className="w-full" disabled={busy}>
            {mode === 'signIn' ? t('login.submit') : t('action.create')}
          </Button>
        </form>

        <div className="mt-8 text-center">
          {mode === 'signIn' ? (
            <p className="text-sm text-text-secondary">
              {t('login.newHere')}{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('signUp')
                  setError(null)
                }}
                className="text-accent underline underline-offset-2 hover:text-accent-hover"
              >
                {t('login.createAccount')}
              </button>
            </p>
          ) : (
            <p className="text-sm text-text-secondary">
              {t('login.haveAccount')}{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('signIn')
                  setError(null)
                }}
                className="text-accent underline underline-offset-2 hover:text-accent-hover"
              >
                {t('login.submit')}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
