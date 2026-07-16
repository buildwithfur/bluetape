import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWikiTargetMap } from '@/data/hooks'
import { createMarkdownIt } from '@/lib/wiki'
import type { RenderEnv } from '@/types'
import { cn } from '@/lib/cn'
import './WikiLink.css'

/** Renders markdown content with [[wiki links]] resolved against the live
 * slug map. Wiki links render as navy underlined text; broken links get a
 * dashed underline so unmade pages are quiet but visible (DESIGN.md).
 */
export function Markdown({
  content,
  className,
  inline = false,
}: {
  content: string
  className?: string
  inline?: boolean
}) {
  const navigate = useNavigate()
  const targetMap = useWikiTargetMap()
  const md = useMemo(() => createMarkdownIt(), [])
  const env: RenderEnv = useMemo(() => ({ targetMap }), [targetMap])
  const html = useMemo(
    () => inline ? md.renderInline(content, env) : md.render(content, env),
    [md, env, content, inline],
  )

  const classes = cn(
    // Prose-free: hand-rolled typography per DESIGN.md, no nested boxes.
    inline ? 'text-inherit' : 'prose-capped text-[17px] leading-[1.6] text-text-primary',
    !inline && '[&_p]:my-3 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0',
    '[&_strong]:font-semibold [&_strong]:text-ink',
    '[&_a:not(.wikilink)]:text-ink-700 [&_a:not(.wikilink)]:underline [&_a:not(.wikilink)]:underline-offset-2',
    !inline && '[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5',
    !inline && '[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5',
    !inline && '[&_li]:my-1',
    !inline && '[&_h1]:text-h1 [&_h1]:font-semibold [&_h1]:mt-6 [&_h1]:mb-3',
    !inline && '[&_h2]:text-h2 [&_h2]:font-semibold [&_h2]:mt-5 [&_h2]:mb-2',
    !inline && '[&_h3]:text-[18px] [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1',
    '[&_code]:mono-md [&_code]:bg-surface-active [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded-xs',
    !inline && '[&_blockquote]:border-l-2 [&_blockquote]:border-border-strong [&_blockquote]:pl-4 [&_blockquote]:text-text-secondary',
    className,
  )

  function handleClick(event: React.MouseEvent<HTMLSpanElement | HTMLDivElement>) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) return

    const target = event.target
    if (!(target instanceof Element)) return
    const link = target.closest<HTMLAnchorElement>('a.wikilink')
    const href = link?.getAttribute('href')
    if (!link || !href || !href.startsWith('/') || href.startsWith('//')) return

    event.preventDefault()
    navigate(href)
  }

  if (inline) {
    return <span className={classes} onClick={handleClick} dangerouslySetInnerHTML={{ __html: html }} />
  }

  return (
    <div
      className={classes}
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
