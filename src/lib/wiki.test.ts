import { describe, expect, it } from 'vitest'
import { createMarkdownIt, normalizeMarkdownLists } from './wiki'

describe('markdown list normalization', () => {
  it('turns a lettered sublist into nested Markdown and keeps the outer list going', () => {
    const content = [
      '11. Off days — remain contactable.',
      '12. Hygiene — wash your hands.',
      '',
      'a. Wash before handling kids.',
      'b. Wash before and after handling raw food.',
      '',
      '13. Take initiative.',
    ].join('\n')

    const html = createMarkdownIt().render(normalizeMarkdownLists(content))

    expect(html).toContain('<ol start="11">')
    expect(html).toContain('<ol>\n<li>Wash before handling kids.</li>')
    expect(html).toContain('<p>Take initiative.</p>')
    expect(html).not.toContain('<ol start="13">')
    expect(html).not.toContain('<p>a. Wash')
  })

  it('dedents standalone numbered lines that would otherwise render as code', () => {
    const content = ['    7. Sleep.', '', '    11. Off days.', '    12. Hygiene.'].join('\n')
    const normalized = normalizeMarkdownLists(content)

    expect(normalized).toBe('7. Sleep.\n\n11. Off days.\n12. Hygiene.')
    expect(createMarkdownIt().render(normalized)).not.toContain('<pre>')
  })

  it('preserves an intentionally indented numeric nested list', () => {
    const content = ['1. Parent.', '    1. Child.', '2. Next.'].join('\n')

    expect(normalizeMarkdownLists(content)).toBe(content)
  })

  it('preserves nested numeric items separated by blank lines', () => {
    const content = ['1. Parent.', '', '    1. First child.', '', '    2. Second child.', '', '2. Next.'].join('\n')

    expect(normalizeMarkdownLists(content)).toBe(content)
  })
})
