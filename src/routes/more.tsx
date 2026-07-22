import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { CaretRight, Check, Copy, SignOut } from '@phosphor-icons/react'
import { TopBar } from '@/components/AppShell'
import { useAuthActions } from '@convex-dev/auth/react'
import { useCurrentProfile } from '@/data/hooks'
import { appVersion } from '@/lib/app-version'

export default function More() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { signOut } = useAuthActions()
  const profile = useCurrentProfile()
  const [copiedId, setCopiedId] = useState(false)
  const entries = [
    { to: '/more/rules', label: t('more.rules'), hint: t('more.rulesHint') },
    { to: '/routines', label: t('nav.routines'), hint: t('more.routinesHint') },
    { to: '/family', label: t('more.family'), hint: t('more.familyHint') },
    { to: '/language', label: t('settings.language'), hint: t('settings.hint') },
  ]

  function copyId(value: string) {
    void navigator.clipboard?.writeText(value)
    setCopiedId(true)
    setTimeout(() => setCopiedId(false), 1500)
  }

  return (
    <>
      <TopBar title={t('nav.more')} />
      <ul className="border-t border-border-subtle">
        {entries.map((e) => (
          <li key={e.to} className="border-b border-border-subtle last:border-b-0">
            <Link
              to={e.to}
              className="block page-px py-4 min-h-[56px] active:bg-surface-hover transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[16px] text-text-primary">{e.label}</div>
                  <div className="text-sm text-text-tertiary">{e.hint}</div>
                </div>
                <CaretRight size={20} className="text-text-tertiary" aria-hidden="true" />
              </div>
            </Link>
          </li>
        ))}
        <li className="border-b border-border-subtle">
          <button
            type="button"
            onClick={async () => {
              await signOut()
              navigate('/login')
            }}
            className="w-full text-left block page-px py-4 min-h-[56px] active:bg-surface-hover transition-colors"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-[16px] text-text-primary">{t('action.signOut')}</div>
              <SignOut size={20} className="text-text-tertiary" aria-hidden="true" />
            </div>
          </button>
        </li>
      </ul>
      {profile && (
        <div className="page-px py-4 text-center mono-sm text-text-tertiary">
          <IdFooterLine
            label={t('more.userId')}
            value={profile.userId}
            copied={copiedId}
            copyLabel={t('more.copyUserId')}
            copiedLabel={t('action.copied')}
            onCopy={() => copyId(profile.userId)}
          />
        </div>
      )}
      <p className="page-px py-4 text-center mono-sm text-text-tertiary md:hidden">
        {t('more.version', { version: appVersion })}
      </p>
    </>
  )
}

function IdFooterLine({
  label,
  value,
  copied,
  copyLabel,
  copiedLabel,
  onCopy,
}: {
  label: string
  value: string
  copied: boolean
  copyLabel: string
  copiedLabel: string
  onCopy: () => void
}) {
  return (
    <div className="flex items-center justify-center gap-1 leading-6">
      <span>{label}:</span>
      <span className="truncate" title={value}>{value}</span>
      <button
        type="button"
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-xs text-text-tertiary transition hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 active:bg-surface-active"
        aria-label={copied ? copiedLabel : copyLabel}
        onClick={onCopy}
      >
        {copied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
      </button>
    </div>
  )
}
