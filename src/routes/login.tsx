import { useEffect, useRef, useState } from 'react'
import { CaretDown } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import { useAuthActions } from '@convex-dev/auth/react'
import { useQuery } from 'convex/react'
import { Button } from '@/components/Button'
import { api } from '@convex/_generated/api'
import i18n, { isSupportedLocale, supportedLanguageOptions, type SupportedLocale } from '@/i18n'
import { savePendingProfileLocale } from '@/lib/pending-profile-locale'
import {
  AUTH_CODE_LENGTH,
  MIN_PASSWORD_LENGTH,
  isValidAuthCode,
  isValidEmail,
  isValidPassword,
  isValidUsername,
  normalizeUsername,
} from '@/lib/auth-validation'

type AuthView = 'signIn' | 'signUp' | 'verifyEmail' | 'forgotPassword' | 'resetPassword'

/** Per-user accounts via @convex-dev/auth password provider (PLAN.md §6.8).
 * Sign-up requires an email OTP. Password reset uses a separate email OTP. */
export default function Login() {
  const { t } = useTranslation()
  const { signIn } = useAuthActions()
  const authProviders = useQuery(api.publicConfig.authProviders, {})
  const [view, setView] = useState<AuthView>('signIn')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [loginMode, setLoginMode] = useState<'email' | 'username'>('email')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
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

  function changeView(nextView: AuthView) {
    setView(nextView)
    setError(null)
    setNotice(null)
    setCode('')
    setNewPassword('')
    setConfirmPassword('')
  }

  function backendErrorMessage(err: unknown): string {
    const message = err instanceof Error ? err.message : ''
    if (message.includes('already exists')) return t('login.accountExists')
    if (message.includes('InvalidSecret') || message.includes('Invalid credentials')) {
      return t('login.invalidCredentials')
    }
    if (message.includes('TooManyFailedAttempts')) return t('login.tooManyAttempts')
    if (
      message.includes('Could not verify code') ||
      message.includes('Invalid code') ||
      message.includes('InvalidAccountId')
    ) {
      return t('login.invalidCode')
    }
    if (message.includes('email delivery')) return t('login.emailSendError')
    return t('login.error')
  }

  function validateEmail(): boolean {
    if (isValidEmail(email)) return true
    setError(t('login.invalidEmail'))
    return false
  }

  function validateNewPassword(value: string): boolean {
    if (isValidPassword(value)) return true
    setError(t('login.passwordRequirements', { count: MIN_PASSWORD_LENGTH }))
    return false
  }

  function validateCode(): boolean {
    if (isValidAuthCode(code)) return true
    setError(t('login.codeRequirements', { count: AUTH_CODE_LENGTH }))
    return false
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setNotice(null)

    if (view === 'signIn' && loginMode === 'username') {
      if (!isValidUsername(username)) {
        setError(t('login.invalidUsername'))
        return
      }
    } else if (!validateEmail()) {
      return
    }
    if (view === 'signUp' && !displayName.trim()) {
      setError(t('login.displayNameRequired'))
      return
    }
    if ((view === 'signIn' || view === 'signUp') && !password) {
      setError(t('login.passwordRequired'))
      return
    }
    if (view === 'signUp' && !validateNewPassword(password)) return
    if ((view === 'verifyEmail' || view === 'resetPassword') && !validateCode()) return
    if (view === 'resetPassword') {
      if (!validateNewPassword(newPassword)) return
      if (newPassword !== confirmPassword) {
        setError(t('login.passwordsDoNotMatch'))
        return
      }
    }

    setBusy(true)
    try {
      if (view === 'signUp') {
        const result = await signIn('password', {
          email: email.trim(),
          password,
          flow: 'signUp',
          displayName: displayName.trim(),
        })
        savePendingProfileLocale(locale)
        if (!result.signingIn) {
          changeView('verifyEmail')
          setNotice(t('login.verificationCodeSent'))
        }
      } else if (view === 'signIn') {
        if (loginMode === 'username') {
          await signIn('username-password', {
            username: normalizeUsername(username),
            password,
            flow: 'signIn',
          })
        } else {
          const result = await signIn('password', {
            email: email.trim(),
            password,
            flow: 'signIn',
          })
          if (!result.signingIn) {
            changeView('verifyEmail')
            setNotice(t('login.verificationCodeSent'))
          }
        }
      } else if (view === 'verifyEmail') {
        await signIn('password', {
          email: email.trim(),
          code: code.trim(),
          flow: 'email-verification',
        })
      } else if (view === 'forgotPassword') {
        try {
          await signIn('password', { email: email.trim(), flow: 'reset' })
        } catch (err) {
          const message = err instanceof Error ? err.message : ''
          if (!message.includes('InvalidAccountId')) throw err
        }
        changeView('resetPassword')
        setNotice(t('login.resetCodeSent'))
      } else {
        await signIn('password', {
          email: email.trim(),
          code: code.trim(),
          newPassword,
          flow: 'reset-verification',
        })
      }
    } catch (err) {
      setError(backendErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function resendCode() {
    setError(null)
    setNotice(null)
    if (!validateEmail()) return
    setBusy(true)
    try {
      if (view === 'verifyEmail') {
        await signIn('password', { email: email.trim(), flow: 'email-verification' })
        setNotice(t('login.verificationCodeSent'))
      } else {
        try {
          await signIn('password', { email: email.trim(), flow: 'reset' })
        } catch (err) {
          const message = err instanceof Error ? err.message : ''
          if (!message.includes('InvalidAccountId')) throw err
        }
        setNotice(t('login.resetCodeSent'))
      }
    } catch (err) {
      setError(backendErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function signInWithGoogle() {
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      await signIn('google')
    } catch {
      setError(t('login.oauthError'))
      setBusy(false)
    }
  }

  const title = view === 'signIn'
    ? t('login.title')
    : view === 'signUp'
      ? t('login.createAccount')
      : view === 'verifyEmail'
        ? t('login.verifyEmailTitle')
        : view === 'forgotPassword'
          ? t('login.forgotPasswordTitle')
          : t('login.resetPasswordTitle')

  const subtitle = view === 'verifyEmail'
    ? t('login.verifyEmailInstructions', { email: email.trim() })
    : view === 'forgotPassword'
      ? t('login.forgotPasswordInstructions')
      : view === 'resetPassword'
        ? t('login.resetPasswordInstructions', { email: email.trim() })
        : null

  const showEmailInput =
    (view === 'signIn' && loginMode === 'email') || view === 'signUp' || view === 'forgotPassword'
  const showUsernameInput = view === 'signIn' && loginMode === 'username'
  const showCurrentPassword = view === 'signIn' || view === 'signUp'
  const showCode = view === 'verifyEmail' || view === 'resetPassword'
  const showOAuth =
    authProviders?.google === true && (view === 'signIn' || view === 'signUp')

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex flex-col justify-center app-max-w mx-auto w-full page-px py-10">
        <div className="mb-10 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[30px] font-semibold tracking-[-0.02em] text-ink">{title}</h1>
            {subtitle && <p className="mono-md mt-1 max-w-sm text-text-tertiary">{subtitle}</p>}
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

        {showOAuth && (
          <div className="mb-6 flex flex-col gap-4">
            <Button
              type="button"
              variant="secondary"
              className="w-full bg-surface"
              disabled={busy}
              onClick={() => void signInWithGoogle()}
              leftIcon={(
                <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
                  <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.55h3.24c1.9-1.75 2.98-4.32 2.98-7.42Z" />
                  <path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.63-2.35l-3.24-2.55c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z" />
                  <path fill="#FBBC05" d="M6.39 13.93A6 6 0 0 1 6.08 12c0-.67.11-1.32.31-1.93V7.45H3.04A10 10 0 0 0 2 12c0 1.64.39 3.2 1.04 4.55l3.35-2.62Z" />
                  <path fill="#EA4335" d="M12 5.94c1.47 0 2.79.5 3.83 1.5l2.87-2.88A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.96 5.45l3.35 2.62C7.18 7.7 9.39 5.94 12 5.94Z" />
                </svg>
              )}
            >
              {t('login.continueWithGoogle')}
            </Button>
            <div className="flex items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-border-line" />
              <span className="text-xs text-text-tertiary">{t('login.orContinueWithEmail')}</span>
              <span className="h-px flex-1 bg-border-line" />
            </div>
          </div>
        )}

        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {view === 'signUp' && (
            <label className="flex flex-col gap-1.5">
              <span className="label-caps text-text-tertiary">{t('login.displayName')}</span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                autoComplete="name"
                className="h-12 rounded-xs border border-border-line bg-surface px-3 text-text-primary placeholder:text-text-disabled focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                placeholder={t('login.displayNamePlaceholder')}
              />
            </label>
          )}

          {view === 'signIn' && (
            <div className="flex gap-1 rounded-xs bg-surface-hover p-1">
              {(['email', 'username'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setLoginMode(mode)}
                  className={`flex-1 rounded-xs px-3 py-2 text-sm font-medium ${loginMode === mode ? 'bg-surface text-ink shadow-sm' : 'text-text-tertiary'}`}
                >
                  {t(`login.${mode}`)}
                </button>
              ))}
            </div>
          )}

          {showUsernameInput && (
            <label className="flex flex-col gap-1.5">
              <span className="label-caps text-text-tertiary">{t('login.username')}</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                className="h-12 rounded-xs border border-border-line bg-surface px-3 text-text-primary placeholder:text-text-disabled focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                placeholder={t('login.usernamePlaceholder')}
              />
            </label>
          )}

          {showEmailInput && (
            <label className="flex flex-col gap-1.5">
              <span className="label-caps text-text-tertiary">{t('login.email')}</span>
              <input
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-12 rounded-xs border border-border-line bg-surface px-3 text-text-primary placeholder:text-text-disabled focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                placeholder={t('login.emailPlaceholder')}
              />
            </label>
          )}

          {showCurrentPassword && (
            <label className="flex flex-col gap-1.5">
              <span className="label-caps text-text-tertiary">{t('login.password')}</span>
              <input
                type="password"
                autoComplete={view === 'signIn' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-12 rounded-xs border border-border-line bg-surface px-3 text-text-primary placeholder:text-text-disabled focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                placeholder={t('login.passwordPlaceholder')}
              />
              {view === 'signUp' && (
                <span className="text-xs text-text-tertiary">
                  {t('login.passwordHint', { count: MIN_PASSWORD_LENGTH })}
                </span>
              )}
            </label>
          )}

          {view === 'signIn' && loginMode === 'email' && authProviders?.passwordReset === true && (
            <button
              type="button"
              onClick={() => changeView('forgotPassword')}
              className="-mt-2 self-end text-sm text-ink-700 underline underline-offset-2 hover:text-accent-hover"
            >
              {t('login.forgotPassword')}
            </button>
          )}

          {showCode && (
            <label className="flex flex-col gap-1.5">
              <span className="label-caps text-text-tertiary">{t('login.verificationCode')}</span>
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, AUTH_CODE_LENGTH))}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={AUTH_CODE_LENGTH}
                className="h-12 rounded-xs border border-border-line bg-surface px-3 font-mono text-lg tracking-[0.2em] text-text-primary placeholder:text-text-disabled focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                placeholder={t('login.verificationCodePlaceholder')}
              />
            </label>
          )}

          {view === 'resetPassword' && (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="label-caps text-text-tertiary">{t('login.newPassword')}</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="h-12 rounded-xs border border-border-line bg-surface px-3 text-text-primary placeholder:text-text-disabled focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                  placeholder={t('login.passwordPlaceholder')}
                />
                <span className="text-xs text-text-tertiary">
                  {t('login.passwordHint', { count: MIN_PASSWORD_LENGTH })}
                </span>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="label-caps text-text-tertiary">{t('login.confirmPassword')}</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="h-12 rounded-xs border border-border-line bg-surface px-3 text-text-primary placeholder:text-text-disabled focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                  placeholder={t('login.passwordPlaceholder')}
                />
              </label>
            </>
          )}

          {error && <p role="alert" className="text-sm text-error-accent">{error}</p>}
          {notice && <p role="status" className="text-sm text-success-text">{notice}</p>}

          <Button type="submit" variant="primary" className="w-full" disabled={busy}>
            {view === 'signIn'
              ? t('login.submit')
              : view === 'signUp'
                ? t('action.create')
                : view === 'verifyEmail'
                  ? t('login.verifyEmailAction')
                  : view === 'forgotPassword'
                    ? t('login.sendResetCode')
                    : t('login.resetPasswordAction')}
          </Button>
        </form>

        {(view === 'verifyEmail' || view === 'resetPassword') && (
          <button
            type="button"
            onClick={() => void resendCode()}
            disabled={busy}
            className="mt-4 self-center text-sm text-ink-700 underline underline-offset-2 hover:text-accent-hover disabled:opacity-50"
          >
            {t('login.resendCode')}
          </button>
        )}

        <div className="mt-8 text-center">
          {view === 'signIn' ? (
            <p className="text-sm text-text-secondary">
              {t('login.newHere')}{' '}
              <button
                type="button"
                onClick={() => changeView('signUp')}
                className="text-accent underline underline-offset-2 hover:text-accent-hover"
              >
                {t('login.createAccount')}
              </button>
            </p>
          ) : view === 'signUp' ? (
            <p className="text-sm text-text-secondary">
              {t('login.haveAccount')}{' '}
              <button
                type="button"
                onClick={() => changeView('signIn')}
                className="text-accent underline underline-offset-2 hover:text-accent-hover"
              >
                {t('login.submit')}
              </button>
            </p>
          ) : (
            <button
              type="button"
              onClick={() => changeView('signIn')}
              className="text-sm text-accent underline underline-offset-2 hover:text-accent-hover"
            >
              {t('login.backToSignIn')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
