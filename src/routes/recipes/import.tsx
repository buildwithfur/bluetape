import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Check, Circle, SpinnerGap } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import { TopBar } from '@/components/AppShell'
import { RecipeEditor, type RecipeDraft } from '@/components/RecipeEditor'
import { usePublishRecipe, useRecipeImport, useRetryRecipeImport } from '@/data/hooks'

const SOCIAL_STAGES = ['reading_source', 'reading_caption', 'transcribing', 'extracting_recipe'] as const
const WEBSITE_STAGES = ['reading_source', 'extracting_recipe'] as const

export default function RecipeImport() {
  const { id } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const data = useRecipeImport(id)
  const publish = usePublishRecipe()
  const retry = useRetryRecipeImport()
  const [saving, setSaving] = useState(false)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    if (data?.job.status === 'published') {
      navigate(`/recipes/${data.recipe._id}`, { replace: true })
    }
  }, [data, navigate])

  if (data === undefined) {
    return <><TopBar title={t('recipe.import.title')} back /><p className="page-px py-10 text-sm text-text-tertiary">{t('common.loading')}</p></>
  }
  if (data === null) {
    return <><TopBar title={t('recipe.import.title')} back /><p className="page-px py-10 text-sm text-error-text">{t('recipe.import.notFound')}</p></>
  }

  const { job, recipe, ingredients, steps } = data
  if (job.status === 'needs_review') {
    const initial: RecipeDraft = {
      title: recipe.title,
      ingredients: ingredients.map((item) => item.text),
      steps: steps.map((item) => item.text),
    }
    return (
      <>
        <TopBar title={t('recipe.review.topbar')} back />
        <RecipeEditor
          initial={initial}
          sourceUrl={recipe.sourceUrl}
          sourceLabel={`${t(`recipe.sourceType.${recipe.sourceType}`)} · ${recipe.sourceDomain}`}
          saving={saving}
          onSave={async (draft) => {
            setSaving(true)
            try {
              const recipeId = await publish({ jobId: job._id, ...draft })
              navigate(`/recipes/${recipeId}`, { replace: true })
            } finally {
              setSaving(false)
            }
          }}
        />
      </>
    )
  }

  if (job.status === 'failed') {
    return (
      <>
        <TopBar title={t('recipe.import.title')} back />
        <div className="page-px py-10">
          <p className="mono-sm text-text-tertiary">{job.sourceDomain}</p>
          <h1 className="mt-3 text-[26px] font-semibold text-ink">{t('recipe.import.failedTitle')}</h1>
          <p className="mt-3 max-w-prose text-[16px] leading-relaxed text-text-secondary">{t('recipe.import.failedHint')}</p>
          <button
            type="button"
            disabled={retrying}
            onClick={async () => {
              setRetrying(true)
              try { await retry(job._id) } finally { setRetrying(false) }
            }}
            className="mt-6 min-h-12 rounded-xs bg-accent px-5 text-sm font-medium text-text-on-accent disabled:opacity-50"
          >
            {retrying ? t('recipe.import.retrying') : t('action.retry')}
          </button>
        </div>
      </>
    )
  }

  const stages: readonly string[] = job.sourceType === 'website' ? WEBSITE_STAGES : SOCIAL_STAGES
  const currentIndex = Math.max(0, stages.indexOf(job.stage))
  return (
    <>
      <TopBar title={t('recipe.import.title')} back />
      <div className="page-px py-10">
        <p className="mono-sm text-text-tertiary">{job.sourceDomain}</p>
        <h1 className="mt-3 text-[28px] font-semibold text-ink">{t(`recipe.stageHeading.${job.stage}`)}</h1>
        <ol className="mt-8 border-t border-border-subtle">
          {stages.map((stage, index) => {
            const complete = index < currentIndex
            const active = index === currentIndex
            return (
              <li key={stage} className="flex min-h-14 items-center gap-3 border-b border-border-subtle">
                {complete ? <Check size={19} className="text-success-accent" aria-hidden="true" /> : active ? <SpinnerGap size={19} className="animate-spin text-accent motion-reduce:animate-none" aria-hidden="true" /> : <Circle size={17} className="text-border-strong" aria-hidden="true" />}
                <span className={active ? 'text-[16px] text-ink' : 'text-[16px] text-text-secondary'}>{t(`recipe.stage.${stage}`)}</span>
              </li>
            )
          })}
        </ol>
        <p className="mt-6 text-sm leading-relaxed text-text-secondary">{t('recipe.import.leaveHint')}</p>
      </div>
    </>
  )
}
