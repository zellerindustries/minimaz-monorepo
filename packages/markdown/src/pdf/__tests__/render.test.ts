import { describe, expect, it } from 'vitest'
import { parseMarkdown } from '../../parser.js'
import { margin, pageHeight, pageWidth } from '../config.js'
import { LayoutEngine } from '../layout.js'
import { renderPdf } from '../render.js'

function toPdf(markdown: string): string {
    const { document } = parseMarkdown(markdown)
    return renderPdf(document)
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

describe('LayoutEngine', () => {
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
