import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { MagnifyingGlass, X } from '@phosphor-icons/react'
import { useSearchPalette, useCreatePage } from '@/components/SearchContext'
import { useSearch } from '@/data/hooks'
import { formatInSG } from '@/lib/date'
import { pagePath, recordPath } from '@/lib/record-route'
import { wikiPlainText } from '@/lib/wiki'
import type { Doc } from '@convex/_generated/dataModel'

/** Modal command palette — searches notes, rules, recipes, and tasks (PLAN.md §6.7).
 * Routines are excluded. On mobile the query dock stays above the keyboard,
 * with results in a sheet behind it. */
export function SearchPalette() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { open, setOpen, query, setQuery } = useSearchPalette()
  const { createItem } = useCreatePage()
  const results = useSearch(query, open)
  const mobileInputRef = useRef<HTMLInputElement>(null)
  const desktopInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => {
      const isDesktop = window.matchMedia('(min-width: 768px)').matches
      ;(isDesktop ? desktopInputRef : mobileInputRef).current?.focus()
    })
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
  const { items, rules, recipes } = results
  const taskMatches = results.tasks
  const anyResults = items.length > 0 || rules.length > 0 || recipes.length > 0 || taskMatches.length > 0

  function go(path: string) {
    setOpen(false)
    setQuery('')
    navigate(path)
  }

  const resultProps = {
    q,
    query,
    items,
    rules,
    recipes,
    taskMatches,
    anyResults,
    createItem,
    go,
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-start md:pt-[12vh]">
      <button
        type="button"
        aria-label={t('action.close')}
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]"
      />

      {/* Mobile: the browser resizes the content viewport for the keyboard, so
          filling it places both the sheet and query dock flush above the OSK. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('search.title')}
        className="absolute inset-0 w-full md:hidden"
      >
        <div className="absolute inset-x-0 bottom-0 top-[max(7rem,16dvh)] flex flex-col overflow-hidden rounded-t-lg border border-border-subtle bg-surface-floating shadow-[0_-4px_16px_rgba(10,41,80,0.05)]">
          <SearchResults {...resultProps} />
        </div>

        <div className="absolute inset-x-0 bottom-0 z-10 p-3">
          <div className="flex h-14 items-center gap-2 rounded-full border border-border-line bg-surface px-4 shadow-[0_3px_12px_rgba(10,41,80,0.1)] focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
            <input
              ref={mobileInputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('search.placeholder')}
              className="min-w-0 flex-1 bg-transparent text-[17px] text-text-primary placeholder:text-text-tertiary focus:outline-none"
            />
            <button
              type="button"
              aria-label={t('action.close')}
              onClick={() => setOpen(false)}
              className="-mr-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-tertiary hover:bg-surface-active active:scale-95 transition"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* Desktop keeps the compact centered command palette. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('search.title')}
        className="relative hidden w-full min-h-0 max-h-[70vh] flex-col overflow-hidden rounded-md border border-border-subtle bg-surface-floating shadow-[0_4px_12px_rgba(10,41,80,0.025)] md:flex md:max-w-[480px]"
      >
        <div className="flex h-16 items-center gap-2 border-b border-border-subtle p-2">
          <div className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-xs border border-border-line bg-background px-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
            <MagnifyingGlass size={20} className="shrink-0 text-text-tertiary" aria-hidden="true" />
            <input
              ref={desktopInputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('search.placeholder')}
              className="min-w-0 flex-1 bg-transparent text-[16px] text-text-primary placeholder:text-text-tertiary focus:outline-none"
            />
            <kbd className="rounded-xs border border-border-subtle px-1.5 py-0.5 mono-sm text-text-tertiary">{t('action.escape')}</kbd>
          </div>
        </div>
        <SearchResults {...resultProps} />
      </div>
    </div>,
    document.body,
  )
}

function SearchResults({
  q,
  query,
  items,
  rules,
  recipes,
  taskMatches,
  anyResults,
  createItem,
  go,
}: {
  q: string
  query: string
  items: Doc<'pages'>[]
  rules: Doc<'pages'>[]
  recipes: Doc<'recipes'>[]
  taskMatches: Doc<'tasks'>[]
  anyResults: boolean
  createItem: (title: string) => void
  go: (path: string) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-28 pt-2">
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
      {recipes.length > 0 && (
        <Group label={t('search.group.recipes')}>
          {recipes.map((recipe) => (
            <ResultRow
              key={recipe._id}
              title={wikiPlainText(recipe.title)}
              sub={recipe.sourceDomain}
              onClick={() => go(recordPath('recipe', recipe._id))}
            />
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
