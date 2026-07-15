import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useInviteFamily, useAcceptInvite, useCurrentProfile } from '@/data/hooks'
import { Button } from '@/components/Button'
import { TopBar } from '@/components/AppShell'
import { EmptyState } from '@/components/EmptyState'

/** /invite/:token — if signed in, show the family name + a Join button;
 * if not, redirect to login with a return path. Joining always adds the
 * user as a "helper" — the owner promotes if desired (no self-assign). */
export function InviteAccept() {
  const { t } = useTranslation()
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const family = useInviteFamily(token)
  const profile = useCurrentProfile()
  const acceptInvite = useAcceptInvite()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Not signed in → bounce to login, preserving the invite URL.
  useEffect(() => {
    if (profile === null) navigate('/login', { replace: true, state: { from: `/invite/${token}` } })
  }, [profile, navigate, token])

  if (profile === undefined || family === undefined) {
    return (
      <>
        <TopBar title={t('invite.title')} showSearch={false} />
        <EmptyState>{t('invite.loading')}</EmptyState>
      </>
    )
  }
  if (profile === null) return null
  if (family === null) {
    return (
      <>
        <TopBar title={t('invite.title')} showSearch={false} />
        <EmptyState>{t('invite.invalid')}</EmptyState>
      </>
    )
  }

  async function join() {
    setBusy(true)
    setError(null)
    try {
      await acceptInvite(token)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title={t('invite.title')} showSearch={false} />
      <div className="flex-1 flex flex-col justify-center app-max-w mx-auto w-full page-px text-center gap-6">
        <div>
          <h1 className="text-[24px] font-semibold text-ink">
            {t('invite.message', { family: family.name })}
          </h1>
        </div>
        {error && <p className="text-sm text-error-accent">{error}</p>}
        <Button variant="primary" onClick={join} disabled={busy} className="w-full">
          {t('invite.join')}
        </Button>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="text-sm text-text-tertiary underline underline-offset-2"
        >
          {t('invite.later')}
        </button>
      </div>
    </div>
  )
}
