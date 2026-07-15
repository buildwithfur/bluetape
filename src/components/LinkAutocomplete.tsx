import { useEffect, useMemo, useState } from 'react'
import { useAllPages } from '@/data/hooks'
import type { Doc } from '@convex/_generated/dataModel'

/** Inline `[[` link autocomplete for the page editor (PLAN.md §6.3).
 * Watches the caret; when it immediately precedes an open `[[` with no
 * closing `]]`, shows existing page titles; selecting inserts
 * `[[Selected Title]]` and places the caret after.
 */
export function useLinkAutocomplete(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  value: string,
  setValue: (next: string) => void,
) {
  const pages = useAllPages()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [anchor, setAnchor] = useState<{ start: number; end: number } | null>(null)
  const [active, setActive] = useState(0)
  const [caret, setCaret] = useState(0)

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const all = (pages ?? []) as Doc<'pages'>[]
    return (q ? all.filter((p) => p.title.toLowerCase().includes(q)) : all)
      .slice(0, 6)
  }, [pages, query])

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    const pos = ta.selectionStart ?? value.length
    setCaret(pos)
    // Find the last `[[` before the caret that has no closing `]]` yet.
    const upto = value.slice(0, pos)
    const lastOpen = upto.lastIndexOf('[[')
    if (lastOpen === -1) {
      setOpen(false)
      return
    }
    const after = upto.slice(lastOpen + 2)
    if (after.includes(']]')) {
      setOpen(false)
      return
    }
    // Make sure the query has no newline (single-line link target).
    if (after.includes('\n')) {
      setOpen(false)
      return
    }
    setOpen(true)
    setQuery(after)
    setAnchor({ start: lastOpen, end: pos })
    setActive(0)
  }, [value, textareaRef, caret])

  function insert(page: Doc<'pages'>) {
    if (!anchor) return
    const before = value.slice(0, anchor.start)
    const after = value.slice(anchor.end)
    const inserted = `[[${page.title}]]`
    const next = before + inserted + after
    setValue(next)
    setOpen(false)
    requestAnimationFrame(() => {
      const ta = textareaRef.current
      if (!ta) return
      const pos = before.length + inserted.length
      ta.focus()
      ta.setSelectionRange(pos, pos)
    })
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!open || matches.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (a + 1) % matches.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (a - 1 + matches.length) % matches.length)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      insert(matches[active])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  return { open, matches, active, insert, onKeyDown }
}
