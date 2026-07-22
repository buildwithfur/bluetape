import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { CaretRight, SignOut } from '@phosphor-icons/react'
import { TopBar } from '@/components/AppShell'
import { useAuthActions } from '@convex-dev/auth/react'
import { useCurrentRole } from '@/data/hooks'
import { appVersion } from '@/lib/app-version'

export default function More() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { signOut } = useAuthActions()
  const role = useCurrentRole()

  const entries = [
    { to: '/more/rules', label: t('more.rules'), hint: t('more.rulesHint') },
    { to: '/routines', label: t('nav.routines'), hint: t('more.routinesHint') },
    ...(role === 'owner' || role === 'admin'
      ? [{ to: '/family', label: t('more.family'), hint: t('more.familyHint') }]
      : []),
    { to: '/language', label: t('settings.language'), hint: t('settings.hint') },
  ]

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
      <p className="page-px py-4 text-center mono-sm text-text-tertiary md:hidden">
        {t('more.version', { version: appVersion })}
      </p>
    </>
  )
}
