import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { MagnifyingGlass, X } from '@phosphor-icons/react'
import { useSearchPalette, useCreatePage } from '@/components/SearchContext'
import { useAllPages, useCurrentFamilyId, useSearch } from '@/data/hooks'
import { formatInSG } from '@/lib/date'
import { pagePath, recordPath } from '@/lib/record-route'
import { wikiPlainText } from '@/lib/wiki'

/** Modal command palette — searches items, rules, tasks (PLAN.md §6.7).
 * Routines are excluded. White (surface-floating) overlay per DESIGN.md. */
export function SearchPalette() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { open, setOpen, query, setQuery } = useSearchPalette()
  const { createItem } = useCreatePage()
  const allPages = useAllPages()
  const familyId = useCurrentFamilyId()
  const results = useSearch(query)
  void familyId
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])
  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) setOpen(false)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!open) return null

  const q = query.trim().toLowerCase()
  const matches = (s?: string) => !!s && s.toLowerCase().includes(q)
  const items = (allPages ?? []).filter((p) => p.type === 'item' && (matches(p.title) || matches(p.content) || matches(p.location) || matches(p.localName)))
  const rules = (allPages ?? []).filter((p) => p.type === 'rule' && (matches(p.title) || matches(p.content)))
  const taskMatches = results.tasks
  const anyResults = items.length > 0 || rules.length > 0 || taskMatches.length > 0

  function go(path: string) {
    setOpen(false)
    setQuery('')
    navigate(path)
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-start md:pt-[12vh]">
      <button
        type="button"
        aria-label={t('action.close')}
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('search.title')}
        className="relative flex w-full min-h-[17rem] max-h-[78dvh] flex-col overflow-hidden rounded-t-md border border-border-subtle bg-surface-floating shadow-[0_4px_12px_rgba(10,41,80,0.025)] md:min-h-0 md:max-h-[70vh] md:max-w-[480px] md:rounded-md"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex h-16 items-center gap-2 border-b border-border-subtle p-2">
          <div className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-xs border border-border-line bg-background px-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
            <MagnifyingGlass size={20} className="shrink-0 text-text-tertiary" aria-hidden="true" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('search.placeholder')}
              className="min-w-0 flex-1 bg-transparent text-[16px] text-text-primary placeholder:text-text-tertiary focus:outline-none"
            />
            <kbd className="hidden rounded-xs border border-border-subtle px-1.5 py-0.5 mono-sm text-text-tertiary md:block">{t('action.escape')}</kbd>
          </div>
          <button
            type="button"
            aria-label={t('action.close')}
            onClick={() => setOpen(false)}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xs text-ink-700 hover:bg-surface-active active:scale-95 transition md:hidden"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-2">
          {q && (
            <button
              type="button"
              onClick={() => {
                createItem(query.trim())
                go(`/p/new?type=item&title=${encodeURIComponent(query.trim())}`)
              }}
              className="w-full text-left px-4 h-12 flex items-center gap-3 text-sm text-accent hover:bg-accent-bg border-b border-border-subtle"
            >
              {t('search.createNewItem', { query: query.trim() })}
            </button>
          )}
          {!anyResults && q && (
            <div className="flex min-h-32 items-center justify-center px-4 text-center text-sm text-text-tertiary">
              {t('search.noResults')}
            </div>
          )}
          {!anyResults && !q && (
            <div className="flex min-h-32 items-center justify-center px-8 text-center text-sm text-text-tertiary">
              {t('search.start')}
            </div>
          )}
          {items.length > 0 && (
            <Group label={t('search.group.items')}>
              {items.map((p) => (
                <ResultRow key={p._id} title={p.title} sub={p.location} onClick={() => go(pagePath(p))} />
              ))}
            </Group>
          )}
          {rules.length > 0 && (
            <Group label={t('search.group.rules')}>
              {rules.map((p) => (
                <ResultRow key={p._id} title={p.title} onClick={() => go(pagePath(p))} />
              ))}
            </Group>
          )}
          {taskMatches.length > 0 && (
            <Group label={t('search.group.tasks')}>
              {taskMatches.map((p) => (
                <ResultRow
                  key={p._id}
                  title={wikiPlainText(p.title)}
                  sub={p.dueDate ? formatInSG(new Date(p.dueDate + 'T12:00:00').getTime(), { day: 'numeric', month: 'short' }) : undefined}
                  onClick={() => go(recordPath('task', p._id))}
                />
              ))}
            </Group>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border-subtle last:border-b-0">
      <div className="label-caps text-text-tertiary px-4 pt-3 pb-1">{label}</div>
      {children}
    </div>
  )
}

function ResultRow({ title, sub, onClick }: { title: string; sub?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-4 h-12 flex items-center justify-between gap-3 text-[16px] text-text-primary hover:bg-surface-hover active:bg-surface-active"
    >
      <span className="truncate">{title}</span>
      {sub && <span className="mono-sm text-text-tertiary whitespace-nowrap">{sub}</span>}
    </button>
  )
}
