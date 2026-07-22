import { useState } from 'react'
import { Plus, Trash } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

export type RecipeSectionDraft = { name: string; ingredients: string[]; steps: string[] }
export type RecipeDraft = { title: string; sections: RecipeSectionDraft[]; notes: string }

export function RecipeEditor({ initial, sourceUrl, sourceLabel, sourceNote, saving, onSave }: {
  initial: RecipeDraft; sourceUrl: string; sourceLabel: string; sourceNote?: string; saving: boolean; onSave: (draft: RecipeDraft) => Promise<void>
}) {
  const { t } = useTranslation()
  const [title, setTitle] = useState(initial.title)
  const [sections, setSections] = useState(initial.sections.length ? initial.sections : [{ name: '', ingredients: [''], steps: [''] }])
  const [notes, setNotes] = useState(initial.notes)
  const [error, setError] = useState<string | null>(null)
  function update(sectionIndex: number, field: 'name' | 'ingredients' | 'steps', value: string, row?: number) {
    setSections(current => current.map((section, index) => {
      if (index !== sectionIndex) return section
      if (field === 'name') return { ...section, name: value }
      return { ...section, [field]: section[field].map((item, itemIndex) => itemIndex === row ? value : item) }
    }))
  }
  function addRow(sectionIndex: number, field: 'ingredients' | 'steps') { setSections(current => current.map((s, i) => i === sectionIndex ? { ...s, [field]: [...s[field], ''] } : s)) }
  function removeRow(sectionIndex: number, field: 'ingredients' | 'steps', row: number) { setSections(current => current.map((s, i) => i === sectionIndex ? { ...s, [field]: s[field].filter((_, j) => j !== row) } : s)) }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(null)
    const cleaned = sections.map(s => ({ name: s.name.trim(), ingredients: s.ingredients.map(x => x.trim()).filter(Boolean), steps: s.steps.map(x => x.trim()).filter(Boolean) })).filter(s => s.name || s.ingredients.length || s.steps.length)
    if (!title.trim() || !cleaned.some(s => s.ingredients.length) || !cleaned.some(s => s.steps.length)) { setError(t('recipe.review.required')); return }
    try { await onSave({ title: title.trim(), sections: cleaned, notes: notes.trim() }) } catch { setError(t('recipe.saveFailed')) }
  }
  return <form onSubmit={submit} className="page-px pb-10 pt-5">
    <h1 className="text-[28px] font-semibold text-ink">{t('recipe.review.title')}</h1><p className="mt-2 text-text-secondary">{t('recipe.review.hint')}</p>
    <label className="mt-6 block"><span className="label-caps text-text-tertiary">{t('recipe.field.title')}</span><input value={title} onChange={e => setTitle(e.target.value)} className="mt-2 h-12 w-full rounded-xs border border-border-line bg-surface px-3 text-ink" /></label>
    {sections.map((section, sectionIndex) => <section key={sectionIndex} className="mt-8 border-t border-border-subtle pt-5">
      <div className="flex gap-2"><input value={section.name} placeholder={t('recipe.componentName')} onChange={e => update(sectionIndex, 'name', e.target.value)} className="h-11 min-w-0 flex-1 rounded-xs border border-border-line bg-surface px-3 text-ink" /><button type="button" onClick={() => setSections(s => s.filter((_, i) => i !== sectionIndex))} className="size-11 text-text-tertiary"><Trash size={18}/></button></div>
      <h2 className="label-caps mt-5 text-text-tertiary">{t('recipe.ingredients')}</h2>{section.ingredients.map((value, row) => <div key={row} className="mt-2 flex gap-2"><input value={value} onChange={e => update(sectionIndex, 'ingredients', e.target.value, row)} className="h-11 min-w-0 flex-1 rounded-xs border border-border-line bg-surface px-3 text-ink"/><button type="button" onClick={() => removeRow(sectionIndex, 'ingredients', row)} className="size-11"><Trash size={16}/></button></div>)}<button type="button" onClick={() => addRow(sectionIndex, 'ingredients')} className="mt-2 min-h-11 text-sm text-ink-700"><Plus size={16} className="inline"/> {t('recipe.addIngredient')}</button>
      <h2 className="label-caps mt-5 text-text-tertiary">{t('recipe.steps')}</h2>{section.steps.map((value, row) => <div key={row} className="mt-2 flex gap-2"><textarea value={value} onChange={e => update(sectionIndex, 'steps', e.target.value, row)} rows={3} className="min-w-0 flex-1 rounded-xs border border-border-line bg-surface px-3 py-2 text-ink"/><button type="button" onClick={() => removeRow(sectionIndex, 'steps', row)} className="size-11"><Trash size={16}/></button></div>)}<button type="button" onClick={() => addRow(sectionIndex, 'steps')} className="mt-2 min-h-11 text-sm text-ink-700"><Plus size={16} className="inline"/> {t('recipe.addStep')}</button>
    </section>)}
    <button type="button" onClick={() => setSections(s => [...s, { name: '', ingredients: [''], steps: [''] }])} className="mt-5 min-h-11 text-sm text-ink-700"><Plus size={16} className="inline"/> {t('recipe.addComponent')}</button>
    <label className="mt-8 block border-t border-border-subtle pt-5"><span className="label-caps text-text-tertiary">{t('record.note')}</span><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} className="mt-2 w-full rounded-xs border border-border-line bg-surface px-3 py-2 text-ink" /></label>
    <section className="mt-8 border-t border-border-subtle pt-5"><h2 className="label-caps text-text-tertiary">{t('recipe.source')}</h2><a href={sourceUrl} target="_blank" rel="noreferrer" className="mt-2 block text-sm text-ink-700 underline">{sourceLabel}</a>{sourceNote && <p className="mt-1 text-sm text-text-secondary">{sourceNote}</p>}</section>
    {error && <p role="alert" className="mt-4 text-sm text-error-text">{error}</p>}<button type="submit" disabled={saving} className="mt-6 min-h-12 w-full rounded-xs bg-accent text-text-on-accent">{saving ? t('recipe.saving') : t('recipe.save')}</button>
  </form>
}
