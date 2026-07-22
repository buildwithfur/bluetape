import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useEnsureProfile } from '@/data/hooks'
import { Button } from '@/components/Button'
import { TopBar } from '@/components/AppShell'
import {
  clearPendingProfileLocale,
  getPendingProfileLocale,
} from '@/lib/pending-profile-locale'

/** First-login profile bootstrap.
 *
 * The display name was collected during sign-up and is stored on the auth
 * user. This component copies it to the app profile without asking again.
 * Role is assigned per-family by the owner (see family-setup + family routes).
 */
export function ProfileBootstrap() {
  const { t } = useTranslation()
  const ensureProfile = useEnsureProfile()
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    setError(null)
    const locale = getPendingProfileLocale()
    void ensureProfile(locale ? { locale } : {})
      .then(() => clearPendingProfileLocale())
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
      })
  }, [attempt, ensureProfile])

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title={t('login.subtitle')} showSearch={false} />
      <div className="flex-1 flex flex-col justify-center app-max-w mx-auto w-full page-px">
        {error ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-error-accent">{error}</p>
            <Button type="button" variant="primary" className="w-full" onClick={() => setAttempt((value) => value + 1)}>
              {t('action.retry')}
            </Button>
          </div>
        ) : (
          <p className="mono-md text-text-tertiary">{t('profile.settingUp')}</p>
        )}
      </div>
    </div>
  )
}
