import { KnownError } from '@minimaz/logger'
import { describe, expect, it } from 'vitest'
import { CssValidationError, validateCss } from '../css.js'
import { ValidationError } from '../errors.js'
import { JsValidationError, validateJs } from '../js.js'
import { JsonValidationError, validateJson } from '../json.js'
import { TsValidationError, validateTs } from '../ts.js'

function captureError(run: () => void): unknown {
    try {
        run()
    } catch (error: unknown) {
        return error
    }
    return undefined
}

describe('validateCss', () => {
    it('accepts balanced CSS', () => {
        expect(() => {
            validateCss('a { b: c }')
        }).not.toThrow()
    })

    it('ignores braces inside a string', () => {
        expect(() => {
            validateCss('a { content: "}" }')
        }).not.toThrow()
    })

    it('reports unbalanced braces', () => {
        const error = captureError(() => {
            validateCss('a { b: c')
        })

        expect(error).toBeInstanceOf(CssValidationError)
        expect(error).toBeInstanceOf(ValidationError)
        expect(error).toBeInstanceOf(KnownError)
        expect((error as CssValidationError).errors).toEqual(['unbalanced braces (depth 1)'])
    })

    it('reports unbalanced parentheses', () => {
        const error = captureError(() => {
            validateCss('a { b: url(x }')
        })

        expect((error as CssValidationError).errors).toEqual(['unbalanced parentheses (depth 1)'])
    })

    it('collects every problem, not just the first', () => {
        const error = captureError(() => {
            validateCss('a { b: "x }')
        })

        expect((error as CssValidationError).errors).toEqual([
            'unterminated string literal',
            'unbalanced braces (depth 1)',
        ])
    })

    it('reports an unterminated comment', () => {
        const error = captureError(() => {
            validateCss('/* x')
        })

        expect((error as CssValidationError).errors).toEqual(['unterminated comment'])
    })

    it('does not catch a closing brace before its opening one (documented limitation)', () => {
        expect(() => {
            validateCss('} a {')
        }).not.toThrow()
    })
})

describe('validateJs', () => {
    it('accepts valid JavaScript', () => {
        expect(() => {
            validateJs('const a = 1')
        }).not.toThrow()
    })

    it('reports a syntax error', () => {
        const error = captureError(() => {
            validateJs('const = 1')
        })

        expect(error).toBeInstanceOf(JsValidationError)
        expect((error as JsValidationError).errors).toContain('Variable declaration expected.')
    })
})

describe('validateTs', () => {
    it('accepts a type error, since it only checks syntax', () => {
        expect(() => {
            validateTs('const a: number = "x"')
        }).not.toThrow()
    })

    it('reports a syntax error', () => {
        const error = captureError(() => {
            validateTs('let a: = 1')
        })

        expect(error).toBeInstanceOf(TsValidationError)
        expect((error as TsValidationError).errors).toEqual(['Type expected.'])
    })

    it('accepts JSX only when jsx is enabled', () => {
        expect(() => {
            validateTs('const e = <div />', { jsx: true })
        }).not.toThrow()
        expect(() => {
            validateTs('const e = <div />')
        }).toThrow(TsValidationError)
    })
})

describe('validateJson', () => {
    it('accepts valid JSON', () => {
        expect(() => {
            validateJson('{"a":1}')
        }).not.toThrow()
    })

    it("reports the parser's message", () => {
        const error = captureError(() => {
            validateJson('{a:1}')
        })

        expect(error).toBeInstanceOf(JsonValidationError)
        expect((error as JsonValidationError).errors).toHaveLength(1)
        expect((error as JsonValidationError).errors[0]).toMatch(/property name/)
    })
})

describe('non-string input', () => {
    it('is rejected by every validator', () => {
        const input = 1 as unknown as string

        for (const run of [validateCss, validateJs, validateJson, validateTs]) {
            const error = captureError(() => {
                run(input)
            })
            expect((error as ValidationError).errors).toEqual(['code must be a string'])
        }
    })
})
