import { describe, expect, it, vi } from 'vitest'
import { formatJson, minifyJson, parseJson } from '../core.js'

describe('parseJson', () => {
    it('parses valid JSON', () => {
        expect(parseJson('{"a":[1,2],"b":null}')).toEqual({ a: [1, 2], b: null })
    })

    it('wraps a syntax error in a clear message, chaining the original as cause', () => {
        let caught: unknown
        try {
            parseJson('{a:1}')
        } catch (error: unknown) {
            caught = error
        }

        expect(caught).toBeInstanceOf(Error)
        expect((caught as Error).message).toMatch(/^parseJson: invalid JSON: /)
        expect((caught as Error).cause).toBeInstanceOf(SyntaxError)
    })

    it('stringifies a non-Error value thrown by JSON.parse', () => {
        vi.spyOn(JSON, 'parse').mockImplementation(() => {
            // eslint-disable-next-line @typescript-eslint/only-throw-error -- exercising the non-Error fallback
            throw 'plain failure'
        })

        expect(() => parseJson('{}')).toThrow('parseJson: invalid JSON: plain failure')
    })

    it('rejects a non-string input', () => {
        expect(() => parseJson(42 as unknown as string)).toThrow('parseJson: code must be a string')
    })
})

describe('minifyJson', () => {
    it('removes all insignificant whitespace but keeps string contents', () => {
        expect(minifyJson('{\n    "a": [ 1, 2 ],\n    "b": "x y"\n}')).toBe('{"a":[1,2],"b":"x y"}')
    })

    it('propagates the parse error for invalid input', () => {
        expect(() => minifyJson('{')).toThrow(/^parseJson: invalid JSON/)
    })
})

describe('formatJson', () => {
    it('indents with four spaces by default', () => {
        expect(formatJson('{"a":{"b":1}}')).toBe('{\n    "a": {\n        "b": 1\n    }\n}')
    })

    it('honors a custom indent', () => {
        expect(formatJson('{"a":1}', 2)).toBe('{\n  "a": 1\n}')
    })
})
