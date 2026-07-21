/** markdown-it setup + custom [[wiki link]] plugin.

 Per PLAN.md §7. The lexer rule runs before the built-in `link` rule and emits
 a `wiki_link` token carrying a stable page ID (or legacy title) + optional display label. The
 renderer resolves target → stable record route against an externally-supplied map and
 emits an <a> with a `broken` class when the target page doesn't exist (so
 unmade pages are quiet but visible, per DESIGN.md).
*/
import MarkdownIt from 'markdown-it'
import type { RenderEnv } from '@/types'

const WIKI_RE = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/

/** Build a configured markdown-it instance with the wiki-link rule. */
export function createMarkdownIt(): MarkdownIt {
  const md = new MarkdownIt({
    html: false,
    linkify: false,
    breaks: true,
    typographer: true,
  })

  // Inline rule must run before `link` so [[ ]] wins over plain linkified text.
  md.inline.ruler.before('link', 'wiki_link', (state, silent) => {
    if (state.src[state.pos] !== '[' || state.src[state.pos + 1] !== '[') return false
    const max = state.posMax
    const rest = state.src.slice(state.pos, max)
    const match = WIKI_RE.exec(rest)
    if (!match) return false

    if (!silent) {
      const target = match[1].trim()
      const label = match[2]?.trim()
      const token = state.push('wiki_link', '', 0)
      token.meta = { target, label }
      token.markup = '[['
    }
    state.pos += match[0].length
    return true
  })

  md.renderer.rules.wiki_link = (tokens, idx, _opts, env: RenderEnv) => {
    const t = tokens[idx]
    const { target, label } = t.meta as { target: string; label?: string }

    const resolved = resolveWikiTarget(target, env)
    const display = label && label.length ? label : resolved?.title ?? target
    if (resolved) {
      const collection = resolved.type === 'item' ? 'notes' : 'rules'
      return `<a class="wikilink" href="/${collection}/${resolved.id}">${escapeHtml(display)}</a>`
    }
    if (target.toLowerCase().startsWith('page:')) {
      return `<span class="wikilink broken">${escapeHtml(display)}</span>`
    }
    // Broken link — propose creation. Surface-floating action target.
    const enc = encodeURIComponent(target)
    return `<a class="wikilink broken" href="/p/new?title=${enc}">${escapeHtml(display)}</a>`
  }

  // Wiki links inside their own <a> must not double-linkify.
  md.core.ruler.after('normalize', 'disable_linkify_in_wiki', (state) => {
    state.tokens.forEach((tok) => {
      if (tok.type === 'inline' && tok.children) {
        // no-op: linkify is already off; kept for clarity
      }
    })
    return true
  })

  return md
}

function resolveWikiTarget(
  target: string,
  env: RenderEnv | undefined,
): { id: string; type: 'item' | 'rule'; slug: string; title: string } | null {
  if (!env?.targetMap) return null
  const map = env.targetMap
  // Case-insensitive title resolution (PLAN.md §7 Edge cases).
  const key = target.trim().toLowerCase()
  return map[key] ?? null
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Extract unique [[targets]] from markdown content (for link persistence UI). */
export function extractWikiLinks(content: string): string[] {
  const out: string[] = []
  let i = 0
  while (i < content.length) {
    if (content[i] === '[' && content[i + 1] === '[') {
      const end = content.indexOf(']]', i + 2)
      if (end === -1) break
      const inner = content.slice(i + 2, end)
      const target = inner.split('|')[0].trim()
      if (target) out.push(target)
      i = end + 2
    } else {
      i++
    }
  }
  return Array.from(new Set(out.map((t) => t)))
}

/** Plain-text form for native share sheets and non-rich search rows. */
export function wikiPlainText(content: string): string {
  return content.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, label) =>
    String(label || target).trim(),
  )
}

/** Convert stored ID tokens back to friendly title tokens for an editor. */
export function wikiAuthoringText(
  content: string,
  pages: Array<{ _id: string; title: string }>,
): string {
  const titlesById = new Map(pages.map((page) => [page._id, page.title]))
  return content.replace(
    /\[\[page:([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (original, rawId, rawLabel) => {
      const title = titlesById.get(String(rawId).trim())
      if (!title) return original
      const label = String(rawLabel || title).trim()
      return label === title ? `[[${title}]]` : `[[${title}|${label}]]`
    },
  )
}
