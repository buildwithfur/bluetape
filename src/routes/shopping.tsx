import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { CaretDown, CaretUp, Check, ListChecks, Plus, Trash, X } from '@phosphor-icons/react'
import { TopBar } from '@/components/AppShell'
import { BottomSheet } from '@/components/BottomSheet'
import { Button } from '@/components/Button'
import { CheckCircle } from '@/components/CheckCircle'
import { EmptyState } from '@/components/EmptyState'
import { Markdown } from '@/components/Markdown'
import { OverflowMenu } from '@/components/OverflowMenu'
import { WikiLinkSuggestions } from '@/components/WikiLinkSuggestions'
import {
  useAddGrocery,
  useAdjustGroceryCount,
  useCurrentProfile,
  useCurrentRole,
  useDeleteGroceryItem,
  useMarkGroceryBought,
  useUnmarkGroceryBought,
  useShopping,
} from '@/data/hooks'
import { recordPath } from '@/lib/record-route'
import { groceryCount } from '@/lib/shopping'
import { useLocalizedFields } from '@/data/useLocalizedFields'
import type { Doc, Id } from '@convex/_generated/dataModel'

const MOBILE_QUERY = '(max-width: 767px)'
const SWIPE_REVEAL_WIDTH = 96
const SWIPE_COMMIT_DISTANCE = 42

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_QUERY)
    const update = () => setIsMobile(mediaQuery.matches)
    update()
    mediaQuery.addEventListener('change', update)
    return () => mediaQuery.removeEventListener('change', update)
  }, [])

  return isMobile
}

