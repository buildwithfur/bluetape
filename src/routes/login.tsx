import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthActions } from '@convex-dev/auth/react'
import { Button } from '@/components/Button'

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
        <div className="mb-10">
          <h1 className="text-[30px] font-semibold tracking-[-0.02em] text-ink">
            {mode === 'signIn' ? t('login.title') : t('login.createAccount')}
          </h1>
          <p className="mono-md text-text-tertiary mt-1">{t('login.subtitle')}</p>
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
