import { useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import { WikiLinkSuggestions } from '@/components/WikiLinkSuggestions'

export type RecipeDraft = {
  title: string
  ingredients: string[]
  steps: string[]
}

export function RecipeEditor({
  initial,
  sourceUrl,
  sourceLabel,
  saving,
  onSave,
}: {
  initial: RecipeDraft
  sourceUrl: string
  sourceLabel: string
  saving: boolean
  onSave: (draft: RecipeDraft) => Promise<void>
}) {
  const { t } = useTranslation()
  const [title, setTitle] = useState(initial.title)
  const [ingredients, setIngredients] = useState(initial.ingredients.length ? initial.ingredients : [''])
  const [steps, setSteps] = useState(initial.steps.length ? initial.steps : [''])
  const [error, setError] = useState<string | null>(null)

  function updateRow(kind: 'ingredients' | 'steps', index: number, value: string) {
    const setter = kind === 'ingredients' ? setIngredients : setSteps
    setter((rows) => rows.map((row, rowIndex) => rowIndex === index ? value : row))
  }

  function removeRow(kind: 'ingredients' | 'steps', index: number) {
    const setter = kind === 'ingredients' ? setIngredients : setSteps
    setter((rows) => {
      const next = rows.filter((_, rowIndex) => rowIndex !== index)
      return next.length ? next : ['']
    })
  }

  function moveStep(index: number, direction: -1 | 1) {
    setSteps((rows) => {
      const destination = index + direction
      if (destination < 0 || destination >= rows.length) return rows
      const next = [...rows]
      ;[next[index], next[destination]] = [next[destination], next[index]]
      return next
    })
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    const cleanIngredients = ingredients.map((item) => item.trim()).filter(Boolean)
    const cleanSteps = steps.map((item) => item.trim()).filter(Boolean)
    if (!title.trim() || cleanIngredients.length === 0 || cleanSteps.length === 0) {
      setError(t('recipe.review.required'))
      return
    }
    try {
      await onSave({ title: title.trim(), ingredients: cleanIngredients, steps: cleanSteps })
    } catch {
      setError(t('recipe.saveFailed'))
    }
  }

  return (
    <form onSubmit={submit} className="page-px pb-10 pt-5">
      <div className="mb-6">
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink">
          {t('recipe.review.title')}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-text-secondary">
          {t('recipe.review.hint')}
        </p>
      </div>

      <label className="block">
        <span className="label-caps text-text-tertiary">{t('recipe.field.title')}</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="mt-2 h-12 w-full rounded-xs border border-border-line bg-surface px-3 text-[17px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </label>

      <section className="mt-8 border-t border-border-subtle pt-5">
        <h2 className="label-caps text-text-tertiary">{t('recipe.ingredients')}</h2>
        <div className="mt-3">
          {ingredients.map((ingredient, index) => (
            <div key={index} className="border-b border-border-subtle py-2">
              <div className="flex items-start gap-2">
                <input
                  value={ingredient}
                  onChange={(event) => updateRow('ingredients', index, event.target.value)}
                  aria-label={t('recipe.ingredientNumber', { number: index + 1 })}
                  className="h-11 min-w-0 flex-1 rounded-xs border border-border-line bg-surface px-3 text-[16px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
                <button
                  type="button"
                  onClick={() => removeRow('ingredients', index)}
                  aria-label={t('recipe.removeIngredient')}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-xs text-text-tertiary hover:bg-error-bg hover:text-error-accent"
                >
                  <Trash size={18} aria-hidden="true" />
                </button>
              </div>
              <div className="mt-1"><WikiLinkSuggestions value={ingredient} onChange={(value) => updateRow('ingredients', index, value)} /></div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setIngredients((rows) => [...rows, ''])}
          className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xs px-2 text-sm font-medium text-ink-700 hover:bg-surface-hover"
        >
          <Plus size={17} aria-hidden="true" /> {t('recipe.addIngredient')}
        </button>
      </section>

      <section className="mt-8 border-t border-border-subtle pt-5">
        <h2 className="label-caps text-text-tertiary">{t('recipe.steps')}</h2>
        <div className="mt-3">
          {steps.map((step, index) => (
            <div key={index} className="border-b border-border-subtle py-3">
              <div className="flex items-start gap-2">
                <span className="mono-md w-6 shrink-0 pt-3 text-text-tertiary">{index + 1}</span>
                <textarea
                  value={step}
                  onChange={(event) => updateRow('steps', index, event.target.value)}
                  aria-label={t('recipe.stepNumber', { number: index + 1 })}
                  rows={3}
                  className="min-w-0 flex-1 resize-y rounded-xs border border-border-line bg-surface px-3 py-2 text-[16px] leading-relaxed text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
                <div className="flex shrink-0 flex-col">
                  <button type="button" onClick={() => moveStep(index, -1)} disabled={index === 0} aria-label={t('recipe.moveStepUp')} className="inline-flex size-9 items-center justify-center rounded-xs text-text-tertiary enabled:hover:bg-surface-hover disabled:opacity-30"><ArrowUp size={16} /></button>
                  <button type="button" onClick={() => moveStep(index, 1)} disabled={index === steps.length - 1} aria-label={t('recipe.moveStepDown')} className="inline-flex size-9 items-center justify-center rounded-xs text-text-tertiary enabled:hover:bg-surface-hover disabled:opacity-30"><ArrowDown size={16} /></button>
                  <button type="button" onClick={() => removeRow('steps', index)} aria-label={t('recipe.removeStep')} className="inline-flex size-9 items-center justify-center rounded-xs text-text-tertiary hover:bg-error-bg hover:text-error-accent"><Trash size={16} /></button>
                </div>
              </div>
              <div className="ml-8 mt-1"><WikiLinkSuggestions value={step} onChange={(value) => updateRow('steps', index, value)} /></div>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setSteps((rows) => [...rows, ''])} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xs px-2 text-sm font-medium text-ink-700 hover:bg-surface-hover">
          <Plus size={17} aria-hidden="true" /> {t('recipe.addStep')}
        </button>
      </section>

      <section className="mt-8 border-t border-border-subtle pt-5">
        <h2 className="label-caps text-text-tertiary">{t('recipe.source')}</h2>
        <div className="mt-2 flex min-h-12 items-center justify-between gap-3">
          <span className="min-w-0 truncate mono-sm text-text-secondary">{sourceLabel}</span>
          <a href={sourceUrl} target="_blank" rel="noreferrer" className="shrink-0 rounded-xs px-2 py-2 text-sm font-medium text-ink-700 underline underline-offset-2">
            {t('recipe.openSource')}
          </a>
        </div>
      </section>

      {error && <p role="alert" className="mt-4 text-sm text-error-text">{error}</p>}
      <button type="submit" disabled={saving} className="mt-6 min-h-12 w-full rounded-xs bg-accent px-4 text-sm font-medium text-text-on-accent transition hover:bg-accent-hover disabled:opacity-50">
        {saving ? t('recipe.saving') : t('recipe.save')}
      </button>
    </form>
  )
}
