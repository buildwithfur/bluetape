import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { LinkSimple } from '@phosphor-icons/react'
import { useAllPages } from '@/data/hooks'
import type { Doc } from '@convex/_generated/dataModel'

function normalizedWords(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/\[\[[^\]]+\]\]/g, ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 2)
}

function editDistance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    const current = [leftIndex]
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const substitution = previous[rightIndex - 1] +
        (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        substitution,
      )
    }
    previous = current
  }
  return previous[right.length]
}

function suggestionScore(value: string, page: Doc<'pages'>): number {
  const plainValue = value.toLowerCase().replace(/\[\[[^\]]+\]\]/g, ' ')
  const title = page.title.toLowerCase()
  if (plainValue.includes(title)) return 100 + title.length
  if (title.includes(plainValue.trim())) return 80 + plainValue.trim().length

  const inputWords = new Set(normalizedWords(value))
  const titleWords = normalizedWords(page.title)
  const overlap = titleWords.filter((word) => inputWords.has(word)).length
  if (overlap > 0) return overlap * 10 + titleWords.length
  const partial = [...inputWords].some((inputWord) =>
    titleWords.some((titleWord) => titleWord.startsWith(inputWord)),
  )
  if (partial) return 5

  const fuzzy = [...inputWords].some((inputWord) =>
    titleWords.some((titleWord) => {
      const tolerance = titleWord.length <= 5 ? 1 : 2
      return editDistance(inputWord, titleWord) <= tolerance
    }),
  )
  return fuzzy ? 3 : 0
}

function openWikiQuery(value: string): string | null {
  const lastOpen = value.lastIndexOf('[[')
  const lastClose = value.lastIndexOf(']]')
  if (lastOpen <= lastClose) return null
  return value.slice(lastOpen + 2).trim()
}

type MatchRange = { start: number; end: number }

type TextToken = MatchRange & { value: string }

function unlinkedTokens(value: string): TextToken[] {
  const linkedRanges = [...value.matchAll(/\[\[[^\]]*\]\]/g)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }))
  return [...value.matchAll(/[\p{L}\p{N}]+/gu)]
    .map((match) => ({
      value: match[0].toLowerCase(),
      start: match.index,
      end: match.index + match[0].length,
    }))
    .filter((token) =>
      !linkedRanges.some((range) => token.start >= range.start && token.end <= range.end),
    )
}

/**
 * Passive autocomplete only considers a trailing phrase that reaches the end
 * of the input. This makes the replacement range deterministic and ensures a
 * suggestion disappears as soon as the user starts a different phrase.
 */
function passiveMatch(
  value: string,
  page: Doc<'pages'>,
): (MatchRange & { score: number }) | null {
  const tokens = unlinkedTokens(value)
  const lastToken = tokens.at(-1)
  if (!lastToken || lastToken.end !== value.length || lastToken.value.length < 2) {
    return null
  }

  const title = page.title.toLowerCase()
  const titleWords = normalizedWords(page.title)
  const suffixes = [3, 2, 1]
  for (const length of suffixes) {
    if (tokens.length < length) continue
    const phraseTokens = tokens.slice(-length)
    const phrase = phraseTokens.map((token) => token.value).join(' ')
    if (!title.includes(phrase)) continue

    if (length === 1) {
      const firstTitleWord = titleWords[0] ?? ''
      const isShortTitle = titleWords.length <= 2
      const matchesTitleStart = firstTitleWord.startsWith(phrase)
      const fuzzyTitleStart = editDistance(phrase, firstTitleWord) <= 1
      if (!isShortTitle && !matchesTitleStart && !fuzzyTitleStart) continue
    }

    return {
      start: phraseTokens[0].start,
      end: lastToken.end,
      score: 100 + length * 20 + phrase.length,
    }
  }

  if (titleWords.length <= 2) {
    const firstTitleWord = titleWords[0] ?? ''
    const tolerance = firstTitleWord.length <= 5 ? 1 : 2
    if (editDistance(lastToken.value, firstTitleWord) <= tolerance) {
      return {
        start: lastToken.start,
        end: lastToken.end,
        score: 50 + lastToken.value.length,
      }
    }
  }
  return null
}

function insertWikiLink(value: string, title: string, range: MatchRange | null): string {
  const lastOpen = value.lastIndexOf('[[')
  const lastClose = value.lastIndexOf(']]')
  if (lastOpen > lastClose) {
    return `${value.slice(0, lastOpen)}[[${title}]]`
  }
  if (range) {
    return `${value.slice(0, range.start)}[[${title}]]${value.slice(range.end)}`
  }
  const spacer = value.length > 0 && !value.endsWith(' ') ? ' ' : ''
  return `${value}${spacer}[[${title}]]`
}

/** Suggest existing item/rule records while wiki-capable text is authored. */
export function WikiLinkSuggestions({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const pages = useAllPages()
  const matches = useMemo(() => {
    if (!pages) return []
    const explicitQuery = openWikiQuery(value)
    const alreadyLinked = value.toLowerCase()
    return pages
      .map((page) => {
        if (explicitQuery !== null) {
          return {
            page,
            range: null,
            score: explicitQuery === '' ? 1 : suggestionScore(explicitQuery, page),
          }
        }
        const match = passiveMatch(value, page)
        return {
          page,
          range: match ? { start: match.start, end: match.end } : null,
          score: match?.score ?? 0,
        }
      })
      .filter(
        ({ page, score }) =>
          score > 0 && !alreadyLinked.includes(`[[${page.title.toLowerCase()}]]`),
      )
      .sort((a, b) => b.score - a.score || a.page.title.localeCompare(b.page.title))
      .slice(0, 5)
  }, [pages, value])

  if (matches.length === 0) return null

  return (
    <div
      className="overflow-hidden rounded-xs border border-border-line bg-surface-floating shadow-[0_8px_24px_rgba(10,41,80,0.10)]"
      aria-label={t('wiki.suggestions')}
    >
      <div className="label-caps border-b border-border-subtle px-3 py-2 text-text-tertiary">
        {t('wiki.suggestions')}
      </div>
      {matches.map(({ page, range }) => (
        <button
          key={page._id}
          type="button"
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => onChange(insertWikiLink(value, page.title, range))}
          className="flex min-h-11 w-full items-center gap-3 border-b border-border-subtle px-3 py-2 text-left last:border-b-0 hover:bg-surface-hover active:bg-surface-active"
        >
          <LinkSimple size={17} className="shrink-0 text-ink-700" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-[15px] text-text-primary">
            {page.title}
          </span>
          <span className="mono-sm shrink-0 text-text-tertiary">
            {t(`wiki.type.${page.type}`)}
          </span>
        </button>
      ))}
    </div>
  )
}
