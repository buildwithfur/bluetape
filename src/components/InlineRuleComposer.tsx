import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowUp, Plus, X } from '@phosphor-icons/react'
import { useSavePage } from '@/data/hooks'

/** Inline, admin-gated rule creation for the Rules catalogue. */
export function InlineRuleComposer() {
  const { t } = useTranslation()
  const savePage = useSavePage()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)

  function reset() {
    setTitle('')
    setSaveFailed(false)
    setOpen(false)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const trimmedTitle = title.trim()
    if (!trimmedTitle || saving) return

    setSaving(true)
    setSaveFailed(false)
    try {
      await savePage({
        title: trimmedTitle,
        type: 'rule',
        content: '',
      })
      reset()
    } catch {
      setSaveFailed(true)
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <li className="border-b border-border-subtle last:border-b-0">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="page-px flex min-h-14 w-full items-center gap-3 text-left text-[16px] text-text-tertiary transition hover:bg-surface-hover active:bg-surface-active"
        >
          <span className="flex h-11 w-11 items-center justify-center text-accent" aria-hidden="true">
            <Plus size={19} weight="bold" />
          </span>
          {t('rule.add')}
        </button>
      </li>
    )
  }

  return (
    <li className="border-b border-border-subtle bg-surface last:border-b-0">
      <form onSubmit={submit} className="page-px py-3">
        <label className="sr-only" htmlFor="inline-rule-title">
          {t('rule.add')}
        </label>
        <input
          id="inline-rule-title"
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t('rule.titlePlaceholder')}
          className="h-11 w-full bg-transparent text-[17px] text-text-primary placeholder:text-text-disabled focus:outline-none"
        />

        {saveFailed && (
          <p className="mt-2 text-sm text-error-text" role="alert">
            {t('common.saveFailed')}
          </p>
        )}

        <div className="mt-2 flex items-center gap-2">
          <span className="flex-1" />
          <button
            type="button"
            onClick={reset}
            aria-label={t('action.cancel')}
            className="flex h-10 w-10 items-center justify-center rounded-xs text-text-secondary transition hover:bg-surface-hover active:scale-95"
          >
            <X size={20} aria-hidden="true" />
          </button>
          <button
            type="submit"
            disabled={!title.trim() || saving}
            aria-label={t('action.add')}
            className="flex h-10 w-10 items-center justify-center rounded-xs bg-accent text-text-on-accent transition hover:bg-accent-hover active:scale-95 disabled:bg-accent-soft disabled:text-text-on-accent"
          >
            <ArrowUp size={20} weight="bold" aria-hidden="true" />
          </button>
        </div>
      </form>
    </li>
  )
}
