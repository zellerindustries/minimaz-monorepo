import { describe, expect, it } from 'vitest'
import { parseMarkdown } from '../../parser.js'
import { margin, pageHeight, pageWidth } from '../config.js'
import { LayoutEngine } from '../layout.js'
import { renderPdf } from '../render.js'
import type { Document, Inline } from '../../types.js'
import type { Word } from '../types.js'

function doc(children: Inline[]): Document {
    return { type: 'document', children: [{ type: 'paragraph', children }] }
}

function toPdf(markdown: string): string {
    const { document } = parseMarkdown(markdown)
    return renderPdf(document)
}

interface DrawnText {
    font: string
    x: number
    y: number
    text: string
}

function drawnTexts(pdf: string): DrawnText[] {
    return [...pdf.matchAll(/(\/F\d) \d+ Tf\n1 0 0 1 ([\d.]+) ([\d.]+) Tm\n\((.*)\) Tj/g)].map(
        (m): DrawnText => ({
            font: m[1] ?? '',
            x: Number(m[2]),
            y: Number(m[3]),
            text: m[4] ?? '',
        }),
    )
}

function fontOf(pdf: string, text: string): string | undefined {
    return drawnTexts(pdf).find((t) => t.text === text)?.font
}

describe('renderPdf', () => {
    it('produces a well-formed single-page PDF for simple content', () => {
        const pdf = toPdf('# Title\n\nSome paragraph text.')
        expect(pdf.startsWith('%PDF-1.4\n')).toBe(true)
        expect(pdf.endsWith('%%EOF')).toBe(true)
        expect(pdf).toContain('/Type /Catalog')
        expect(pdf).toContain('/Type /Pages')
        expect((pdf.match(/\/Type \/Page\b/g) ?? []).length).toBe(1)
        expect(pdf).toContain('/BaseFont /Courier')
    })

    it('stays byte-safe ASCII (ready for utf8-encoded writes)', () => {
        const pdf = toPdf('Café — “fancy quotes” and emoji 🎉')
        for (let i = 0; i < pdf.length; i++) {
            expect(pdf.charCodeAt(i)).toBeLessThanOrEqual(0x7e)
        }
        expect(pdf).toContain('?')
    })

    it('escapes parentheses and backslashes inside text-show operators', () => {
        const pdf = toPdf('Look at this (parenthetical) and a \\backslash')
        expect(pdf).toContain('\\(parenthetical\\)')
    })

    it('breaks content across multiple pages when it overflows one page', () => {
        const longDoc = Array.from(
            { length: 200 },
            (_, i) => `Paragraph number ${String(i)}.`,
        ).join('\n\n')
        const pdf = toPdf(longDoc)
        const pageCount = (pdf.match(/\/Type \/Page\b/g) ?? []).length
        expect(pageCount).toBeGreaterThan(1)
        const kidsMatch = /\/Kids \[([^\]]*)\]/.exec(pdf)
        expect(kidsMatch).not.toBeNull()
        const kidsCount = (kidsMatch?.[1]?.match(/\d+ 0 R/g) ?? []).length
        expect(kidsCount).toBe(pageCount)
    })

    it('does not throw for headings, lists, blockquotes, code, links, images and hr', () => {
        const markdown = [
            '# Heading',
            '',
            '- one',
            '- two',
            '',
            '> a quote',
            '',
            '```js',
            'const x = 1;',
            '```',
            '',
            '[link](https://example.com) and ![alt](img.png)',
            '',
            '---',
        ].join('\n')
        expect(() => toPdf(markdown)).not.toThrow()
    })

    it('splits words and code lines longer than a line so nothing crosses the right margin', () => {
        const long = 'x'.repeat(200)
        const pdf = toPdf(`${long}\n\n\`\`\`\n${long}\n\`\`\``)
        const ops = [...pdf.matchAll(/\/F\d (\d+) Tf\n1 0 0 1 ([\d.]+) [\d.]+ Tm\n\((.*)\) Tj/g)]
        expect(ops.length).toBeGreaterThan(2)
        let drawn = 0
        for (const [, size, x, text] of ops) {
            const right = Number(x) + (text ?? '').length * Number(size) * 0.6
            expect(right).toBeLessThanOrEqual(pageWidth - margin)
            drawn += (text ?? '').length
        }
        expect(drawn).toBe(400)
    })

    it('expands tabs to four spaces instead of replacing them with "?"', () => {
        const pdf = toPdf('```\na\tb\n```')
        expect(pdf).toContain('(a    b) Tj')
        expect(pdf).not.toContain('?')
    })

    it('never emits a trailing blank page when content ends at the bottom of a page', () => {
        for (let n = 1; n <= 80; n++) {
            const markdown = Array.from({ length: n }, () => '# H\n\ntext\n\n```\ncode\n```').join(
                '\n\n',
            )
            expect(toPdf(markdown)).not.toContain('/Length 0 ')
        }
    })
})

