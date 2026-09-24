import { describe, expect, it } from 'vitest'
import { transpileTs } from '../transpile.js'

describe('transpileTs', () => {
    it('strips type annotations and interfaces', () => {
        const out = transpileTs('const a: number = 1; interface X { y: string }')

        expect(out).toContain('const a = 1;')
        expect(out).not.toContain('number')
        expect(out).not.toContain('interface')
    })

    it('does not type-check, so a type error still transpiles', () => {
        expect(transpileTs('const a: number = "x"')).toContain('const a = "x";')
    })

    it('transforms JSX when jsx is enabled', () => {
        expect(transpileTs('const e = <div />', { jsx: true })).toContain(
            'React.createElement("div", null)',
        )
    })

    it('treats JSX as a syntax error without the jsx option', () => {
        expect(() => transpileTs('const e = <div />')).toThrow(/^transpileTs: syntax error/)
    })

    it('lists the diagnostic messages in the thrown error', () => {
        expect(() => transpileTs('let a: = 1')).toThrow(
            'transpileTs: syntax error(s):\nType expected.',
        )
    })

    it('rejects a non-string input', () => {
        expect(() => transpileTs(1 as unknown as string)).toThrow(
            'transpileTs: code must be a string',
        )
    })
})
