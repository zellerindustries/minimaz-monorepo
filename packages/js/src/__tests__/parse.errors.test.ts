import { describe, expect, it } from 'vitest'
import { ParseError, parse } from '../parse.js'

function failure(code: string): ParseError {
    try {
        parse(code)
    } catch (error) {
        if (error instanceof ParseError) {
            return error
        }
        throw error
    }
    throw new Error(`expected ParseError for ${code}`)
}

describe('parse error messages', () => {
    it.each([
        ['a +', 'unexpected end of input'],
        ['var `x`', 'unexpected template'],
        ['var x = 1 "s"', 'unexpected string (expected ";")'],
        ['import {1} from "a"', 'unexpected number 1 (expected a name)'],
        ['for await (var x = 1;;);', 'unexpected ";" (expected "of")'],
        ['function* g(){ yield', 'unexpected end of input (expected "}")'],
        ['function f(){', 'unexpected end of input (expected "}")'],
        ['class A { static {', 'unexpected end of input'],
        ['class A { get x }', 'unexpected "}" (expected "(")'],
        ['({ async a: 1 })', 'unexpected ":" (expected "(")'],
        ['({ get a: 1 })', 'unexpected ":" (expected "(")'],
        ['({`a`: 1})', 'unexpected template (expected property name)'],
        ['({/a/: 1})', 'unexpected "/" (expected property name)'],
        ['({', 'unexpected end of input (expected property name)'],
        ['var {if} = x', 'unexpected "}" (expected ":")'],
        ['function f(...a, b){}', 'unexpected "," (rest parameter must be last)'],
        ['var [...a, b] = x', 'unexpected "," (rest element must be last)'],
        ['var {...a, b} = x', 'unexpected "," (rest element must be last)'],
        ['new', 'unexpected end of input'],
        ['import("a"', 'unexpected end of input (expected ")")'],
    ])('%s -> %s', (code, message) => {
        expect(failure(code).message).toBe(message)
    })

    it.each(['for ({a=1};;);', 'async({a=1});', 'x = {a = 1}', '[{a=1}]', '([(a) = 1]) => 1'])(
        'rejects a shorthand initializer or parenthesized binding in %s',
        (code) => {
            expect(failure(code).message).toMatch(
                /^invalid (shorthand property initializer|binding)/,
            )
        },
    )

    it.each([
        '[a += 1] = x',
        '({...f()} = x)',
        '({...{a}} = x)',
        '[...f()] = x',
        '([...a.b]) => 1',
        '({ get a(){} } = x)',
        '({ m(){} } = x)',
        '([a.b]) => 1',
        '([(a)]) => 1',
        '([...(a)]) => 1',
    ])('rejects the invalid assignment target in %s', (code) => {
        expect(failure(code).message).toBe('invalid assignment target')
    })

    it.each([
        'class A extends B { constructor(){ super } }',
        '({ m(){ super } })',
        'class A extends B { constructor(){ super`a` } }',
    ])('rejects a bare super in %s', (code) => {
        expect(failure(code).message).toBe("unexpected 'super'")
    })

    it('rejects a tagged template inside an optional chain', () => {
        expect(failure('a?.b`c`').message).toBe('tagged template in optional chain')
    })

    it('accepts empty class elements', () => {
        expect(parse('class A { ; }').body).toHaveLength(1)
    })
})

describe('lexer error messages surfaced through parse', () => {
    it('rejects a backslash in an identifier that is not a unicode escape', () => {
        expect(failure('a\\x').message).toBe('invalid escape in identifier')
    })

    it('rejects a backslash directly after regular expression flags', () => {
        expect(failure('/a/\\u0067').message).toBe('invalid regular expression flags')
    })
})
