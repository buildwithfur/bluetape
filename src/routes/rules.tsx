import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { TopBar } from '@/components/AppShell'
import { EmptyState } from '@/components/EmptyState'
import { RoleGate } from '@/components/RoleGate'
import { InlineRuleComposer } from '@/components/InlineRuleComposer'
import { usePages } from '@/data/hooks'
import { pagePath } from '@/lib/record-route'
import { useLocalizedFields } from '@/data/useLocalizedFields'

/** Catalog of rule pages — admin full CRUD, user view-only (§6.6). */
export default function Rules() {
  const { t } = useTranslation()
  const rules = usePages('rule')
  const localized = useLocalizedFields((rules ?? []).map((rule) => ({
    entityType: 'page' as const,
    entityId: rule._id,
    field: 'title' as const,
    source: rule.title,
  })))

  return (
    <>
      <TopBar
        title={t('more.rules')}
        back
        backOnDesktop={false}
      />
      {!rules ? (
        <EmptyState>{t('common.loading')}</EmptyState>
      ) : (
        <ul className="border-t border-border-subtle">
          {rules.map((p) => (
            <li key={p._id} className="border-b border-border-subtle last:border-b-0">
              <Link
                to={pagePath(p)}
                className="block page-px py-4 min-h-[56px] active:bg-surface-hover transition-colors"
              >
                <div className="text-[16px] text-text-primary">{localized.textFor({ entityType: 'page', entityId: p._id, field: 'title', source: p.title })}</div>
              </Link>
            </li>
          ))}
          <RoleGate allow={['admin']}>
            <InlineRuleComposer />
          </RoleGate>
        </ul>
      )}
    </>
  )
}