describe('renderPdf inline styles', () => {
    it('renders strong as bold, emphasis as italic and plain text as regular', () => {
        const pdf = toPdf('plain **strong** *em*')
        expect(fontOf(pdf, 'plain')).toBe('/F1')
        expect(fontOf(pdf, 'strong')).toBe('/F2')
        expect(fontOf(pdf, 'em')).toBe('/F3')
    })

    it('combines emphasis inside strong into bold-italic', () => {
        const pdf = toPdf('**bold *both* bold**')
        expect(fontOf(pdf, 'both')).toBe('/F4')
        expect(fontOf(pdf, 'bold')).toBe('/F2')
    })

    // The parser cannot nest strong inside emphasis (single-pass), so these hand-build the AST
    // to reach the renderer's remaining style-combination branches.
    it('combines strong inside emphasis into bold-italic', () => {
        const pdf = renderPdf(
            doc([
                {
                    type: 'emphasis',
                    children: [{ type: 'strong', children: [{ type: 'text', value: 'both' }] }],
                },
            ]),
        )
        expect(fontOf(pdf, 'both')).toBe('/F4')
    })

    it('keeps bold-italic when strong or emphasis is nested again', () => {
        const leaf: Inline = { type: 'text', value: 'x' }
        const nest = (first: 'strong' | 'emphasis', second: 'strong' | 'emphasis'): string =>
            renderPdf(
                doc([
                    {
                        type: first,
                        children: [{ type: second, children: [{ type: first, children: [leaf] }] }],
                    },
                ]),
            )
        expect(fontOf(nest('strong', 'emphasis'), 'x')).toBe('/F4')
        expect(fontOf(nest('emphasis', 'strong'), 'x')).toBe('/F4')
    })

    it('keeps plain bold when strong is nested inside strong', () => {
        const pdf = renderPdf(
            doc([
                {
                    type: 'strong',
                    children: [{ type: 'strong', children: [{ type: 'text', value: 'bb' }] }],
                },
            ]),
        )
        expect(fontOf(pdf, 'bb')).toBe('/F2')
    })

    it('renders inline code as text in the surrounding style', () => {
        const pdf = toPdf('use `npm` now')
        expect(drawnTexts(pdf).map((t) => t.text)).toEqual(['use', 'npm', 'now'])
    })

    it('renders headings in bold', () => {
        expect(fontOf(toPdf('# Title'), 'Title')).toBe('/F2')
    })

    it('renders a hard line break as a new line', () => {
        const pdf = toPdf('first  \nsecond')
        const [a, b] = drawnTexts(pdf)
        expect(a?.text).toBe('first')
        expect(b?.text).toBe('second')
        expect(b?.y).toBeLessThan(a?.y ?? 0)
        expect(b?.x).toBe(a?.x)
    })

    it('renders links and images as text with the url', () => {
        const pdf = toPdf('[site](http://x.io) ![pic](p.png)')
        expect(drawnTexts(pdf).map((t) => t.text)).toEqual([
            'site',
            '\\(http://x.io\\)',
            '[image:',
            'pic]',
            '\\(p.png\\)',
        ])
    })
})

