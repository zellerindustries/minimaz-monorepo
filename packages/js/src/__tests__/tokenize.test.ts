import { describe, expect, it } from 'vitest'
import { tokenize } from '../tokenize.js'

function summary(code: string): string[] {
    return tokenize(code).tokens.map((token) => `${token.type}:${token.value}`)
}

describe('tokenize', () => {
    it('splits words, numbers, strings and punctuators', () => {
        expect(summary("a = 1.5e-3 + 'x' >>>= 0x1F")).toEqual([
            'word:a',
            'punct:=',
            'number:1.5e-3',
            'punct:+',
            "string:'x'",
            'punct:>>>=',
            'number:0x1F',
        ])
    })

    it('keeps numeric separators, BigInt and leading-dot numbers whole', () => {
        expect(summary('1_000 10n .5e-3 0b1_01n')).toEqual([
            'number:1_000',
            'number:10n',
            'number:.5e-3',
            'number:0b1_01n',
        ])
    })

    it('does not lex ?. before a digit as optional chaining', () => {
        expect(summary('a?.5:1')).toEqual(['word:a', 'punct:?', 'number:.5', 'punct::', 'number:1'])
        expect(summary('a?.b')).toEqual(['word:a', 'punct:?.', 'word:b'])
    })

    it('keeps non-ASCII identifiers, private names and unicode escapes as one word', () => {
        expect(summary('é日本 #priv \\u0061b a\\u{62}c')).toEqual([
            'word:é日本',
            'word:#priv',
            'word:\\u0061b',
            'word:a\\u{62}c',
        ])
    })

    it('records newlineBefore, including from a block comment holding a newline', () => {
        const tokens = tokenize('a\nb /* x\ny */ c /* z */ d').tokens
        expect(tokens.map((token) => token.newlineBefore)).toEqual([false, true, true, false])
    })

    it('sets newlineBefore on the token after a line comment', () => {
        const tokens = tokenize('a // c\nb').tokens
        expect(tokens.map((token) => token.value)).toEqual(['a', 'b'])
        expect(tokens[1]?.newlineBefore).toBe(true)
    })

    it('extracts a hashbang line', () => {
        const result = tokenize('#!/usr/bin/env node\nrun()')
        expect(result.hashbang).toBe('#!/usr/bin/env node')
        expect(result.tokens.map((token) => token.value)).toEqual(['run', '(', ')'])
    })

    describe('regex vs division', () => {
        it('treats slashes between operands as division', () => {
            expect(summary('a / b / c')).toEqual([
                'word:a',
                'punct:/',
                'word:b',
                'punct:/',
                'word:c',
            ])
        })

        it('reads a regex after =', () => {
            expect(summary('x = /re/g')).toEqual(['word:x', 'punct:=', 'regex:/re/g'])
        })

        it('treats / after ) of a call as division', () => {
            expect(summary('f(x) / 2 / 3')[4]).toBe('punct:/')
            expect(summary('f(x) / 2 / 3')).not.toContain('regex:/ 2 /')
        })

        it('reads a regex after the ) closing an if/while/for/with header', () => {
            expect(summary('if (x) /re/.test(y)')).toContain('regex:/re/')
            expect(summary('while (x) /re/.test(y)')).toContain('regex:/re/')
            expect(summary('for (;;) /re/.test(y)')).toContain('regex:/re/')
        })

        it('reads a regex after }', () => {
            expect(summary('{}\n/re/.test(y)')).toContain('regex:/re/')
        })

        it('reads a regex after return and typeof, but not after a property of that name', () => {
            expect(summary('return /re/')).toEqual(['word:return', 'regex:/re/'])
            expect(summary('typeof /re/')).toEqual(['word:typeof', 'regex:/re/'])
            const tokens = summary('a.return / 2 / 1')
            expect(tokens[2]).toBe('word:return')
            expect(tokens[3]).toBe('punct:/')
        })

        it('treats / after ] and ++ as division', () => {
            expect(summary('a[0] / 2 / 1')[4]).toBe('punct:/')
            expect(summary('a++ / 2 / 1')[2]).toBe('punct:/')
        })

        it('keeps a slash inside a character class and escaped slashes in the regex', () => {
            expect(summary('x = /[/]\\/a/gi.test(y)')[2]).toBe('regex:/[/]\\/a/gi')
        })

        it('reads a regex after a division operator', () => {
            expect(summary('a / /re/')).toEqual(['word:a', 'punct:/', 'regex:/re/'])
        })
    })

    describe('templates', () => {
        it('is one token with verbatim text', () => {
            expect(summary('x = `a\n  ${ b }  c`')).toEqual([
                'word:x',
                'punct:=',
                'template:`a\n  ${ b }  c`',
            ])
        })

        it('keeps nested templates inside ${} in one token', () => {
            const src = '`a ${ `inner ${x} }` } b`'
            expect(summary(`${src}; y`)).toEqual([`template:${src}`, 'punct:;', 'word:y'])
        })

        it('is not confused by } and backticks inside strings inside ${}', () => {
            const src = '`a ${ "}`" + \'}`\' + {a: 1}.a } z`'
            expect(summary(`${src} q`)).toEqual([`template:${src}`, 'word:q'])
        })

        it('is not closed by an escaped backtick', () => {
            expect(summary('`a\\`b` c')).toEqual(['template:`a\\`b`', 'word:c'])
        })
    })

    describe('unterminated input', () => {
        it('throws for a string', () => {
            expect(() => tokenize("a = 'abc\nb")).toThrow(
                'minifyJs: unterminated string at offset 4',
            )
        })

        it('throws for a template literal', () => {
            expect(() => tokenize('a = `abc')).toThrow(
                'minifyJs: unterminated template literal at offset 4',
            )
        })

        it('throws for an unclosed ${} inside a template', () => {
            expect(() => tokenize('`a ${ b')).toThrow(
                'minifyJs: unterminated template literal at offset 0',
            )
        })

        it('throws for a regex', () => {
            expect(() => tokenize('x = /abc\ny')).toThrow(
                'minifyJs: unterminated regex at offset 4',
            )
        })

        it('throws for a block comment', () => {
            expect(() => tokenize('a /* never closed')).toThrow(
                'minifyJs: unterminated block comment at offset 2',
            )
        })
    })

    it('allows a backslash line continuation in a string', () => {
        expect(summary("s = 'a\\\nb'")).toEqual(['word:s', 'punct:=', "string:'a\\\nb'"])
    })
})

describe('tokenize regex errors', () => {
    it('throws when a backslash inside a regex is followed by a line break', () => {
        expect(() => tokenize('x = /a\\\n/')).toThrow(/^minifyJs: unterminated regex at offset 4/)
    })
})
