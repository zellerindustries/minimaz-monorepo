import { describe, expect, it } from 'vitest'
import { minifyCss } from '../minify.js'

describe('minifyCss', () => {
    it('keeps the space before a colon so a descendant pseudo-class is not changed', () => {
        expect(minifyCss('a :hover { color: red; }')).toBe('a :hover{color:red}')
    })

    it('strips comments, collapses whitespace and drops the last semicolon', () => {
        expect(minifyCss('/* c */ body {\n  margin: 0 ;\n  padding: 0;\n}')).toBe(
            'body{margin:0;padding:0}',
        )
    })

    it('keeps string contents verbatim, including braces and spaces', () => {
        expect(minifyCss('a::before { content: "  { spaced }  "; }')).toBe(
            'a::before{content:"  { spaced }  "}',
        )
    })

    it('keeps an escaped quote inside a string', () => {
        expect(minifyCss("a { content: 'it\\'s' }")).toBe("a{content:'it\\'s'}")
    })

    it('keeps single spaces around combinators and inside calc()', () => {
        expect(minifyCss('.a,  .b  >  .c { top: calc(1px + 2px); }')).toBe(
            '.a,.b > .c{top:calc(1px + 2px)}',
        )
    })

    it('minifies inside at-rules', () => {
        expect(minifyCss('@media (max-width: 600px) { a { b: c } }')).toBe(
            '@media (max-width:600px){a{b:c}}',
        )
    })

    it('drops a semicolon directly before a closing brace', () => {
        expect(minifyCss('a{b:c;}')).toBe('a{b:c}')
    })

    it('rejects a non-string input', () => {
        expect(() => minifyCss(undefined as unknown as string)).toThrow(
            'minifyCss: code must be a string',
        )
    })
})
