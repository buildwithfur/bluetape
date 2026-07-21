import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowSquareOut, PencilSimple, Trash } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import type { Doc } from '@convex/_generated/dataModel'
import { TopBar } from '@/components/AppShell'
import { Markdown } from '@/components/Markdown'
import { OverflowMenu } from '@/components/OverflowMenu'
import { ShareButton } from '@/components/ShareButton'
import { useCurrentProfile, useDeleteRecipe, useRecipe } from '@/data/hooks'
import { useLocalizedFields, type LocalizedField } from '@/data/useLocalizedFields'

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size))
  return result
}

function IngredientChunk({ rows, showOriginal }: { rows: Doc<'recipeIngredients'>[]; showOriginal: boolean }) {
  const fields: LocalizedField[] = rows.map((row) => ({ entityType: 'recipeIngredient', entityId: row._id, field: 'text', source: row.text }))
  const localized = useLocalizedFields(fields)
  return rows.map((row) => (
    <li key={row._id} className="flex min-h-12 items-start border-b border-border-subtle py-3 last:border-b-0">
      <Markdown content={showOriginal ? row.text : localized.textFor({ entityType: 'recipeIngredient', entityId: row._id, field: 'text', source: row.text })} inline className="text-[16px] leading-relaxed" />
    </li>
  ))
}

function StepChunk({ rows, offset, showOriginal }: { rows: Doc<'recipeSteps'>[]; offset: number; showOriginal: boolean }) {
  const fields: LocalizedField[] = rows.map((row) => ({ entityType: 'recipeStep', entityId: row._id, field: 'text', source: row.text }))
  const localized = useLocalizedFields(fields)
  return rows.map((row, index) => (
    <li key={row._id} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 border-b border-border-subtle py-5 last:border-b-0">
      <span className="mono-md pt-0.5 text-text-tertiary">{offset + index + 1}</span>
      <Markdown content={showOriginal ? row.text : localized.textFor({ entityType: 'recipeStep', entityId: row._id, field: 'text', source: row.text })} className="text-[17px] leading-[1.65]" />
    </li>
  ))
}

export default function RecipeView() {
  const { id } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const data = useRecipe(id)
  const profile = useCurrentProfile()
  const remove = useDeleteRecipe()
  const [showOriginal, setShowOriginal] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const titleFields: LocalizedField[] = data
    ? [{ entityType: 'recipe', entityId: data.recipe._id, field: 'title', source: data.recipe.title }]
    : []
  const localizedTitle = useLocalizedFields(titleFields)

  if (data === undefined) return <><TopBar title={t('recipe.detail')} back /><p className="page-px py-10 text-sm text-text-tertiary">{t('common.loading')}</p></>
  if (data === null) return <><TopBar title={t('recipe.detail')} back /><p className="page-px py-10 text-sm text-error-text">{t('recipe.notFound')}</p></>

  const { recipe, ingredients, steps, canManage } = data
  const title = showOriginal ? recipe.title : localizedTitle.textFor({ entityType: 'recipe', entityId: recipe._id, field: 'title', source: recipe.title })
  return (
    <>
      <TopBar
        title={t('recipe.detail')}
        back
        right={
          <div className="flex items-center">
            <ShareButton path={`/recipes/${recipe._id}`} title={recipe.title} />
            {canManage && (
              <OverflowMenu>
                {(close) => (
                  <>
                    <button type="button" role="menuitem" onClick={() => { close(); navigate(`/recipes/${recipe._id}/edit`) }} className="flex h-11 w-full items-center gap-3 rounded-xs px-3 text-sm text-ink-700 hover:bg-surface-hover">
                      <PencilSimple size={18} aria-hidden="true" /> {t('action.edit')}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={deleting}
                      onClick={async () => {
                        close()
                        if (!window.confirm(t('recipe.confirmDelete'))) return
                        setDeleting(true)
                        try { await remove(recipe._id); navigate('/recipes', { replace: true }) } finally { setDeleting(false) }
                      }}
                      className="flex h-11 w-full items-center gap-3 rounded-xs px-3 text-sm text-error-accent hover:bg-error-bg"
                    >
                      <Trash size={18} aria-hidden="true" /> {t('action.delete')}
                    </button>
                  </>
                )}
              </OverflowMenu>
            )}
          </div>
        }
      />
      <article className="page-px pb-12 pt-6">
        <header>
          <h1 className="max-w-[22ch] text-[32px] font-semibold leading-[1.08] tracking-[-0.025em] text-ink">{title}</h1>
          <p className="mt-3 mono-sm text-text-tertiary">{t('recipe.meta', { ingredients: recipe.ingredientCount, steps: recipe.stepCount })}</p>
          <div className="mt-4 flex min-h-11 items-center justify-between gap-3 border-y border-border-subtle py-2">
            <span className="min-w-0 truncate text-sm text-text-secondary">{t(`recipe.sourceType.${recipe.sourceType}`)}{recipe.sourceName ? ` · ${recipe.sourceName}` : ` · ${recipe.sourceDomain}`}</span>
            <a href={recipe.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xs px-2 text-sm font-medium text-ink-700 underline underline-offset-2">
              {t('recipe.openSource')} <ArrowSquareOut size={16} aria-hidden="true" />
            </a>
          </div>
          {profile?.autoTranslateEnabled === true && (
            <button type="button" onClick={() => setShowOriginal((value) => !value)} className="mt-3 min-h-11 rounded-xs px-2 text-sm text-ink-700 underline underline-offset-2">
              {showOriginal ? t('translation.showTranslation') : t('translation.showOriginal')}
            </button>
          )}
          {!recipe.manuallyEditedAt && <p className="mt-3 text-sm leading-relaxed text-warning-text">{t('recipe.importedNotice')}</p>}
        </header>

        <section className="mt-8 border-t border-border-subtle pt-5">
          <h2 className="label-caps text-text-tertiary">{t('recipe.ingredients')}</h2>
          <ul className="mt-2">
            {chunks(ingredients, 40).map((rows, index) => <IngredientChunk key={rows[0]?._id ?? index} rows={rows} showOriginal={showOriginal} />)}
          </ul>
        </section>

        <section className="mt-9 border-t border-border-subtle pt-5">
          <h2 className="label-caps text-text-tertiary">{t('recipe.steps')}</h2>
          <ol className="mt-1">
            {chunks(steps, 40).map((rows, index) => <StepChunk key={rows[0]?._id ?? index} rows={rows} offset={index * 40} showOriginal={showOriginal} />)}
          </ol>
        </section>
      </article>
    </>
  )
}