function ShoppingRow({
  item,
  title,
  isMobile,
  isSelectionMode,
  selected,
  selectable,
  onToggleSelected,
  onOpen,
  onDelete,
  adjustCount,
  markBought,
  unmarkBought,
}: {
  item: Doc<'groceryItems'>
  title: string
  isMobile: boolean
  isSelectionMode: boolean
  selected: boolean
  selectable: boolean
  onToggleSelected: () => void
  onOpen: () => void
  onDelete: () => void
  adjustCount: (itemId: Id<'groceryItems'>, delta: -1 | 1) => Promise<unknown>
  markBought: (itemId: Id<'groceryItems'>) => Promise<unknown>
  unmarkBought: (itemId: Id<'groceryItems'>) => Promise<unknown>
}) {
  const { t } = useTranslation()
  const [swipeOffset, setSwipeOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const pointerRef = useRef<{
    id: number
    startX: number
    startY: number
    startOffset: number
    currentOffset: number
    moved: boolean
  } | null>(null)
  const suppressClickRef = useRef(false)
  const count = groceryCount(item)

  useEffect(() => {
    if (isSelectionMode || !isMobile) setSwipeOffset(0)
  }, [isMobile, isSelectionMode])

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!isMobile || isSelectionMode || event.pointerType === 'mouse') return
    const target = event.target as Element
    if (target.closest('button, a')) return

    suppressClickRef.current = false
    pointerRef.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffset: swipeOffset,
      currentOffset: swipeOffset,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const pointer = pointerRef.current
    if (!pointer || pointer.id !== event.pointerId) return

    const deltaX = event.clientX - pointer.startX
    const deltaY = event.clientY - pointer.startY
    if (!pointer.moved) {
      if (Math.abs(deltaX) < 8) return
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        pointerRef.current = null
        setIsDragging(false)
        return
      }
      pointer.moved = true
      setIsDragging(true)
    }

    const nextOffset = Math.min(0, Math.max(-SWIPE_REVEAL_WIDTH, pointer.startOffset + deltaX))
    pointer.currentOffset = nextOffset
    setSwipeOffset(nextOffset)
  }

  function finishPointer(event: React.PointerEvent<HTMLDivElement>) {
    const pointer = pointerRef.current
    if (!pointer || pointer.id !== event.pointerId) return
    if (pointer.moved) {
      suppressClickRef.current = true
      setSwipeOffset(pointer.currentOffset <= -SWIPE_COMMIT_DISTANCE ? -SWIPE_REVEAL_WIDTH : 0)
    }
    pointerRef.current = null
    setIsDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function onPointerCancel(event: React.PointerEvent<HTMLDivElement>) {
    if (pointerRef.current?.id !== event.pointerId) return
    pointerRef.current = null
    setSwipeOffset(0)
    setIsDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function handleRowClick(event: React.MouseEvent<HTMLDivElement>) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      event.preventDefault()
      return
    }
    if ((event.target as Element).closest('button, a')) return
    if (swipeOffset !== 0) {
      setSwipeOffset(0)
      return
    }
    if (isSelectionMode) {
      if (selectable) onToggleSelected()
      return
    }
    onOpen()
  }

  function handleRowKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!isSelectionMode || event.target !== event.currentTarget) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    if (selectable) onToggleSelected()
  }

  function handleTitleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (isSelectionMode || event.target !== event.currentTarget) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onOpen()
  }

  return (
    <li className="relative overflow-hidden border-b border-border-subtle">
      {isMobile && selectable && !isSelectionMode && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            setSwipeOffset(0)
            onDelete()
          }}
          tabIndex={swipeOffset === 0 ? -1 : 0}
          aria-hidden={swipeOffset === 0}
          aria-label={t('action.delete')}
          className="absolute inset-y-0 right-0 z-0 flex w-24 items-center justify-center gap-1.5 bg-error-bg px-2 text-sm font-medium text-error-accent md:hidden"
        >
          <Trash size={19} aria-hidden="true" />
          {t('action.delete')}
        </button>
      )}

      <div
        role={isSelectionMode ? 'button' : undefined}
        tabIndex={isSelectionMode ? 0 : undefined}
        aria-pressed={isSelectionMode ? selected : undefined}
        aria-disabled={isSelectionMode && !selectable ? true : undefined}
        onClick={handleRowClick}
        onKeyDown={handleRowKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={onPointerCancel}
        className={[
          'relative z-10 flex min-h-14 items-center page-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40',
          isSelectionMode && selected ? 'border-l-2 border-accent bg-accent-bg' : 'bg-background',
          isMobile ? 'touch-pan-y' : '',
          isDragging ? 'transition-none' : 'transition-transform duration-200 motion-reduce:transition-none',
          isSelectionMode && !selectable ? 'cursor-default' : 'cursor-pointer',
        ].filter(Boolean).join(' ')}
        style={{
          transform: swipeOffset === 0 ? undefined : `translate3d(${swipeOffset}px, 0, 0)`,
          touchAction: isMobile ? 'pan-y' : undefined,
        }}
      >
        {isSelectionMode ? (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center" aria-hidden="true">
            <CheckCircle checked={item.status === 'bought'} />
          </span>
        ) : (
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
        )}

        <div
          role={isSelectionMode ? undefined : 'link'}
          tabIndex={isSelectionMode ? undefined : 0}
          onKeyDown={handleTitleKeyDown}
          className="min-w-0 flex-1 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <Markdown
            inline
            content={title}
            className={item.status === 'bought'
              ? 'block truncate text-[16px] text-text-tertiary line-through'
              : 'block truncate text-[16px] text-text-primary'}
          />
        </div>

        <div className="ml-2 flex shrink-0 items-center" aria-label={t('shopping.quantity')}>
          <button
            type="button"
            onClick={() => void adjustCount(item._id, 1)}
            disabled={item.status === 'bought' || isSelectionMode}
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
            disabled={item.status === 'bought' || count <= 1 || isSelectionMode}
            className="flex h-11 w-9 items-center justify-center rounded-xs text-text-secondary transition hover:bg-surface-hover active:bg-surface-active disabled:text-text-disabled"
          >
            <CaretDown size={18} weight="bold" aria-hidden="true" />
          </button>
        </div>
      </div>
    </li>
  )
}

