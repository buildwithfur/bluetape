import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Plus } from '@phosphor-icons/react'
import { TopBar } from '@/components/AppShell'
import { EmptyState } from '@/components/EmptyState'
import { RoleGate } from '@/components/RoleGate'
import { usePages } from '@/data/hooks'
import { formatInSG } from '@/lib/date'
import { pagePath } from '@/lib/record-route'

/** Catalog of rule pages — admin full CRUD, helper view-only (§6.6). */
export default function Rules() {
  const { t } = useTranslation()
  const rules = usePages('rule')

  return (
    <>
      <TopBar
        title={t('more.rules')}
        back
        backOnDesktop={false}
        right={
          <RoleGate allow={['admin']}>
            <Link
              to="/p/new?type=rule"
              aria-label={t('page.newRule')}
              className="inline-flex h-9 w-9 items-center justify-center gap-2 rounded-xs bg-accent px-0 text-sm font-medium text-text-on-accent hover:bg-accent-hover active:scale-95 transition sm:w-auto sm:px-3"
            >
              <Plus size={16} weight="bold" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">{t('page.newRule')}</span>
            </Link>
          </RoleGate>
        }
      />
      {!rules ? (
        <EmptyState>{t('common.loading')}</EmptyState>
      ) : rules.length === 0 ? (
        <EmptyState>{t('common.empty')}</EmptyState>
      ) : (
        <ul className="border-t border-border-subtle">
          {rules.map((p) => (
            <li key={p._id} className="border-b border-border-subtle last:border-b-0">
              <Link
                to={pagePath(p)}
                className="block page-px py-4 min-h-[56px] active:bg-surface-hover transition-colors"
              >
                <div className="text-[16px] text-text-primary">{p.title}</div>
                <div className="mono-sm text-text-tertiary mt-0.5">
                  {t(p.pinnedToToday ? 'page.pinnedUpdated' : 'page.updated', {
                    date: formatInSG(p.updatedAt, { day: 'numeric', month: 'short' }),
                  })}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
