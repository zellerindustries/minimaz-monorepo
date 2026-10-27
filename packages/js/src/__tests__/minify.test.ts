import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { minifyJs } from '../minify.js'
import { minifyTokens } from '../minify-tokens.js'

/** Script fixtures: [source, exact minified output]. Script top-level names are never renamed. */
const exact: [string, string][] = [
    ['const a = 1 // note\nconst b = 2', 'const a=1;const b=2'],
    ['/* block */\nlet x = 1', 'let x=1'],
    ['const s = "// not a comment"', 'const s="// not a comment"'],
    ["const c = 'it\\'s // x'", 'const c="it\'s // x"'],
    ['const t = `a ${b /* c */} // d`', 'const t=`a ${b} // d`'],
    ['const r = /\\/\\/ab/g.test(x)', 'const r=/\\/\\/ab/g.test(x)'],
    ['const r = /[/]/.test(x) // c', 'const r=/[/]/.test(x)'],
    ['  a()\n\n\n\n  b()  ', 'a();b()'],
    // regex vs division
    ['d = a / b / c', 'd=a/b/c'],
    ['x = /re/g', 'x=/re/g'],
    ['y = (a + b) / 2 / 1', 'y=(a+b)/2/1'],
    ['if (x) /re/.test(y)', 'if(x)/re/.test(y)'],
    ['{}\n/re/.test(y)', '{}/re/.test(y)'],
    ['function f() { return /re/.test(y) }', 'function f(){return/re/.test(y)}'],
    ['a = b / /re/.source.length', 'a=b/ /re/.source.length'],
    ['/a/ in x', '/a/ in x'],
    // ASI
    ['function f() { return\nx }', 'function f(){return;x}'],
    ['function f() { return\n{ a: 1 } }', 'function f(){return;{a:1}}'],
    ['a\n++b', 'a;++b'],
    ['a\n--b', 'a;--b'],
    ['a\n(b)', 'a(b)'],
    ['x = {}\nfoo()', 'x={};foo()'],
    ['x = 1\ny = 2', 'x=1;y=2'],
    ['a = 1 +\n2', 'a=1+2'],
    ['a\n.b\n.c()', 'a.b.c()'],
    ['for (;;) {\n  break\n}', 'for(;;){break}'],
    ['async\nfunction f() {}', 'async;function f(){}'],
    ['var\nx = 1', 'var x=1'],
    ['if (a) {\n  b()\n} else {\n  c()\n}', 'if(a){b()}else{c()}'],
    // templates
    ['const u = `x ${ {a: 1}.a } y`', 'const u=`x ${{a:1}.a} y`'],
    [
        'const s = `\n  <ul>\n\n\n    <li>x</li>\n  </ul>  \n`;',
        'const s=`\n  <ul>\n\n\n    <li>x</li>\n  </ul>  \n`',
    ],
    ['const s = `a ${ `n\n  l` } b\n   c`', 'const s=`a ${`n\n  l`} b\n   c`'],
    ['const s = `a ${ "}`" + \'}`\' } z`', 'const s=`a ${"}`"+"}`"} z`'],
    ["const s = 'one \\\n    two \\\n   three'", 'const s="one     two    three"'],
    ['tag\n`x`', 'tag`x`'],
    // operator spacing
    ['a + +b', 'a+ +b'],
    ['a - -b', 'a- -b'],
    ['a+ ++b', 'a+ ++b'],
    ['a++ + b', 'a++ +b'],
    ['a-- - b', 'a-- -b'],
    ['1 .toString()', '1 .toString()'],
    ['1..toString()', '1 .toString()'],
    ['1.5.toFixed()', '1.5.toFixed()'],
    ['a ? .5 : 1', 'a?.5:1'],
    ['a ? b : c', 'a?b:c'],
    ['a?.b', 'a?.b'],
    ['a / /re/', 'a/ /re/'],
    ['typeof x === "y"', 'typeof x==="y"'],
    ['a < !--b', 'a<! --b'],
    ['x = a in b', 'x=a in b'],
    // numbers and identifiers
    ['n = 0x1F + 1e-3 + 10n + 1_000 + .5e-3', 'n=31+1e-3+10n+1e3+5e-4'],
    ['const é = 1; const 日本 = é', 'const é=1;const 日本=é'],
    ['class A { #p = 1; has(o) { return #p in o } }', 'class A{#p=1;has(a){return#p in a}}'],
    ['var \\u0061 = 1', 'var a=1'],
    ['async () => { await x }', 'async()=>{await x}'],
    ['a\n/ b / c', 'a/b/c'],
    // renaming
    ['function f() { const value = 1; return value }', 'function f(){const a=1;return a}'],
    ['x = undefined', 'x=void 0'],
]

