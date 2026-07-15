import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Plus } from '@phosphor-icons/react'
import { TopBar } from '@/components/AppShell'
import { EmptyState } from '@/components/EmptyState'
import { usePages } from '@/data/hooks'
import { formatInSG } from '@/lib/date'
import { pagePath } from '@/lib/record-route'

/** Catalog of item pages — both users can create (§6.6). */
export default function Items() {
  const { t } = useTranslation()
  const items = usePages('item')

  return (
    <>
      <TopBar
        title={t('more.items')}
        back
        backOnDesktop={false}
        right={
          <Link
            to="/p/new?type=item"
            aria-label={t('page.newItem')}
            className="inline-flex h-9 w-9 items-center justify-center gap-2 rounded-xs bg-accent px-0 text-sm font-medium text-text-on-accent hover:bg-accent-hover active:scale-95 transition sm:w-auto sm:px-3"
          >
            <Plus size={16} weight="bold" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">{t('page.newItem')}</span>
          </Link>
        }
      />
      {!items ? (
        <EmptyState>{t('common.loading')}</EmptyState>
      ) : items.length === 0 ? (
        <EmptyState>{t('common.empty')}</EmptyState>
      ) : (
        <ul className="border-t border-border-subtle">
          {items.map((p) => (
            <li key={p._id} className="border-b border-border-subtle last:border-b-0">
              <Link
                to={pagePath(p)}
                className="block page-px py-3 min-h-[56px] active:bg-surface-hover transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[16px] text-text-primary truncate">{p.title}</div>
                    {p.localName && (
                      <div className="font-local-script text-[18px] text-ink" style={{ fontFamily: 'var(--font-local-script)' }}>
                        {p.localName}
                      </div>
                    )}
                    {p.location && (
                      <div className="mono-sm text-text-tertiary">{p.location}</div>
                    )}
                  </div>
                  <span className="mono-sm text-text-tertiary whitespace-nowrap">
                    {formatInSG(p.updatedAt, { day: 'numeric', month: 'short' })}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
