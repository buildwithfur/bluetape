import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { CaretDown, CaretUp, Check, Plus, X } from '@phosphor-icons/react'
import { TopBar } from '@/components/AppShell'
import { CheckCircle } from '@/components/CheckCircle'
import { EmptyState } from '@/components/EmptyState'
import { Markdown } from '@/components/Markdown'
import { WikiLinkSuggestions } from '@/components/WikiLinkSuggestions'
import {
  useAddGrocery,
  useAdjustGroceryCount,
  useMarkGroceryBought,
  useUnmarkGroceryBought,
  useShopping,
} from '@/data/hooks'
import { recordPath } from '@/lib/record-route'
import { groceryCount } from '@/lib/shopping'
import { useLocalizedFields } from '@/data/useLocalizedFields'

export default function Shopping() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const items = useShopping()
  const addGrocery = useAddGrocery()
  const adjustCount = useAdjustGroceryCount()
  const markBought = useMarkGroceryBought()
  const unmarkBought = useUnmarkGroceryBought()
  const [isAdding, setIsAdding] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [name, setName] = useState('')
  const localized = useLocalizedFields((items ?? []).map((item) => ({
    entityType: 'groceryItem' as const,
    entityId: item._id,
    field: 'name' as const,
    source: item.name,
  })))

  if (!items) {
    return (
      <>
        <TopBar title={t('shopping.title')} />
        <EmptyState>{t('common.loading')}</EmptyState>
      </>
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || isSaving) return
    setIsSaving(true)
    try {
      await addGrocery(name.trim())
      setName('')
      setIsAdding(false)
    } finally {
      setIsSaving(false)
    }
  }

  function cancelAdd() {
    setName('')
    setIsAdding(false)
  }

  return (
    <>
      <TopBar title={t('shopping.title')} />
      <ul>
        {items.map((item) => {
          const count = groceryCount(item)
          return (
            <li
              key={item._id}
              className="flex min-h-14 items-center border-b border-border-subtle page-px"
            >
              <button
                type="button"
                onClick={() => void (
                  item.status === 'bought'
                    ? unmarkBought(item._id)
                    : markBought(item._id)
                )}
                aria-label={t(item.status === 'bought'
                  ? 'shopping.unmarkBought'
                  : 'shopping.markBought')}
                className="flex h-12 w-12 shrink-0 items-center justify-center transition active:scale-95"
              >
                <CheckCircle checked={item.status === 'bought'} />
              </button>

              <div
                role="link"
                tabIndex={0}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest('a, button')) return
                  navigate(recordPath('shopping', item._id))
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') navigate(recordPath('shopping', item._id))
                }}
                className="min-w-0 flex-1 cursor-pointer py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <Markdown
                  inline
                  content={localized.textFor({ entityType: 'groceryItem', entityId: item._id, field: 'name', source: item.name })}
                  className={item.status === 'bought'
                    ? 'block truncate text-[16px] text-text-tertiary line-through'
                    : 'block truncate text-[16px] text-text-primary'}
                />
              </div>

              <div className="ml-2 flex shrink-0 items-center" aria-label={t('shopping.quantity')}>
                <button
                  type="button"
                  onClick={() => void adjustCount(item._id, 1)}
                  disabled={item.status === 'bought'}
                  aria-label={t('shopping.increaseQuantity')}
                  className="flex h-11 w-9 items-center justify-center rounded-xs text-text-secondary transition hover:bg-surface-hover active:bg-surface-active disabled:text-text-disabled"
                >
                  <CaretUp size={18} weight="bold" aria-hidden="true" />
                </button>
                <span className="mono-md min-w-7 text-center text-text-primary" aria-live="polite">
                  {count}
                </span>
                <button
                  type="button"
                  onClick={() => void adjustCount(item._id, -1)}
                  aria-label={t('shopping.decreaseQuantity')}
                  disabled={item.status === 'bought' || count <= 1}
                  className="flex h-11 w-9 items-center justify-center rounded-xs text-text-secondary transition hover:bg-surface-hover active:bg-surface-active disabled:text-text-disabled"
                >
                  <CaretDown size={18} weight="bold" aria-hidden="true" />
                </button>
              </div>
            </li>
          )
        })}

        <li className="border-b border-border-subtle">
          {isAdding ? (
            <form onSubmit={submit} className="page-px py-3">
              <div className="flex items-center gap-1">
                <span className="flex h-11 w-10 shrink-0 items-center justify-center text-accent" aria-hidden="true">
                  <Plus size={19} weight="bold" />
                </span>
                <input
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t('shopping.addPlaceholder')}
                  className="h-11 min-w-0 flex-1 bg-transparent px-1 text-[16px] text-text-primary placeholder:text-text-tertiary focus:outline-none"
                />
                <button
                  type="submit"
                  aria-label={t('action.add')}
                  disabled={!name.trim() || isSaving}
                  className="flex h-11 w-11 items-center justify-center rounded-xs text-ink-700 transition hover:bg-surface-hover active:bg-surface-active disabled:text-text-disabled"
                >
                  <Check size={20} weight="bold" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={cancelAdd}
                  aria-label={t('action.cancel')}
                  className="flex h-11 w-11 items-center justify-center rounded-xs text-text-secondary transition hover:bg-surface-hover active:bg-surface-active"
                >
                  <X size={19} aria-hidden="true" />
                </button>
              </div>
              <div className="ml-10 mt-1">
                <WikiLinkSuggestions value={name} onChange={setName} />
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className="page-px flex min-h-14 w-full items-center gap-3 text-left text-[16px] text-text-tertiary transition hover:bg-surface-hover active:bg-surface-active"
            >
              <span className="flex h-11 w-11 items-center justify-center text-accent" aria-hidden="true">
                <Plus size={19} weight="bold" />
              </span>
              {t('shopping.addItem')}
            </button>
          )}
        </li>
      </ul>
    </>
  )
}
