import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, CookingPot } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import { TopBar } from '@/components/AppShell'
import { useCreateRecipeImport, useRecipeImports, useRecipes } from '@/data/hooks'
import { useLocalizedFields } from '@/data/useLocalizedFields'
import type { Doc } from '@convex/_generated/dataModel'

export default function RecipesIndex() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const recipes = useRecipes()
  const imports = useRecipeImports()
  const createImport = useCreateRecipeImport()
  const [url, setUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const localized = useLocalizedFields((recipes ?? []).map((recipe) => ({
    entityType: 'recipe' as const,
    entityId: recipe._id,
    field: 'title' as const,
    source: recipe.title,
  })))

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!url.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await createImport(url)
      if (result.kind === 'recipe') {
        navigate(`/recipes/${result.recipeId}`)
      } else if (result.jobId) {
        navigate(`/recipes/import/${result.jobId}`)
      }
    } catch {
      setError(t('recipe.import.invalid'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <TopBar title={t('recipe.title')} />
      <div className="page-px pb-8 pt-5">
        <form onSubmit={submit}>
          <label htmlFor="recipe-url" className="label-caps text-text-tertiary">
            {t('recipe.import.label')}
          </label>
          <div className="mt-2 flex flex-col gap-2 min-[360px]:flex-row">
            <input
              id="recipe-url"
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder={t('recipe.import.placeholder')}
              aria-invalid={!!error}
              className="h-12 min-w-0 flex-1 rounded-xs border border-border-line bg-surface px-3 text-[16px] text-ink outline-none placeholder:text-text-tertiary focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
            <button
              type="submit"
              disabled={submitting || !url.trim()}
              className="h-12 shrink-0 rounded-xs bg-accent px-5 text-sm font-medium text-text-on-accent transition hover:bg-accent-hover disabled:opacity-50"
            >
              {submitting ? t('recipe.import.starting') : t('recipe.import.action')}
            </button>
          </div>
          {error && <p role="alert" className="mt-2 text-sm text-error-text">{error}</p>}
        </form>

        {imports && imports.length > 0 && (
          <section className="mt-8 border-t border-border-subtle pt-5">
            <h2 className="label-caps text-text-tertiary">{t('recipe.imports')}</h2>
            <div className="mt-2">
              {imports.map((job) => (
                <Link key={job._id} to={`/recipes/import/${job._id}`} className="flex min-h-16 items-center gap-3 border-b border-border-subtle py-2">
                  <CookingPot size={20} className="shrink-0 text-ink-700" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] text-ink">{job.sourceDomain}</span>
                    <span className="mono-sm text-text-tertiary">{t(`recipe.stage.${job.stage}`)}</span>
                  </span>
                  <ArrowRight size={18} className="shrink-0 text-text-tertiary" aria-hidden="true" />
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="mt-8 border-t border-border-subtle pt-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="label-caps text-text-tertiary">{t('recipe.recipes')}</h2>
            {recipes && recipes.length > 0 && <span className="mono-sm text-text-tertiary">{t('recipe.count', { count: recipes.length })}</span>}
          </div>
          {recipes === undefined ? (
            <p className="py-8 text-sm text-text-tertiary">{t('common.loading')}</p>
          ) : recipes.length === 0 ? (
            <div className="py-10 text-center">
              <CookingPot size={30} className="mx-auto text-text-tertiary" aria-hidden="true" />
              <p className="mx-auto mt-3 max-w-64 text-sm leading-relaxed text-text-secondary">{t('recipe.empty')}</p>
            </div>
          ) : (
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
              {recipes.map((recipe) => (
                <RecipeCard key={recipe._id} recipe={recipe} title={localized.textFor({ entityType: 'recipe', entityId: recipe._id, field: 'title', source: recipe.title })} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}

function RecipeCard({ recipe, title }: { recipe: Doc<'recipes'>; title: string }) {
  const [imageFailed, setImageFailed] = useState(false)
  const initial = title.trim().charAt(0).toLocaleUpperCase() || '·'
  const imageUrl = imageFailed ? null : recipe.sourceImageUrl

  return (
    <li className="min-w-0">
      <Link
        to={`/recipes/${recipe._id}`}
        className="group relative block aspect-[4/3] h-full overflow-hidden rounded-sm bg-background-alt shadow-[0_1px_0_rgba(10,41,80,0.08)] ring-1 ring-border-subtle transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(10,41,80,0.08)] active:translate-y-0 motion-reduce:transform-none"
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02] motion-reduce:transform-none"
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
          />
        ) : (
          <div className="relative flex h-full items-center justify-center overflow-hidden bg-[linear-gradient(145deg,var(--color-surface)_0%,var(--color-background-alt)_100%)]">
            <span aria-hidden="true" className="select-none text-[64px] font-semibold tracking-[-0.05em] text-ink/[0.08]">
              {initial}
            </span>
            <CookingPot size={18} aria-hidden="true" className="absolute right-3 top-3 text-text-disabled" />
          </div>
        )}
        <div className="absolute inset-x-2 bottom-2 min-w-0 rounded-xs border border-white/60 bg-surface-floating/90 px-3 py-2 text-ink shadow-[0_2px_10px_rgba(10,41,80,0.08)] backdrop-blur-md">
          <div className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-[-0.01em]">
            {title}
          </div>
        </div>
      </Link>
    </li>
  )
}
