import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Trash } from '@phosphor-icons/react'
import { TopBar } from '@/components/AppShell'
import { Button } from '@/components/Button'
import { BottomSheet } from '@/components/BottomSheet'
import { CheckCircle } from '@/components/CheckCircle'
import { EmptyState } from '@/components/EmptyState'
import { ShareButton } from '@/components/ShareButton'
import { Markdown } from '@/components/Markdown'
import { OverflowMenu } from '@/components/OverflowMenu'
import {
  useGroceryItem,
  useCurrentProfile,
  useCurrentRole,
  useDeleteGroceryItem,
  useMarkGroceryBought,
  useUnmarkGroceryBought,
} from '@/data/hooks'
import { formatInSG } from '@/lib/date'
import { recordPath } from '@/lib/record-route'
import { groceryCount } from '@/lib/shopping'
import { wikiPlainText } from '@/lib/wiki'
import { useLocalizedFields } from '@/data/useLocalizedFields'

export default function ShoppingItemView() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const item = useGroceryItem(id)
  const profile = useCurrentProfile()
  const role = useCurrentRole()
  const deleteItem = useDeleteGroceryItem()
  const markBought = useMarkGroceryBought()
  const unmarkBought = useUnmarkGroceryBought()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(false)
  const localized = useLocalizedFields(
    item ? [{ entityType: 'groceryItem' as const, entityId: item._id, field: 'name' as const, source: item.name }] : [],
  )

  if (item === undefined) {
    return (
      <>
        <TopBar title={t('shopping.detail')} back showSearch={false} />
        <EmptyState>{t('common.loading')}</EmptyState>
      </>
    )
  }
  if (item === null) {
    return (
      <>
        <TopBar title={t('shopping.detail')} back showSearch={false} />
        <EmptyState>{t('common.empty')}</EmptyState>
      </>
    )
  }

  const canDelete =
    role === 'owner' ||
    role === 'admin' ||
    profile?.userId === item.addedBy

  return (
    <>
      <TopBar
        title={t('shopping.detail')}
        back
        showSearch={false}
        right={
          <div className="flex items-center">
            <ShareButton path={recordPath('shopping', item._id)} title={wikiPlainText(item.name)} />
            {canDelete && (
              <OverflowMenu>
                {(close) => (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        close()
                        setDeleteError(false)
                        setConfirmDelete(true)
                      }}
                      className="flex h-11 w-full items-center gap-3 rounded-xs px-3 text-error-accent transition hover:bg-error-bg active:bg-error-bg"
                    >
                      <Trash size={19} aria-hidden="true" />
                      {t('action.delete')}
                    </button>
                )}
              </OverflowMenu>
            )}
          </div>
        }
      />
      <article className="page-px py-6">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => void (
              item.status === 'pending'
                ? markBought(item._id)
                : unmarkBought(item._id)
            )}
            aria-pressed={item.status === 'bought'}
            aria-label={t(item.status === 'pending' ? 'shopping.markBought' : 'shopping.unmarkBought')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xs transition active:scale-95"
          >
            <CheckCircle checked={item.status === 'bought'} size={26} />
          </button>
          <h1 className="min-w-0 flex-1 px-2 py-1 text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink">
            <Markdown inline content={localized.textFor({ entityType: 'groceryItem', entityId: item._id, field: 'name', source: item.name })} />
          </h1>
        </div>
        <div className="mt-2 text-[16px] text-text-secondary">
          {t('shopping.quantityCount', { count: groceryCount(item) })}
        </div>
        <div className="mono-sm mt-4 text-text-tertiary">
          {t('record.created', { date: formatInSG(item.createdAt, { day: 'numeric', month: 'short', year: 'numeric' }) })}
        </div>
      </article>

      <BottomSheet
        open={confirmDelete}
        onClose={() => {
          setConfirmDelete(false)
          setDeleteError(false)
        }}
        title={t('action.delete')}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setConfirmDelete(false)
                setDeleteError(false)
              }}
            >
              {t('action.cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={deleting}
              onClick={async () => {
                if (!canDelete || deleting) return
                setDeleting(true)
                setDeleteError(false)
                try {
                  await deleteItem(item._id)
                  navigate('/shopping', { replace: true })
                } catch {
                  setDeleteError(true)
                } finally {
                  setDeleting(false)
                }
              }}
            >
              {t('action.delete')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p>{t('common.confirmDeleteShopping')}</p>
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