describe('renderPdf lists', () => {
    it('draws ordered markers from the list start number', () => {
        const texts = drawnTexts(toPdf('3. three\n4. four')).map((t) => t.text)
        expect(texts).toEqual(['3.', 'three', '4.', 'four'])
    })

    it('draws bullet markers for unordered lists', () => {
        const texts = drawnTexts(toPdf('- one\n- two')).map((t) => t.text)
        expect(texts).toEqual(['-', 'one', '-', 'two'])
    })

    it('indents block children that follow the first paragraph of an item', () => {
        const drawn = drawnTexts(toPdf('- parent\n\n  ```\n  code\n  ```\n'))
        const parent = drawn.find((t) => t.text === 'parent')
        const code = drawn.find((t) => t.text === 'code')
        expect(parent).toBeDefined()
        expect(code).toBeDefined()
        expect(code?.x).toBeGreaterThan(parent?.x ?? 0)
    })

    it('renders a nested list under its parent item with extra indent', () => {
        const drawn = drawnTexts(toPdf('- outer\n  - inner'))
        const outer = drawn.find((t) => t.text === 'outer')
        const inner = drawn.find((t) => t.text === 'inner')
        expect(inner?.x).toBeGreaterThan(outer?.x ?? 0)
    })

    it('draws only the marker for an item whose first child is not a paragraph', () => {
        const drawn = drawnTexts(toPdf('- ```\n  code\n  ```\n- > quote'))
        expect(drawn.map((t) => t.text)).toEqual(['-', 'code', '-', 'quote'])
        const [marker, code] = drawn
        expect(code?.x).toBeGreaterThan(marker?.x ?? 0)
    })

    it('renders an empty item without throwing', () => {
        const pdf = toPdf('-\n- x')
        expect(drawnTexts(pdf).map((t) => t.text)).toContain('x')
    })
})

describe('renderPdf code blocks', () => {
    it('draws nothing for an empty code block and keeps empty lines as blank space', () => {
        expect(drawnTexts(toPdf('```\n```'))).toEqual([])
        const texts = drawnTexts(toPdf('```\na\n\nb\n```')).map((t) => t.text)
        expect(texts).toEqual(['a', 'b'])
    })
})

describe('LayoutEngine', () => {
    it('advances the cursor without drawing for an empty raw line', () => {
        const engine = new LayoutEngine()
        engine.addRawLine('', 10, 0, 'regular')
        engine.addRawLine('x', 10, 0, 'regular')
        engine.finish()
        const ops = engine.pages[0]?.ops ?? []
        expect(ops).toHaveLength(1)
        expect(ops[0]).toMatchObject({ type: 'text', text: 'x', y: pageHeight - margin - 14 })
    })

    it('skips undefined entries in a word line without drawing them', () => {
        const engine = new LayoutEngine()
        const line = new Array<Word>(3)
        line[0] = { text: 'ab', style: 'regular' }
        line[2] = { text: 'cd', style: 'bold' }
        engine.addWordLine(line, 10, 0)
        engine.finish()
        const ops = engine.pages[0]?.ops ?? []
        expect(ops).toHaveLength(2)
        const [first, second] = ops
        expect(first).toMatchObject({ type: 'text', text: 'ab', x: margin })
        // idx 1 is skipped before the gap advance, so only idx 2 adds one 6pt gap
        expect(second).toMatchObject({ type: 'text', text: 'cd', x: margin + 6 * 2 + 6 })
    })

    it('does not leave an empty page behind when a final gap overflows the page', () => {
        const engine = new LayoutEngine()
        engine.addRawLine('only line', 11, 0, 'regular')
        engine.addGap(pageHeight)
        engine.finish()
        expect(engine.pages).toHaveLength(1)
    })

    it('still produces one (empty) page for an empty document', () => {
        const engine = new LayoutEngine()
        engine.finish()
        expect(engine.pages).toHaveLength(1)
    })
})
