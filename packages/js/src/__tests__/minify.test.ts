import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { minifyJs } from '../minify.js'
import { tokenize } from '../tokenize.js'

function tokenKeys(code: string): string[] {
    return tokenize(code).tokens.map((token) => `${token.type}:${token.value}`)
}

/** Fixtures: [source, exact minified output]. */
const exact: [string, string][] = [
    ['const a = 1 // note\nconst b = 2', 'const a=1\nconst b=2'],
    ['/* block */\nlet x = 1', 'let x=1'],
    ['const s = "// not a comment"', 'const s="// not a comment"'],
    ["const c = 'it\\'s // x'", "const c='it\\'s // x'"],
    ['const t = `a ${b /* c */} // d`', 'const t=`a ${b /* c */} // d`'],
    ['const r = /\\/\\/ab/g.test(x)', 'const r=/\\/\\/ab/g.test(x)'],
    ['const r = /[/]/.test(x) // c', 'const r=/[/]/.test(x)'],
    ['  a()\n\n\n\n  b()  ', 'a()\nb()'],
    // regex vs division
    ['d = a / b / c', 'd=a/b/c'],
    ['x = /re/g', 'x=/re/g'],
    ['y = (a + b) / 2 / 1', 'y=(a+b)/2/1'],
    ['if (x) /re/.test(y)', 'if(x)/re/.test(y)'],
    ['{}\n/re/.test(y)', '{}\n/re/.test(y)'],
    ['function f() { return /re/.test(y) }', 'function f(){return/re/.test(y)}'],
    ['a = b / /re/.source.length', 'a=b/ /re/.source.length'],
    ['/a/ in x', '/a/ in x'],
    // ASI
    ['function f() { return\nx }', 'function f(){return\nx}'],
    ['function f() { return\n{ a: 1 } }', 'function f(){return\n{a:1}}'],
    ['a\n++b', 'a\n++b'],
    ['a\n--b', 'a\n--b'],
    ['a\n(b)', 'a(b)'],
    ['x = {}\nfoo()', 'x={}\nfoo()'],
    ['x = 1\ny = 2', 'x=1\ny=2'],
    ['a = 1 +\n2', 'a=1+2'],
    ['a\n.b\n.c()', 'a.b.c()'],
    ['for (;;) {\n  break\n}', 'for(;;){break\n}'],
    ['async\nfunction f() {}', 'async\nfunction f(){}'],
    ['var\nx = 1', 'var x=1'],
    ['if (a) {\n  b()\n} else {\n  c()\n}', 'if(a){b()}else{c()}'],
    // templates
    ['const u = `x ${ {a: 1}.a } y`', 'const u=`x ${ {a: 1}.a } y`'],
    [
        'const s = `\n  <ul>\n\n\n    <li>x</li>\n  </ul>  \n`;',
        'const s=`\n  <ul>\n\n\n    <li>x</li>\n  </ul>  \n`;',
    ],
    ['const s = `a ${ `n\n  l` } b\n   c`', 'const s=`a ${ `n\n  l` } b\n   c`'],
    ['const s = `a ${ "}`" + \'}`\' } z`', 'const s=`a ${ "}`" + \'}`\' } z`'],
    ["const s = 'one \\\n    two \\\n   three'", "const s='one \\\n    two \\\n   three'"],
    ['tag\n`x`', 'tag`x`'],
    // operator spacing
    ['a + +b', 'a+ +b'],
    ['a - -b', 'a- -b'],
    ['a+ ++b', 'a+ ++b'],
    ['a++ + b', 'a++ +b'],
    ['a-- - b', 'a-- -b'],
    ['1 .toString()', '1 .toString()'],
    ['1..toString()', '1..toString()'],
    ['1.5.toFixed()', '1.5.toFixed()'],
    ['a ? .5 : 1', 'a? .5:1'],
    ['a ? b : c', 'a?b:c'],
    ['a?.b', 'a?.b'],
    ['a / /re/', 'a/ /re/'],
    ['typeof x === "y"', 'typeof x==="y"'],
    ['a < !--b', 'a< !--b'],
    ['x = a in b', 'x=a in b'],
    // numbers and identifiers
    ['n = 0x1F + 1e-3 + 10n + 1_000 + .5e-3', 'n=0x1F+1e-3+10n+1_000+.5e-3'],
    ['const é = 1; const 日本 = é', 'const é=1;const 日本=é'],
    ['class A { #p = 1; has(o) { return #p in o } }', 'class A{#p=1;has(o){return #p in o}}'],
    ['var \\u0061 = 1', 'var \\u0061=1'],
    ['async () => { await x }', 'async()=>{await x}'],
    ['a\n/ b / c', 'a/b/c'],
]

describe('minifyJs', () => {
    for (const [source, expected] of exact) {
        it(`minifies ${JSON.stringify(source)}`, () => {
            expect(minifyJs(source)).toBe(expected)
        })
    }

    it('keeps the token sequence and still parses for every fixture', () => {
        for (const [source] of exact) {
            const minified = minifyJs(source)
            expect(tokenKeys(minified), source).toEqual(tokenKeys(source))
            expect(() => new vm.Script(`(function(){${minified}\n})`), minified).not.toThrow()
        }
    })

    it('preserves the behavior of ASI-sensitive code', () => {
        const src =
            'function f() { return\n{ a: 1 } }\nlet i = 1\nlet j = i\n++i\nf() === undefined && j === 1 && i === 2'
        expect(vm.runInNewContext(src)).toBe(true)
        expect(vm.runInNewContext(minifyJs(src))).toBe(true)
    })

    it('never joins a line after throw or continue', () => {
        expect(minifyJs('throw\nnew Error()')).toBe('throw\nnew Error()')
        expect(minifyJs('continue\nfoo()')).toBe('continue\nfoo()')
    })

    it('keeps a hashbang line verbatim on its own line', () => {
        expect(minifyJs('#!/usr/bin/env node\nrun(  )  // go\n')).toBe('#!/usr/bin/env node\nrun()')
    })

    it('returns just the hashbang for a hashbang-only file', () => {
        expect(minifyJs('#!/usr/bin/env node\n')).toBe('#!/usr/bin/env node')
    })

    it('drops /*! … */ comments too', () => {
        expect(minifyJs('/*! license */\na()')).toBe('a()')
    })

    it('returns an empty string for comment-only input', () => {
        expect(minifyJs('// a\n/* b */')).toBe('')
    })

    it('is idempotent', () => {
        for (const [source] of exact) {
            const once = minifyJs(source)
            expect(minifyJs(once), source).toBe(once)
        }
    })

    it('throws minifyJs: errors for unterminated input', () => {
        expect(() => minifyJs('a()\n/* never closed')).toThrow(
            /^minifyJs: unterminated block comment/,
        )
        expect(() => minifyJs('x = "abc')).toThrow(/^minifyJs: unterminated string at offset 4/)
        expect(() => minifyJs('x = `abc')).toThrow(/^minifyJs: unterminated template literal/)
        expect(() => minifyJs('x = /abc')).toThrow(/^minifyJs: unterminated regex/)
    })

    it('rejects a non-string input', () => {
        expect(() => minifyJs(null as unknown as string)).toThrow('minifyJs: code must be a string')
    })
})