export default function Shopping() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const items = useShopping()
  const profile = useCurrentProfile()
  const role = useCurrentRole()
  const isMobile = useIsMobile()
  const addGrocery = useAddGrocery()
  const adjustCount = useAdjustGroceryCount()
  const deleteItem = useDeleteGroceryItem()
  const markBought = useMarkGroceryBought()
  const unmarkBought = useUnmarkGroceryBought()
  const [isAdding, setIsAdding] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [name, setName] = useState('')
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<Id<'groceryItems'>>>(new Set())
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Id<'groceryItems'>[] | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(false)
  const localized = useLocalizedFields((items ?? []).map((item) => ({
    entityType: 'groceryItem' as const,
    entityId: item._id,
    field: 'name' as const,
    source: item.name,
  })))

  useEffect(() => {
    if (isMobile) return
    setIsSelectionMode((current) => current ? false : current)
    setSelectedIds((current) => current.size === 0 ? current : new Set())
  }, [isMobile])

  useEffect(() => {
    if (!items) return
    const availableIds = new Set(items.map((item) => item._id))
    setSelectedIds((current) => {
      const next = new Set([...current].filter((itemId) => availableIds.has(itemId)))
      return next.size === current.size ? current : next
    })
  }, [items])

  if (!items) {
    return (
      <>
        <TopBar title={t('shopping.title')} />
        <EmptyState>{t('common.loading')}</EmptyState>
      </>
    )
  }

  function canDelete(item: Doc<'groceryItems'>) {
    return role === 'owner' || role === 'admin' || profile?.userId === item.addedBy
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

  function enterSelectionMode() {
    setSelectedIds(new Set())
    setIsSelectionMode(true)
  }

  function exitSelectionMode() {
    setSelectedIds(new Set())
    setIsSelectionMode(false)
  }

  function toggleSelected(itemId: Id<'groceryItems'>) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  function requestDelete(itemIds: Id<'groceryItems'>[]) {
    if (itemIds.length === 0) return
    setDeleteError(false)
    setPendingDeleteIds(itemIds)
  }

  async function confirmDeletion() {
    const itemIds = pendingDeleteIds
    if (!itemIds || itemIds.length === 0 || deleting) return
    setDeleting(true)
    setDeleteError(false)
    try {
      await Promise.all(itemIds.map((itemId) => deleteItem(itemId)))
      setPendingDeleteIds(null)
      setDeleteError(false)
      exitSelectionMode()
    } catch {
      setDeleteError(true)
    } finally {
      setDeleting(false)
    }
  }

  const selectedCount = selectedIds.size
  const deleteTitle = pendingDeleteIds?.length === 1
    ? t('action.delete')
    : t('shopping.deleteSelected')

  return (
    <>
      <TopBar
        title={t('shopping.title')}
        right={
          <div className="flex items-center gap-1 md:hidden">
            {isSelectionMode ? (
              <>
                <span className="mono-sm hidden text-text-secondary min-[360px]:inline" aria-live="polite">
                  {t('shopping.selectedCount', { count: selectedCount })}
                </span>
                <button
                  type="button"
                  onClick={() => requestDelete([...selectedIds])}
                  disabled={selectedCount === 0}
                  aria-label={t('shopping.deleteSelected')}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xs text-error-accent transition hover:bg-error-bg active:scale-95 disabled:text-text-disabled"
                >
                  <Trash size={21} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={exitSelectionMode}
                  className="inline-flex h-11 items-center justify-center rounded-xs px-2 text-sm font-medium text-ink-700 transition hover:bg-surface-active active:scale-95"
                >
                  {t('action.cancel')}
                </button>
              </>
            ) : (
              <OverflowMenu>
                {(close) => (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      close()
                      enterSelectionMode()
                    }}
                    className="flex h-11 w-full items-center gap-3 rounded-xs px-3 text-text-primary transition hover:bg-surface-hover active:bg-surface-active"
                  >
                    <ListChecks size={19} aria-hidden="true" />
                    {t('shopping.select')}
                  </button>
                )}
              </OverflowMenu>
            )}
          </div>
        }
      />

      <ul>
        {items.map((item) => (
          <ShoppingRow
            key={item._id}
            item={item}
            title={localized.textFor({ entityType: 'groceryItem', entityId: item._id, field: 'name', source: item.name })}
            isMobile={isMobile}
            isSelectionMode={isSelectionMode}
            selected={selectedIds.has(item._id)}
            selectable={canDelete(item)}
            onToggleSelected={() => toggleSelected(item._id)}
            onOpen={() => navigate(recordPath('shopping', item._id))}
            onDelete={() => requestDelete([item._id])}
            adjustCount={adjustCount}
            markBought={markBought}
            unmarkBought={unmarkBought}
          />
        ))}

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

      <BottomSheet
        open={pendingDeleteIds !== null}
        onClose={() => {
          if (deleting) return
          setPendingDeleteIds(null)
          setDeleteError(false)
        }}
        title={deleteTitle}
        footer={
          <>
            <Button
              variant="ghost"
              disabled={deleting}
              onClick={() => {
                setPendingDeleteIds(null)
                setDeleteError(false)
              }}
            >
              {t('action.cancel')}
            </Button>
            <Button variant="danger" disabled={deleting} onClick={() => void confirmDeletion()}>
              {t('action.delete')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p>
            {pendingDeleteIds?.length === 1
              ? t('common.confirmDeleteShopping')
              : t('shopping.confirmDeleteSelected', { count: pendingDeleteIds?.length ?? 0 })}
          </p>
          {deleteError && (
            <p role="alert" className="text-sm text-error-accent">
              {t('common.deleteShoppingFailed')}
            </p>
          )}
        </div>
      </BottomSheet>
    </>
  )
}