// The example site from the 2026-10-26 session (`build` with bundling and minify on).
const mainJs = `// entry point
import { greet } from './utils/greet.js'
import { sum } from './utils/math.js'

/* render the page */
const title = document.getElementById('title')
const names = ['ada', 'linus', 'grace']

function render(list) {
    return list
        .map((name) => greet(name))
        .join(', ')
}

title.textContent = \`Hi \${render(names)} — total \${sum(1, 2, 3)}\`

const pattern = /^[a-z]+$/i
const ratio = names.length / 2
let count = 0
count++
console.log(pattern.test('abc'), ratio, count)
`

const greetJs = `/**
 * Builds a greeting.
 */
export function greet(name) {
    if (!name) {
        return
    }

    return \`Hello, \${name.toUpperCase()}!\`
}
`

// utils/math.ts as transpiled by @minimaz/ts before minification.
const mathTsOutput = `// sums numbers
export function sum(...values) {
    let total = 0;
    for (const value of values) {
        total += value;
    }
    return total;
}
`

describe('minifyJs', () => {
    for (const [source, expected] of exact) {
        it(`minifies ${JSON.stringify(source)}`, () => {
            expect(minifyJs(source)).toBe(expected)
        })
    }

    it('produces a valid script for every fixture', () => {
        for (const [source] of exact) {
            const minified = minifyJs(source)
            expect(() => new vm.Script(`(function(){${minified}\n})`), minified).not.toThrow()
        }
    })

    it('is idempotent', () => {
        for (const [source] of exact) {
            const once = minifyJs(source)
            expect(minifyJs(once), source).toBe(once)
        }
    })

    it('preserves the behavior of ASI-sensitive code', () => {
        const src =
            'function f() { return\n{ a: 1 } }\nlet i = 1\nlet j = i\n++i\nf() === undefined && j === 1 && i === 2'
        expect(vm.runInNewContext(src)).toBe(true)
        expect(vm.runInNewContext(minifyJs(src))).toBe(true)
    })

    it('preserves the behavior of renamed code', () => {
        const src = `
            function counter(start) {
                let total = start
                const step = (by) => { total += by; return total }
                return { step, read: () => total }
            }
            const c = counter(2)
            c.step(3)
            c.step(4)
            c.read() + ':' + counter.name`
        const minified = minifyJs(src)
        expect(minified).not.toContain('total')
        expect(vm.runInNewContext(minified)).toBe(vm.runInNewContext(src))
    })

    it('minifies the example site entry module, renaming its top-level locals', () => {
        expect(minifyJs(mainJs)).toBe(
            'import{greet as c}from"./utils/greet.js";import{sum as d}from"./utils/math.js";' +
                'const e=document.getElementById("title");const a=["ada","linus","grace"];' +
                'function f(a){return a.map(a=>c(a)).join(", ")}' +
                'e.textContent=`Hi ${f(a)} — total ${d(1,2,3)}`;const g=/^[a-z]+$/i;' +
                'const h=a.length/2;let b=0;b++;console.log(g.test("abc"),h,b)',
        )
    })

    it('keeps exported names in the example site modules', () => {
        expect(minifyJs(greetJs)).toBe(
            'export function greet(a){if(!a){return}return`Hello, ${a.toUpperCase()}!`}',
        )
        expect(minifyJs(mathTsOutput)).toBe(
            'export function sum(...a){let b=0;for(const c of a){b+=c}return b}',
        )
    })

    it('keeps every name with mangle: false', () => {
        expect(minifyJs(mathTsOutput, { mangle: false })).toBe(
            'export function sum(...values){let total=0;for(const value of values){total+=value}return total}',
        )
        expect(minifyJs('function f() { const value = 1; return value }', { mangle: false })).toBe(
            'function f(){const value=1;return value}',
        )
    })

    it('keeps a hashbang line verbatim on its own line', () => {
        expect(minifyJs('#!/usr/bin/env node\nrun(  )  // go\n')).toBe('#!/usr/bin/env node\nrun()')
    })

    it('drops /*! … */ comments too', () => {
        expect(minifyJs('/*! license */\na()')).toBe('a()')
    })

    it('returns an empty string for comment-only input', () => {
        expect(minifyJs('// a\n/* b */')).toBe('')
    })

    it('rejects a non-string input', () => {
        expect(() => minifyJs(null as unknown as string)).toThrow('minifyJs: code must be a string')
    })
})

