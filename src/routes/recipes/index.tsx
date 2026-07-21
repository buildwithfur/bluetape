import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, CookingPot } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import { TopBar } from '@/components/AppShell'
import { useCreateRecipeImport, useRecipeImports, useRecipes } from '@/data/hooks'

export default function RecipesIndex() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const recipes = useRecipes()
  const imports = useRecipeImports()
  const createImport = useCreateRecipeImport()
  const [url, setUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
            <div className="mt-2">
              {recipes.map((recipe) => (
                <Link key={recipe._id} to={`/recipes/${recipe._id}`} className="flex min-h-16 items-center justify-between gap-3 border-b border-border-subtle py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-[17px] font-medium text-ink">{recipe.title}</span>
                    <span className="mono-sm text-text-tertiary">{recipe.sourceDomain} · {t('recipe.ingredientCount', { count: recipe.ingredientCount })}</span>
                  </span>
                  <ArrowRight size={18} className="shrink-0 text-text-tertiary" aria-hidden="true" />
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  )
}
