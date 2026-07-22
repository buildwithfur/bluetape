import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowSquareOut, PencilSimple, Trash } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import { TopBar } from '@/components/AppShell'
import { Markdown } from '@/components/Markdown'
import { OverflowMenu } from '@/components/OverflowMenu'
import { ShareButton } from '@/components/ShareButton'
import { useDeleteRecipe, useRecipe } from '@/data/hooks'

export default function RecipeView() {
  const { id } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const data = useRecipe(id)
  const remove = useDeleteRecipe()
  const [deleting, setDeleting] = useState(false)

  if (data === undefined) return <><TopBar title={t('recipe.detail')} back /><p className="page-px py-10 text-sm text-text-tertiary">{t('common.loading')}</p></>
  if (data === null) return <><TopBar title={t('recipe.detail')} back /><p className="page-px py-10 text-sm text-error-text">{t('recipe.notFound')}</p></>

  const { recipe, canManage } = data
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
          <h1 className="max-w-[22ch] text-[32px] font-semibold leading-[1.08] tracking-[-0.025em] text-ink">{recipe.title}</h1>
          <p className="mt-3 mono-sm text-text-tertiary">{t('recipe.meta', { ingredients: recipe.ingredientCount, steps: recipe.stepCount })}</p>
          <div className="mt-4 flex min-h-11 items-center justify-between gap-3 border-y border-border-subtle py-2">
            <span className="min-w-0 truncate text-sm text-text-secondary">{t(`recipe.sourceType.${recipe.sourceType}`)}{recipe.sourceName ? ` · ${recipe.sourceName}` : ` · ${recipe.sourceDomain}`}</span>
            <a href={recipe.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xs px-2 text-sm font-medium text-ink-700 underline underline-offset-2">
              {t('recipe.openSource')} <ArrowSquareOut size={16} aria-hidden="true" />
            </a>
          </div>
          {!recipe.manuallyEditedAt && <p className="mt-3 text-sm leading-relaxed text-warning-text">{t('recipe.importedNotice')}</p>}
        </header>

        {data.sections.map((section, sectionIndex) => (
          <section key={`${section.name}:${sectionIndex}`} className="mt-8 border-t border-border-subtle pt-5">
            {section.name && <h2 className="text-[22px] font-semibold text-ink">{section.name}</h2>}
            <h3 className="label-caps mt-3 text-text-tertiary">{t('recipe.ingredients')}</h3>
            <ul className="mt-2">
              {section.ingredients.map((row) => <li key={row._id} className="min-h-12 border-b border-border-subtle py-3 text-[16px] leading-relaxed"><Markdown content={row.text} inline /></li>)}
            </ul>
            <h3 className="label-caps mt-6 text-text-tertiary">{t('recipe.steps')}</h3>
            <ol className="mt-1">
              {section.steps.map((row, index) => <li key={row._id} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 border-b border-border-subtle py-5"><span className="mono-md pt-0.5 text-text-tertiary">{index + 1}</span><Markdown content={row.text} className="text-[17px] leading-[1.65]" /></li>)}
            </ol>
          </section>
        ))}
        {recipe.notes && <section className="mt-9 border-t border-border-subtle pt-5"><h2 className="label-caps text-text-tertiary">{t('record.note')}</h2><Markdown content={recipe.notes} className="mt-2 text-[17px] leading-[1.65]" /></section>}
      </article>
    </>
  )
}
