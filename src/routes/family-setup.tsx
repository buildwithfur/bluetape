import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { House, ArrowRight } from '@phosphor-icons/react'
import { useCreateFamily, useAcceptInvite } from '@/data/hooks'
import { Button } from '@/components/Button'
import { TopBar } from '@/components/AppShell'
import { useTranslation } from 'react-i18next'

/** Shown when a user has a profile but no family yet. They either create
 * one (becoming the owner) or join one via invite link. Role is never
 * self-assigned: creators become owner/admin; invitees join as helper. */
export function FamilySetup() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const createFamily = useCreateFamily()
  const acceptInvite = useAcceptInvite()
  const [name, setName] = useState('')
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError(t('family.nameRequired'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await createFamily(name.trim())
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  async function join(e: React.FormEvent) {
    e.preventDefault()
    if (!token.trim()) {
      setError(t('family.inviteRequired'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      // Accepts either a raw token or a full invite URL.
      const tok = extractToken(token.trim())
      await acceptInvite(tok)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title={t('family.setupTitle')} showSearch={false} />
      <div className="flex-1 flex flex-col justify-center app-max-w mx-auto w-full page-px gap-10">
        <div className="flex items-center gap-3">
          <House size={28} className="text-accent" aria-hidden="true" />
          <div>
            <h1 className="text-[24px] font-semibold text-ink">{t('family.createTitle')}</h1>
            <p className="text-sm text-text-tertiary">{t('family.createDescription')}</p>
          </div>
        </div>
        <form onSubmit={create} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="label-caps text-text-tertiary">{t('family.name')}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-12 px-3 rounded-xs bg-surface border border-border-line text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              placeholder={t('family.namePlaceholder')}
            />
          </label>
          <Button type="submit" variant="primary" disabled={busy} leftIcon={<ArrowRight size={16} aria-hidden="true" />}>
            {t('family.create')}
          </Button>
        </form>

        <div className="border-t border-border-subtle pt-6">
          <h2 className="label-caps text-text-tertiary mb-3">{t('family.joinAlternative')}</h2>
          <form onSubmit={join} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="label-caps text-text-tertiary">{t('family.inviteInput')}</span>
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="h-12 px-3 rounded-xs bg-surface border border-border-line text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                placeholder={t('family.invitePlaceholder')}
              />
            </label>
            <Button type="submit" variant="secondary" disabled={busy}>
              {t('family.join')}
            </Button>
          </form>
        </div>

        {error && <p className="text-sm text-error-accent">{error}</p>}
      </div>
    </div>
  )
}

/** Extract the token from a raw token or an invite URL. */
function extractToken(input: string): string {
  const m = input.match(/\/invite\/([^/?#]+)/)
  return m ? m[1] : input
}