describe('minifyJs fallback to the token minifier', () => {
    it.each([
        // syntax errors (ParseError)
        'a = (1\nb = 2',
        'function (x) { return x }',
        // early errors found by scope analysis (ScopeError)
        'let x = 1\nlet x = 2',
        'export { missing }',
    ])('falls back instead of throwing for %j', (source) => {
        expect(minifyJs(source)).toBe(minifyTokens(source))
    })

    it('still throws minifyJs: errors for unterminated input', () => {
        expect(() => minifyJs('a()\n/* never closed')).toThrow(
            /^minifyJs: unterminated block comment/,
        )
        expect(() => minifyJs('x = "abc')).toThrow(/^minifyJs: unterminated string at offset 4/)
        expect(() => minifyJs('x = `abc')).toThrow(/^minifyJs: unterminated template literal/)
        expect(() => minifyJs('x = /abc')).toThrow(/^minifyJs: unterminated regex/)
    })

    it('does not print a sloppy-script call of a function named await as an await expression', () => {
        const source = 'await(x)\nfunction g(value) { return value }'
        const minified = minifyJs(source)
        expect(minified).toBe(minifyTokens(source))
        expect(minified).toBe('await(x)\nfunction g(value){return value}')
        expect(() => new vm.Script(minified)).not.toThrow()
        const context = { x: 2, await: (v: number): number => v * 10 }
        expect(vm.runInNewContext(`${minified};g(await(x))`, context)).toBe(20)
    })

    it('falls back on input nested too deeply to parse', () => {
        const depth = 3000
        const source = `${'function f() {'.repeat(depth)}x()${'}'.repeat(depth)}`
        const minified = minifyJs(source)
        expect(minified).toBe(minifyTokens(source))
        expect(minified).toBe(`${'function f(){'.repeat(depth)}x()${'}'.repeat(depth)}`)
    })

    it('uses the token minifier for top-level await without other module syntax', () => {
        expect(minifyJs('const r = await fetch(u)\n')).toBe('const r=await fetch(u)')
    })

    it('parses top-level await in a file with module syntax', () => {
        expect(minifyJs('import x from "m"\nconst value = await x()\nexport { value }')).toBe(
            'import a from"m";const value=await a();export{value}',
        )
    })
})

describe('minifyJs regressions found by the differential harness', () => {
    it('keeps a renamed `{__proto__}` shorthand an own property', () => {
        const source = '(function () { const __proto__ = 1; return { __proto__ } })()'
        const minified = minifyJs(source)
        expect(minified).toBe('(function(){const a=1;return{["__proto__"]:a}})()')
        const result = vm.runInNewContext(minified) as Record<string, unknown>
        expect(Object.keys(result)).toEqual(['__proto__'])
        expect(minifyJs('x = { __proto__ }')).toBe('x={__proto__}')
        expect(minifyJs('x = { __proto__: y, "__proto__"() {} }')).toBe(
            'x={__proto__:y,__proto__(){}}',
        )
        expect(minifyJs('(function (o) { const { __proto__ } = o; return __proto__ })')).toBe(
            '(function(a){const{__proto__:b}=a;return b})',
        )
    })
})
