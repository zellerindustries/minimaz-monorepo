import { describe, expect, it } from 'vitest'
import { minifyJs } from '../minify.js'

describe('minifyJs', () => {
    it('strips a line comment', () => {
        expect(minifyJs('const a = 1 // note\nconst b = 2')).toBe('const a = 1\nconst b = 2')
    })

    it('strips a block comment', () => {
        expect(minifyJs('/* block */\nlet x = 1')).toBe('let x = 1')
    })

    it('strips an unterminated block comment to the end of input', () => {
        expect(minifyJs('a()\n/* never closed')).toBe('a()')
    })

    it('keeps comment-like text inside a double-quoted string', () => {
        expect(minifyJs('const s = "// not a comment"')).toBe('const s = "// not a comment"')
    })

    it('keeps comment-like text inside a single-quoted string with an escaped quote', () => {
        expect(minifyJs("const c = 'it\\'s // x'")).toBe("const c = 'it\\'s // x'")
    })

    it('strips a comment inside a template expression but keeps // in the template text', () => {
        expect(minifyJs('const t = `a ${b /* c */} // d`')).toBe('const t = `a ${b } // d`')
    })

    it('tracks nested braces inside a template expression', () => {
        expect(minifyJs('const u = `x ${ {a: 1}.a } y`')).toBe('const u = `x ${ {a: 1}.a } y`')
    })

    it('keeps a regex literal containing escaped slashes intact', () => {
        expect(minifyJs('const r = /\\/\\/ab/g.test(x)')).toBe('const r = /\\/\\/ab/g.test(x)')
    })

    it('keeps a slash inside a regex character class and strips the trailing comment', () => {
        expect(minifyJs('const r = /[/]/.test(x) // c')).toBe('const r = /[/]/.test(x)')
    })

    it('treats slashes between identifiers as division', () => {
        expect(minifyJs('const d = a / b / c')).toBe('const d = a / b / c')
    })

    it('never joins a line after return, preserving automatic semicolon insertion', () => {
        expect(minifyJs('return\n{ a: 1 }')).toBe('return\n{ a: 1 }')
    })

    it('trims each line and collapses runs of blank lines to one', () => {
        expect(minifyJs('  a()\n\n\n\n  b()  ')).toBe('a()\n\nb()')
    })

    it('keeps hex, exponent and BigInt numeric literals intact', () => {
        expect(minifyJs('const n = 0x1F + 1e-3 + 10n')).toBe('const n = 0x1F + 1e-3 + 10n')
    })

    it('rejects a non-string input', () => {
        expect(() => minifyJs(null as unknown as string)).toThrow('minifyJs: code must be a string')
    })
})
