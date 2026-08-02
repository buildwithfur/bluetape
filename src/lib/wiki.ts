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

const ORDERED_LIST_RE = /^(\s*)(\d+)[.)]\s+(.*)$/
const BULLET_LIST_RE = /^(\s*)[-+*]\s+(.*)$/
const ALPHA_LIST_RE = /^(\s*)([a-zA-Z])[.)]\s+(.*)$/
const FENCE_RE = /^\s*(`{3,}|~{3,})/

type PreviousListLine = {
  kind: 'ordered' | 'bullet' | 'alpha' | 'other'
  rawIndent: number
  indent: number
  marker: number
}

type AlphaList = {
  parentIndent: number
  parentMarker: number
  indent: number
}

/**
 * Make common pasted household lists render as Markdown lists.
 *
 * markdown-it follows CommonMark: `a.` is paragraph text, and four leading
 * spaces create a code block. Both patterns are common when rules are pasted
 * from a document, so we normalize only list-looking lines before rendering:
 * lettered items become a nested ordered list (styled as lower-alpha), while
 * indented numbered lines without a list parent are dedented out of code.
 * Stored content is unchanged; this only affects the rendered view.
 */
export function normalizeMarkdownLists(content: string): string {
  const lines = content.replace(/\r\n?/g, '\n').split('\n')
  const output: string[] = []
  let inFence = false
  let previous: PreviousListLine | null = null
  let alphaList: AlphaList | null = null

  for (const line of lines) {
    const fence = FENCE_RE.exec(line)
    if (fence) {
      inFence = !inFence
      alphaList = null
      previous = null
      output.push(line)
      continue
    }

    if (inFence || line.trim() === '') {
      output.push(line)
      continue
    }

    const ordered = ORDERED_LIST_RE.exec(line)
    if (ordered) {
      const rawIndent = ordered[1].length
      const marker = Number(ordered[2])
      let indent = rawIndent

      // A numbered item that continues the outer list after a pasted alpha
      // sublist should not remain accidentally nested under that sublist.
      if (
        alphaList &&
        alphaList.parentMarker > 0 &&
        marker === alphaList.parentMarker + 1 &&
        rawIndent > alphaList.parentIndent
      ) {
        indent = alphaList.parentIndent
      } else if (rawIndent >= 4) {
        // Keep genuine nested lists (the previous list marker is less
        // indented), but dedent standalone indented numbered lines that would
        // otherwise become a code block.
        const hasListParent = previous &&
          (previous.kind === 'ordered' || previous.kind === 'bullet') &&
          (previous.rawIndent < rawIndent ||
            (previous.rawIndent === rawIndent && previous.indent === rawIndent))
        if (!hasListParent) indent = Math.max(0, rawIndent - 4)
      }

      output.push(`${' '.repeat(indent)}${marker}. ${ordered[3]}`)
      previous = { kind: 'ordered', rawIndent, indent, marker }
      alphaList = null
      continue
    }

    const bullet = BULLET_LIST_RE.exec(line)
    if (bullet) {
      const rawIndent = bullet[1].length
      output.push(line)
      previous = { kind: 'bullet', rawIndent, indent: rawIndent, marker: 0 }
      alphaList = null
      continue
    }

    const alpha = ALPHA_LIST_RE.exec(line)
    if (alpha) {
      const rawIndent = alpha[1].length
      const letterMarker = alpha[2].toLowerCase().charCodeAt(0) - 96
      const parent = previous &&
        (previous.kind === 'ordered' || previous.kind === 'bullet')

      if (alphaList || parent) {
        const currentList: AlphaList = alphaList ?? {
          parentIndent: previous?.indent ?? 0,
          parentMarker: previous?.kind === 'ordered' ? previous.marker : 0,
          indent: (previous?.indent ?? 0) + 4,
        }
        output.push(`${' '.repeat(currentList.indent)}${letterMarker}. ${alpha[3]}`)
        alphaList = currentList
        previous = { kind: 'alpha', rawIndent, indent: currentList.indent, marker: letterMarker }
        continue
      }
    }

    output.push(line)
    previous = { kind: 'other', rawIndent: line.length - line.trimStart().length, indent: 0, marker: 0 }
    alphaList = null
  }

  return output.join('\n')
}

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
      const collection = resolved.type === 'item'
        ? 'notes'
        : resolved.type === 'rule'
          ? 'rules'
          : 'recipes'
      return `<a class="wikilink" href="/${collection}/${resolved.id}">${escapeHtml(display)}</a>`
    }
    if (target.toLowerCase().startsWith('page:') || target.toLowerCase().startsWith('recipe:')) {
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
): { id: string; type: 'item' | 'rule' | 'recipe'; slug?: string; title: string } | null {
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
  recipes: Array<{ _id: string; title: string }> = [],
): string {
  const titlesById = new Map(pages.map((page) => [page._id, page.title]))
  const recipeTitlesById = new Map(recipes.map((recipe) => [recipe._id, recipe.title]))
  const pagesExpanded = content.replace(
    /\[\[page:([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (original, rawId, rawLabel) => {
      const title = titlesById.get(String(rawId).trim())
      if (!title) return original
      const label = String(rawLabel || title).trim()
      return label === title ? `[[${title}]]` : `[[${title}|${label}]]`
    },
  )
  return pagesExpanded.replace(
    /\[\[recipe:([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (original, rawId, rawLabel) => {
      const title = recipeTitlesById.get(String(rawId).trim())
      if (!title) return original
      const label = String(rawLabel || title).trim()
      return label === title ? `[[${title}]]` : `[[${title}|${label}]]`
    },
  )
}
