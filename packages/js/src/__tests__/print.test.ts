import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import type { ExpressionStatement, Program } from '../ast.js'
import { parse } from '../parse.js'
import { formatNumber, print, quoteString } from '../print.js'
import { analyze } from '../scope.js'
import { structuralDiff, structurallyEqual } from './helpers.js'

function min(code: string): string {
    return print(parse(code))
}

/** Prints with the `undefined` rewrite enabled, as the minifier will. */
function minScoped(code: string): string {
    const program = parse(code)
    return print(program, { unresolved: analyze(program).unresolved })
}

/** Asserts the round-trip property and returns the printed text. */
function roundTrip(code: string): string {
    const program = parse(code)
    const out = print(program, { unresolved: analyze(program).unresolved })
    const reparsed = parse(out)
    expect(structuralDiff(program, reparsed, { undefinedAsVoid: true }), out).toBeNull()
    expect(print(reparsed, { unresolved: analyze(reparsed).unresolved })).toBe(out)
    return out
}

/** A hand-built AST statement list, for shapes no source text produces. */
function programOf(body: Program['body']): Program {
    return { type: 'Program', body, sourceType: 'script', start: 0, end: 0 }
}

describe('whitespace and statement joining', () => {
    it.each([
        ['a ;  b ;', 'a;b'],
        ['a\nb', 'a;b'],
        ['{ a; b; }', '{a;b}'],
        ['function f() { return 1; }\nf()', 'function f(){return 1}f()'],
        ['class A {}\n(a)', 'class A{}a'],
        ['if (a) { b }\n[c]', 'if(a){b}[c]'],
        ['a = function () {}\n(b)', 'a=function(){}(b)'],
        ['a = function () {}\n;(b)', 'a=function(){};b'],
        ['a\n;(b)', 'a;b'],
        ['a\n;[b]', 'a;[b]'],
        ['a\n;`b`', 'a;`b`'],
        ['a\n;+b', 'a;+b'],
        ['a\n;-b', 'a;-b'],
        ['a\n;/re/.test(b)', 'a;/re/.test(b)'],
        ['x = {}\nfoo()', 'x={};foo()'],
        ['let x\n;[1].map(f)', 'let x;[1].map(f)'],
        [';;a;;', ';;a;;'],
        [';;a;;;', ';;a;;;'],
        ['a\n;;', 'a;;'],
        ['', ''],
        ['// only a comment\n/* and another */', ''],
        ['a /* c */ + /*! keep? */ b // d', 'a+b'],
    ])('%j → %j', (code, expected) => {
        expect(min(code)).toBe(expected)
    })

    it('keeps the `;` that ends a do-while body and a statement after the loop', () => {
        expect(min('do x; while (y) z')).toBe('do x;while(y);z')
        expect(min('do {} while (y)\nz')).toBe('do{}while(y);z')
        expect(min('do ; while (y)')).toBe('do;while(y)')
        expect(min('{ do x(); while (y) }')).toBe('{do x();while(y)}')
    })

    it('flushes the `;` before else and between switch cases and class fields', () => {
        expect(min('if (a) b; else c')).toBe('if(a)b;else c')
        expect(min('if (a) { b } else { c }')).toBe('if(a){b}else{c}')
        expect(min('if (a) b; else if (c) d; else e')).toBe('if(a)b;else if(c)d;else e')
        expect(min('switch (a) { case 1: b; case 2: c; break; default: d }')).toBe(
            'switch(a){case 1:b;case 2:c;break;default:d}',
        )
        expect(min('switch (a) { case "x": default: }')).toBe('switch(a){case"x":default:}')
        expect(min('class A { a = 1; b; [c] = 2; *d() {} e }')).toBe('class A{a=1;b;[c]=2;*d(){}e}')
        expect(min('class A { get; set; static; async; x() {} }')).toBe(
            'class A{get;set;static;async;x(){}}',
        )
    })

    it('prints keywords with only the spaces they need', () => {
        expect(min('return_ = typeof a; void 0; delete a.b')).toBe(
            'return_=typeof a;void 0;delete a.b',
        )
        expect(min('function f() { return a }')).toBe('function f(){return a}')
        expect(min('function f() { return (a) }')).toBe('function f(){return a}')
        expect(min('function f() { return [a] }')).toBe('function f(){return[a]}')
        expect(min('function f() { return "a" }')).toBe('function f(){return"a"}')
        expect(min('function f() { return .5 }')).toBe('function f(){return.5}')
        expect(min('function f() { return }')).toBe('function f(){return}')
        expect(min('throw new Error("x")')).toBe('throw new Error("x")')
        expect(min('typeof (a)')).toBe('typeof a')
        expect(min('typeof !a')).toBe('typeof!a')
        expect(min('a in b; a instanceof b; "a" in b')).toBe('a in b;a instanceof b;"a"in b')
        expect(min('for (const a of b);')).toBe('for(const a of b);')
        expect(min('for (a of [b]);')).toBe('for(a of[b]);')
        expect(min('if (a) b; else return_')).toBe('if(a)b;else return_')
        expect(min('if (a) b; else {}')).toBe('if(a)b;else{}')
        expect(min('do a(); while (b)')).toBe('do a();while(b)')
        expect(min('new a; new a.b; new a()')).toBe('new a;new a.b;new a')
    })

    it('drops comments, including /*! */ ones', () => {
        expect(min('/*! license */ a')).toBe('a')
    })
})

describe('operator spacing hazards', () => {
    it.each([
        ['a + +b', 'a+ +b'],
        ['a - -b', 'a- -b'],
        ['a + ++b', 'a+ ++b'],
        ['a - --b', 'a- --b'],
        ['a++ + b', 'a++ +b'],
        ['a-- - b', 'a-- -b'],
        ['a + -b', 'a+-b'],
        ['- -a', '- -a'],
        ['+ +a', '+ +a'],
        ['-(-1)', '- -1'],
        ['a < !--b', 'a<! --b'],
        ['a / /b/', 'a/ /b/'],
        ['x = /a/ in b', 'x=/a/ in b'],
        ['x = /a/g in b', 'x=/a/g in b'],
        ['a ? .5 : b', 'a?.5:b'],
        ['a?.b', 'a?.b'],
    ])('%j → %j', (code, expected) => {
        expect(min(code)).toBe(expected)
    })

    it('separates an integer from a member dot', () => {
        expect(min('1..toString()')).toBe('1 .toString()')
        expect(min('1 .toString()')).toBe('1 .toString()')
        expect(min('(1).toString()')).toBe('1 .toString()')
        expect(min('1["toString"]()')).toBe('1 .toString()')
        expect(min('0.5.toFixed()')).toBe('.5.toFixed()')
        expect(min('1e3.toFixed()')).toBe('1e3.toFixed()')
        expect(min('0xff.toString()')).toBe('255 .toString()')
        expect(min('1?.x; 1[a]; 1n.x')).toBe('1?.x;1[a];1n.x')
    })
})

describe('parenthesization', () => {
    it.each([
        ['(a, b)', 'a,b'],
        ['f((a, b))', 'f((a,b))'],
        ['x = (a, b)', 'x=(a,b)'],
        ['(a, b).c', '(a,b).c'],
        ['(a ?? b) || c', '(a??b)||c'],
        ['a ?? (b || c)', 'a??(b||c)'],
        ['(a || b) ?? c', '(a||b)??c'],
        ['(a && b) ?? c', '(a&&b)??c'],
        ['a ?? b ?? c', 'a??b??c'],
        ['a ?? (b ?? c)', 'a??(b??c)'],
        ['a | b ?? c', 'a|b??c'],
        ['(-1) ** 2', '(-1)**2'],
        ['(a ** b) ** c', '(a**b)**c'],
        ['a ** b ** c', 'a**b**c'],
        ['a ** -b', 'a**-b'],
        ['(++a) ** 2', '++a**2'],
        ['(typeof a) ** 2', '(typeof a)**2'],
        ['(a + b) * c', '(a+b)*c'],
        ['a + (b * c)', 'a+b*c'],
        ['a - (b - c)', 'a-(b-c)'],
        ['(a - b) - c', 'a-b-c'],
        ['a + (b + c)', 'a+(b+c)'],
        ['a = b = c', 'a=b=c'],
        ['(a = b).c', '(a=b).c'],
        ['(a ? b : c) ? d : e', '(a?b:c)?d:e'],
        ['a ? b : c ? d : e', 'a?b:c?d:e'],
        ['a ? (b, c) : d', 'a?(b,c):d'],
        ['a ? b = 1 : c = 2', 'a?b=1:c=2'],
        ['(a || b) ? c : d', 'a||b?c:d'],
        ['!(a && b)', '!(a&&b)'],
        ['(!a).b', '(!a).b'],
        ['(await a)()', '(await a)()'],
        ['typeof (() => {})', 'typeof(()=>{})'],
        ['(() => {})()', '(()=>{})()'],
        ['(a => a) || b', '(a=>a)||b'],
        ['a || (b => b)', 'a||(b=>b)'],
        ['x = a => b => c', 'x=a=>b=>c'],
        ['x = (function () {})()', 'x=function(){}()'],
        ['x = {}.toString()', 'x={}.toString()'],
        ['x = (class {}).name', 'x=class{}.name'],
        ['(a?.b).c', '(a?.b).c'],
        ['(a?.b)()', '(a?.b)()'],
        ['a?.b.c', 'a?.b.c'],
        ['a?.[b]?.(c)', 'a?.[b]?.(c)'],
        ['(a?.b)`c`', '(a?.b)`c`'],
        ['new (a?.b)()', 'new(a?.b)'],
        ['new (a())()', 'new(a())'],
        ['new (a().b)()', 'new(a()).b'],
        ['new (a.b())()', 'new(a.b())'],
        ['new a.b.c()', 'new a.b.c'],
        ['new (new a)()', 'new new a()'],
        ['new (new a)(b)', 'new new a()(b)'],
        ['new new a()()', 'new new a()'],
        ['(new a).b', 'new a().b'],
        ['(new a)()', 'new a()()'],
        ['(new a)`x`', 'new a()`x`'],
        ['new (import("a"))', 'new(import("a"))'],
        ['new a`x`', 'new a`x`'],
        ['new (a`x`)()', 'new a`x`'],
        ['new (function () {})', 'new function(){}'],
        ['class A extends (a, b) {}', 'class A extends(a,b){}'],
        ['class A extends (a ? b : c) {}', 'class A extends(a?b:c){}'],
        ['class A extends a.b {}', 'class A extends a.b{}'],
        ['class A extends (new B) {}', 'class A extends new B(){}'],
        ['[...(a, b)]', '[...(a,b)]'],
        ['f(...a, ...(b ? c : d))', 'f(...a,...b?c:d)'],
        [
            'async function f() { await (a, b); (await a).b; await a.b }',
            'async function f(){await(a,b);(await a).b;await a.b}',
        ],
        [
            'function* f() { yield a, b; yield (a, b); (yield a).b; x = yield }',
            'function*f(){yield a,b;yield(a,b);(yield a).b;x=yield}',
        ],
        ['function* f() { yield* a }', 'function*f(){yield*a}'],
        ['(a, b) => (c, d)', '(a,b)=>(c,d)'],
        ['a => ({})', 'a=>({})'],
        ['a => ({}).b', 'a=>({}).b'],
        ['a => ({ b } = c)', 'a=>({b}=c)'],
        ['a => [b] = c', 'a=>[b]=c'],
        ['(a + b)`x`', '(a+b)`x`'],
        ['(a, b)`x`', '(a,b)`x`'],
        ['(++a).b', '(++a).b'],
        ['(a++).b', '(a++).b'],
        ['a + (b, c)', 'a+(b,c)'],
        ['(a in b).c', '(a in b).c'],
        ['import(a)(b); import(a).then(b)', 'import(a)(b);import(a).then(b)'],
        ['(typeof a)(b)', '(typeof a)(b)'],
    ])('%j → %j', (code, expected) => {
        expect(roundTrip(code)).toBe(expected)
    })
})

describe('statement-start hazards', () => {
    it.each([
        ['({}).x', '({}).x'],
        ['({ a: 1 })', '({a:1})'],
        ['({}).x = 1', '({}).x=1'],
        ['({} + a)', '({})+a'],
        ['({ a } = b)', '({a}=b)'],
        ['({ a } = b), c', '({a}=b),c'],
        ['[a] = b', '[a]=b'],
        ['(function () {})()', '(function(){})()'],
        ['(function () {}).call(a)', '(function(){}).call(a)'],
        ['(async function () {})()', '(async function(){})()'],
        ['(class {}).x', '(class{}).x'],
        ['(function () {}), a', '(function(){}),a'],
        ['(let[a] = 1)', '(let)[a]=1'],
        ['(let)\n[a] = 1', '(let)[a]=1'],
        ['l\\u0065t\n[a] = 1', '(let)[a]=1'],
        ['async\nfunction f() {}', 'async;function f(){}'],
        ['(async () => {})()', '(async()=>{})()'],
        ['if (a) ({}).b', 'if(a)({}).b'],
        ['a: ({}).b', 'a:({}).b'],
        ['() => {}', '()=>{}'],
        ['`a`.length', '`a`.length'],
    ])('%j → %j', (code, expected) => {
        expect(roundTrip(code)).toBe(expected)
    })

    it('keeps a script identifier named await from reading as top-level await', () => {
        expect(roundTrip('x = (await)(b)')).toBe('x=(await)(b)')
        expect(roundTrip('await = 1; f(await)')).toBe('(await)=1;f((await))')
        expect(parse(min('x = (await)(b)')).sourceType).toBe('script')
        expect(roundTrip('({await} = 1); ({await = 2, b} = c); x = {await}')).toBe(
            '({await}=1);({await=2,b}=c);x={await}',
        )
        expect(roundTrip('for ({await, b = 1} of c);')).toBe('for({await,b=1}of c);')
    })

    it('protects for-heads from `in`, `let` and `async of`', () => {
        expect(roundTrip('for (var a = (b in c);;);')).toBe('for(var a=(b in c);;);')
        expect(roundTrip('for (a = (b in c);;);')).toBe('for(a=(b in c);;);')
        expect(roundTrip('for (var a = [b in c];;);')).toBe('for(var a=[b in c];;);')
        expect(roundTrip('for (var a = f(b in c);;);')).toBe('for(var a=f(b in c);;);')
        expect(roundTrip('for (var a = () => (b in c);;);')).toBe('for(var a=()=>(b in c);;);')
        expect(roundTrip('for (var a = function () { b in c };;);')).toBe(
            'for(var a=function(){b in c};;);',
        )
        expect(roundTrip('for (var a = b ? c in d : e;;);')).toBe('for(var a=b?c in d:e;;);')
        expect(roundTrip('for (var a = (b ? c : d in e);;);')).toBe('for(var a=b?c:(d in e);;);')
        expect(roundTrip('for (var a = `${b in c}`;;);')).toBe('for(var a=`${b in c}`;;);')
        expect(roundTrip('for (var a = {b: c in d};;);')).toBe('for(var a={b:c in d};;);')
        expect(roundTrip('for (;a in b;);')).toBe('for(;a in b;);')
        expect(roundTrip('for (var a = (b in c) in d);')).toBe('for(var a=(b in c)in d);')
        expect(roundTrip('class A { #x; m() { for (var a = (#x in b);;); } }')).toBe(
            'class A{#x;m(){for(var a=(#x in b);;);}}',
        )
        expect(roundTrip('for ((let) in a);')).toBe('for((let)in a);')
        expect(roundTrip('for ((let).a of b);')).toBe('for((let).a of b);')
        expect(roundTrip('for ((let)[a];;);')).toBe('for((let)[a];;);')
        expect(roundTrip('for ((async) of a);')).toBe('for((async)of a);')
        expect(roundTrip('for (async.x of a);')).toBe('for((async).x of a);')
        expect(roundTrip('for (async in a);')).toBe('for(async in a);')
        expect(roundTrip('for (let [a] of b);')).toBe('for(let[a]of b);')
        expect(roundTrip('for (const {a} of b);')).toBe('for(const{a}of b);')
        expect(roundTrip('for ([a, b] of c);')).toBe('for([a,b]of c);')
        expect(roundTrip('for ({a} of c);')).toBe('for({a}of c);')
        expect(roundTrip('for (a of (b, c));')).toBe('for(a of(b,c));')
        expect(roundTrip('for (a in b, c);')).toBe('for(a in b,c);')
        expect(roundTrip('async function f() { for await (const a of b); }')).toBe(
            'async function f(){for await(const a of b);}',
        )
    })

    it('protects export default from reading a declaration', () => {
        expect(roundTrip('export default (function () {})()')).toBe(
            'export default(function(){})()',
        )
        expect(roundTrip('export default (class {}).x')).toBe('export default(class{}).x')
        expect(roundTrip('export default (async function () {})')).toBe(
            'export default(async function(){})',
        )
        expect(roundTrip('export default (a, b)')).toBe('export default(a,b)')
        expect(roundTrip('export default function () {}\n(a)')).toBe('export default function(){}a')
        expect(roundTrip('export default class {}\n[a]')).toBe('export default class{}[a]')
        expect(roundTrip('export default {}')).toBe('export default{}')
        expect(roundTrip('export default async () => {}')).toBe('export default async()=>{}')
    })
})

describe('dangling else', () => {
    it('keeps the existing braces', () => {
        expect(roundTrip('if (a) { if (b) c } else d')).toBe('if(a){if(b)c}else d')
        expect(roundTrip('if (a) { for (;;) if (b) c } else d')).toBe('if(a){for(;;)if(b)c}else d')
        expect(roundTrip('if (a) if (b) c; else d')).toBe('if(a)if(b)c;else d')
        expect(roundTrip('if (a) if (b) c; else d; else e')).toBe('if(a)if(b)c;else d;else e')
    })

    it('adds braces when a hand-built consequent would capture the else', () => {
        const tree = parse('if (a) { if (b) c } else d')
        const outer = tree.body[0]
        if (outer?.type !== 'IfStatement' || outer.consequent.type !== 'BlockStatement') {
            throw new Error('unexpected shape')
        }
        const inner = outer.consequent.body[0]
        if (inner === undefined) {
            throw new Error('unexpected shape')
        }
        const unbraced = programOf([{ ...outer, consequent: inner }])
        expect(print(unbraced)).toBe('if(a){if(b)c}else d')
        const loop = parse('for (;;) if (b) c').body[0]
        if (loop === undefined) {
            throw new Error('unexpected shape')
        }
        expect(print(programOf([{ ...outer, consequent: loop }]))).toBe(
            'if(a){for(;;)if(b)c}else d',
        )
    })
})

describe('numbers', () => {
    it.each([
        ['0', '0'],
        ['0.0', '0'],
        ['0.5', '.5'],
        ['1.50', '1.5'],
        ['10', '10'],
        ['100', '100'],
        ['1000', '1e3'],
        ['12000', '12e3'],
        ['0.001', '1e-3'],
        ['0.01', '.01'],
        ['0.0001', '1e-4'],
        ['0.00015', '15e-5'],
        ['123.45', '123.45'],
        ['1e21', '1e21'],
        ['1E+21', '1e21'],
        ['1.5e300', '15e299'],
        ['5e-324', '5e-324'],
        ['1e999', '2e308'],
        ['0.1', '.1'],
        ['0x10', '16'],
        ['0xFFFFFFFFFFFF', '0xffffffffffff'],
        ['0b1010', '10'],
        ['0o17', '15'],
        ['017', '15'],
        ['019', '19'],
        ['1_000_000', '1e6'],
        ['9007199254740993', '9007199254740992'],
        ['18446744073709551616', '18446744073709552e3'],
        ['1.7976931348623157e308', '17976931348623157e292'],
    ])('%s → %s', (code, expected) => {
        expect(min(`x = ${code}`)).toBe(`x=${expected}`)
    })

    it('never changes a value', () => {
        for (const value of [
            0,
            0.1,
            0.2,
            1 / 3,
            2 ** 53,
            2 ** 64,
            1e21,
            1e-7,
            123456789e-20,
            5e-324,
        ]) {
            expect(Number(formatNumber(value))).toBe(value)
        }
    })

    it.each([
        ['1n', '1n'],
        ['0xFFn', '255n'],
        ['0xFFFFFFFFFFFFFFFFFFn', '0xffffffffffffffffffn'],
        ['1_000n', '1000n'],
    ])('bigint %s → %s', (code, expected) => {
        expect(min(`x = ${code}`)).toBe(`x=${expected}`)
    })

    it('prints booleans as !0 / !1 with the right precedence', () => {
        expect(roundTrip('x = true; y = false')).toBe('x=!0;y=!1')
        expect(roundTrip('true.toString()')).toBe('(!0).toString()')
        expect(roundTrip('x = true ** 2')).toBe('x=(!0)**2')
        expect(roundTrip('x = !true')).toBe('x=!!0')
        expect(roundTrip('x = a < true')).toBe('x=a<!0')
        expect(roundTrip('new true')).toBe('new(!0)')
        expect(min('x = null')).toBe('x=null')
    })
})

describe('strings', () => {
    it.each([
        ["'a'", '"a"'],
        ['"it\'s"', '"it\'s"'],
        ['\'say "hi"\'', '\'say "hi"\''],
        ['"\'\\""', '"\'\\""'],
        ["'a\\nb\\r\\t\\b\\f\\v'", '"a\\nb\\r\\t\\b\\f\\v"'],
        ["'\\0'", '"\\0"'],
        ["'\\x001'", '"\\x001"'],
        ["'\\0a'", '"\\0a"'],
        ["'\\u2028\\u2029'", '"\\u2028\\u2029"'],
        ["'\\ud800'", '"\\ud800"'],
        ["'\\udc00x'", '"\\udc00x"'],
        ["'\\ud83d\\ude00'", '"\\ud83d\\ude00"'],
        ["'\\x01\\x7f'", '"\\x01\\x7f"'],
        ["'\\\\'", '"\\\\"'],
        ["'\\u00e9'", '"\\xe9"'],
        ["'\u00e9'", '"\\xe9"'],
        ["'\u0085\u00a0\u00ff'", '"\\x85\\xa0\\xff"'],
        ["'\u0100\u0800\u4e2d\ufeff\uffff'", '"\\u0100\\u0800\\u4e2d\\ufeff\\uffff"'],
        ["'\u{1F600}'", '"\\ud83d\\ude00"'],
        ["'\\u{10FFFF}'", '"\\udbff\\udfff"'],
        ["'\u00e91'", '"\\xe91"'],
        ["'</script>'", '"\\x3c/script>"'],
        ["'<\\/SCRIPT'", '"\\x3c/SCRIPT"'],
        ["'<!--'", '"\\x3c!--"'],
        ["'a\\\nb'", '"ab"'],
        ["'\\a'", '"a"'],
    ])('%s → %s', (code, expected) => {
        expect(min(`x = ${code}`)).toBe(`x=${expected}`)
    })

    it('round-trips arbitrary values', () => {
        const pieces = [
            "'",
            '"',
            '\\',
            '\n',
            '\0',
            '1',
            '\u2028',
            '\ud800',
            '\udfff',
            '\x7f',
            '<',
            '\u0085',
            '\u00a0',
            '\u{1F600}',
        ]
        for (const a of pieces) {
            for (const b of pieces) {
                const value = a + b
                const literal = (parse(`x = ${quoteString(value)}`).body[0] as ExpressionStatement)
                    .expression
                expect(literal).toMatchObject({ right: { value } })
                expect(quoteString(value)).toMatch(/^[\x20-\x7e]*$/)
            }
        }
    })
})

describe('ASCII-only output', () => {
    it('escapes non-ASCII text in untagged templates, keeping the cooked value', () => {
        expect(roundTrip('x = `é ${a} \u{1F600}\u0085 中`')).toBe(
            'x=`\\xe9 ${a} \\ud83d\\ude00\\x85\\xa0\\u4e2d`',
        )
        expect(roundTrip('x = `\\é\\\\é`')).toBe('x=`\\xe9\\\\\\xe9`')
        expect(roundTrip('x = `a\\ b\\ c `')).toBe('x=`abc\\u2028`')
        expect(roundTrip('x = `\\\u{1F600}`')).toBe('x=`\\ud83d\\ude00`')
    })

    it('keeps tagged templates, regexes and identifiers verbatim', () => {
        expect(roundTrip('x = String.raw`é\\é${a}`')).toBe('x=String.raw`é\\é${a}`')
        expect(roundTrip('x = /é[\u{1F600}]/u')).toBe('x=/é[\u{1F600}]/u')
        expect(roundTrip('é = ü.ö')).toBe('é=ü.ö')
    })

    it('evaluates to the same values as the source', () => {
        const sources = [
            "'é\u0085 ÿĀ中\u{1F600}  '",
            "'\\ud800x\\udfff\\udc00\\ud800'",
            "'\\ud83d' + '\\ude00'",
            '`é${1}\u{1F600}\\é\\ \u0085 \\ud800`',
            '`\\\u{1F600}\u{10FFFF}`',
            "({ 'é': 1, '\u{1F600}': 2 })",
        ]
        for (const source of sources) {
            const out = min(`x = ${source}`)
            expect(out).toMatch(/^[\x20-\x7e]*$/)
            expect(vm.runInNewContext(`${out};JSON.stringify(x)`)).toBe(
                vm.runInNewContext(`x = ${source};JSON.stringify(x)`),
            )
        }
    })
})

describe('verbatim parts', () => {
    it('keeps template text and regexes verbatim, printing template expressions', () => {
        expect(roundTrip('x = `a ${ b + c } \\n ${`d${ e }`}\n`')).toBe(
            'x=`a ${b+c} \\n ${`d${e}`}\n`',
        )
        expect(roundTrip('x = tag`a\\unicode${ b }`')).toBe('x=tag`a\\unicode${b}`')
        expect(roundTrip('a.b`c`; a()`d`')).toBe('a.b`c`;a()`d`')
        expect(roundTrip('x = /[/]\\/(?:a)/giu; y = /=/')).toBe('x=/[/]\\/(?:a)/giu;y=/=/')
    })

    it('keeps the hashbang and directives', () => {
        expect(min('#!/usr/bin/env node\n"use strict"\na()')).toBe(
            '#!/usr/bin/env node\n"use strict";a()',
        )
        expect(min('#!/usr/bin/env node\n')).toBe('#!/usr/bin/env node')
        expect(min("'use strict'; 'use\\x20strict'; a")).toBe("'use strict';'use\\x20strict';a")
        expect(min('function f() { "use strict"; return 1 }')).toBe(
            'function f(){"use strict";return 1}',
        )
        expect(min('() => { "use strict" }')).toBe('()=>{"use strict"}')
    })

    it('does not turn a parenthesized string statement into a directive', () => {
        expect(roundTrip('("use strict"); a')).toBe('("use strict");a')
        expect(roundTrip('"a"; ("use strict")')).toBe('"a";("use strict")')
        expect(roundTrip('function f() { ("use strict") }')).toBe('function f(){("use strict")}')
        expect(roundTrip('a; "use strict"')).toBe('a;"use strict"')
        expect(roundTrip('{ "use strict" }')).toBe('{"use strict"}')
        expect(roundTrip('"a" + b')).toBe('"a"+b')
    })
})

describe('literal shortening', () => {
    it('writes identifier-name keys and members without quotes', () => {
        expect(
            roundTrip('x = {"a": 1, "b-c": 2, "1": 3, "if": 4, "__proto__": null, 1e3: 5}'),
        ).toBe('x={a:1,"b-c":2,"1":3,if:4,__proto__:null,1e3:5}')
        expect(roundTrip('a["b"]; a["b-c"]; a?.["b"]; a["if"]; a["0"]')).toBe(
            'a.b;a["b-c"];a?.b;a.if;a["0"]',
        )
        expect(roundTrip('class A { "constructor"() {} "m"() {} static "x" = 1 }')).toBe(
            'class A{constructor(){}m(){}static x=1}',
        )
        expect(roundTrip('({"a": b} = c)')).toBe('({a:b}=c)')
        expect(roundTrip('x = {"é": 1}; a["é"]')).toBe('x={"\\xe9":1};a["\\xe9"]')
    })

    it('writes the global undefined as void 0 when it is free', () => {
        expect(minScoped('x = undefined; f(undefined); typeof undefined')).toBe(
            'x=void 0;f(void 0);typeof void 0',
        )
        expect(minScoped('undefined.x; undefined()')).toBe('(void 0).x;(void 0)()')
        expect(minScoped('x = {undefined}')).toBe('x={undefined}')
        expect(min('x = undefined')).toBe('x=undefined')
    })

    it.each([
        'function f(undefined) { return undefined }\nx = undefined',
        'var undefined; x = undefined',
        'x = undefined; delete undefined',
        'x = undefined; undefined = 1',
        'x = undefined; undefined++',
        'x = undefined; with (o) undefined',
        'x = undefined; eval("var undefined = 1")',
        'x = undefined; try {} catch (undefined) {}',
        'x = undefined; undefined: x',
        'x = undefined; a.undefined',
        'import undefined from "a"; x = undefined',
    ])('keeps undefined when it may be shadowed or is not a plain read: %s', (code) => {
        expect(minScoped(code)).toBe(min(code))
    })
})

describe('every construct', () => {
    it.each([
        [
            'var a = 1, b, [c, , ...d] = e, {f, g: h = 1, ...i} = j',
            'var a=1,b,[c,,...d]=e,{f,g:h=1,...i}=j',
        ],
        ['let [a = 1] = b; const {a: {b}} = c', 'let[a=1]=b;const{a:{b}}=c'],
        ['[, a, , ] = b', '[,a,,]=b'],
        ['x = [, a, , ]; y = [,]; z = [a, ...b]', 'x=[,a,,];y=[,];z=[a,...b]'],
        [
            'x = {a, b: c, [d]: e, ...f, get g() {}, set g(v) {}, h() {}, async i() {}, *j() {}, async *k() {}, get [l]() {}, async: 1, get: 2}',
            'x={a,b:c,[d]:e,...f,get g(){},set g(v){},h(){},async i(){},*j(){},async*k(){},get[l](){},async:1,get:2}',
        ],
        [
            'x = {"a b"() {}, 1() {}, get 2() {}, get "c"() {}}',
            'x={"a b"(){},1(){},get 2(){},get c(){}}',
        ],
        ['({a = 1, b: {c} = d} = e)', '({a=1,b:{c}=d}=e)'],
        ['function f(a, b = 1, [c], {d}, ...e) {}', 'function f(a,b=1,[c],{d},...e){}'],
        [
            'async function* f() {} function* g() {} async function h() {}',
            'async function*f(){}function*g(){}async function h(){}',
        ],
        [
            'x = async a => a; y = async (a, b) => a; z = async () => {}; w = (a) => a; v = ({a}) => a; u = ([a]) => a; t = (...a) => a; s = (a = 1) => a',
            'x=async a=>a;y=async(a,b)=>a;z=async()=>{};w=a=>a;v=({a})=>a;u=([a])=>a;t=(...a)=>a;s=(a=1)=>a',
        ],
        ['x = async; y = async(a); z = async (a) => a', 'x=async;y=async(a);z=async a=>a'],
        [
            'class A extends B { constructor() { super(); super.a; super[b] } static a = 1; static { c } #d = 1; get #e() {} set #e(v) {} static #f() {} static async *[g]() {} h; static get i() {} m() { return this.#d + (#d in this) } }',
            'class A extends B{constructor(){super();super.a;super[b]}static a=1;static{c}#d=1;get#e(){}set#e(v){}static#f(){}static async*[g](){}h;static get i(){}m(){return this.#d+(#d in this)}}',
        ],
        ['x = class Named {}; y = class {}', 'x=class Named{};y=class{}'],
        [
            'class A { static static() {} get get() {} set set(v) {} async async() {} static() {} }',
            'class A{static static(){}get get(){}set set(v){}async async(){}static(){}}',
        ],
        [
            'class A { [a] = 1; [b]() {} static [c]; "d"; 1 = 2 }',
            'class A{[a]=1;[b](){}static[c];d;1=2}',
        ],
        [
            'label: for (;;) { break label; continue label }',
            'label:for(;;){break label;continue label}',
        ],
        ['a: b: { break a }', 'a:b:{break a}'],
        ['while (a) { break; continue }', 'while(a){break;continue}'],
        ['try { a } catch (e) { b } finally { c }', 'try{a}catch(e){b}finally{c}'],
        ['try { a } catch { b }', 'try{a}catch{b}'],
        ['try { a } catch ({ message }) {}', 'try{a}catch({message}){}'],
        ['try {} finally {}', 'try{}finally{}'],
        ['with (a) b', 'with(a)b'],
        ['debugger; debugger', 'debugger;debugger'],
        ['if (a) function f() {}', 'if(a)function f(){}'],
        ['for (var i = 0, j; i < 1; i++, j--) ;', 'for(var i=0,j;i<1;i++,j--);'],
        ['for (;;) {}', 'for(;;){}'],
        ['for (var a in b) c; for (let a of b) c', 'for(var a in b)c;for(let a of b)c'],
        ['switch (a) {}', 'switch(a){}'],
        ['function f() { x = this; y = new.target }', 'function f(){x=this;y=new.target}'],
        ['x = a?.b?.(c)?.[d]; y = a?.#b', 'x=a?.b?.(c)?.[d];y=a?.#b'],
        [
            'x = import("a"); y = import("a", { with: { type: "json" } })',
            'x=import("a");y=import("a",{with:{type:"json"}})',
        ],
        ['a ||= b; a &&= b; a ??= b; a **= b; a >>>= b', 'a||=b;a&&=b;a??=b;a**=b;a>>>=b'],
        ['x = a ? b : c', 'x=a?b:c'],
        ['++a; a--; --a.b; a[b]++', '++a;a--;--a.b;a[b]++'],
        ['x = ~a; y = !a; z = void a; w = delete a[b]', 'x=~a;y=!a;z=void a;w=delete a[b]'],
    ])('%j', (code, expected) => {
        expect(roundTrip(code)).toBe(expected)
    })

    it.each([
        ['import a from "a"', 'import a from"a"'],
        ['import a, { b, c as d } from "a"', 'import a,{b,c as d}from"a"'],
        ['import a, * as b from "a"', 'import a,*as b from"a"'],
        ['import * as a from "a"', 'import*as a from"a"'],
        ['import { "a-b" as c, default as d } from "a"', 'import{"a-b"as c,default as d}from"a"'],
        ['import "a"', 'import"a"'],
        ['import {} from "a"', 'import"a"'],
        [
            'import a from "a" with { type: "json", "b": "c" }',
            'import a from"a"with{type:"json","b":"c"}',
        ],
        [
            'export var a = 1; export let b; export const c = 2',
            'export var a=1;export let b;export const c=2',
        ],
        [
            'export function f() {} export class A {} export async function g() {}',
            'export function f(){}export class A{}export async function g(){}',
        ],
        ['let a, b; export { a, b as c, a as "d e" }', 'let a,b;export{a,b as c,a as"d e"}'],
        ['export { a as default } from "a"', 'export{a as default}from"a"'],
        [
            'export { "a b" as c } from "a" with { type: "json" }',
            'export{"a b"as c}from"a"with{type:"json"}',
        ],
        [
            'export * from "a"; export * as b from "b"; export * as "c d" from "c"',
            'export*from"a";export*as b from"b";export*as"c d"from"c"',
        ],
        ['export default a + b', 'export default a+b'],
        ['export default function f() {}', 'export default function f(){}'],
        ['export default class A {}', 'export default class A{}'],
        ['export default async function () {}', 'export default async function(){}'],
        ['let a; export {}; export { a }', 'let a;export{};export{a}'],
        ['x = import.meta.url', 'x=import.meta.url'],
        ['await a; for await (const b of c);', 'await a;for await(const b of c);'],
    ])('module %j', (code, expected) => {
        expect(roundTrip(code)).toBe(expected)
    })
})

describe('renamed shorthand nodes', () => {
    function renamed(code: string, from: string, to: string): string {
        const tree = parse(code)
        for (const [identifier, binding] of analyze(tree).references) {
            if (binding !== null && identifier.name === from) {
                for (const id of binding.identifiers) {
                    id.name = to
                }
            }
        }
        return print(tree)
    }

    it('prints key:value once the names differ', () => {
        expect(renamed('function f(a) { return {a} }', 'a', 'b')).toBe('function f(b){return{a:b}}')
        expect(renamed('function f({a}) { return a }', 'a', 'b')).toBe(
            'function f({a:b}){return b}',
        )
        expect(renamed('function f({a = 1}) { return a }', 'a', 'b')).toBe(
            'function f({a:b=1}){return b}',
        )
        expect(renamed('function f(a) { ({a} = c) }', 'a', 'b')).toBe('function f(b){({a:b}=c)}')
        expect(renamed('let a = 1; export {a}', 'a', 'b')).toBe('let b=1;export{b as a}')
        expect(renamed('import {a} from "x"; a()', 'a', 'b')).toBe('import{a as b}from"x";b()')
    })
})

describe('round-trip property', () => {
    const corpus = [
        'var a = 1; let b = a ? (c, d) : e => ({}); const {f = 1, ...g} = h',
        'function f(a, ...b) { "use strict"; return a?.b?.[c]?.(...b) ?? (d || e) }',
        'class A extends (B ?? C) { static #x = 1; static { A.#x++ } get [k]() { return super.k } }',
        'for (var i = 0, n = a.length; i < n; i++) if (a[i] in o) break; else continue',
        'label: do { if (x) break label; x = !x } while (typeof x === "undefined")',
        'switch (a) { case 1: case 2: { b() } default: c = 1 }',
        'try { throw new Error(`a${b}c`) } catch ({ message: m }) { console.log(m) } finally {}',
        'x = a ** -b + (-a) ** b - (a = b) * (c, d) / ++e % f-- << 1 >>> 2 & 3 | 4 ^ 5',
        'x = new (a.b().c)(); y = new a.b.c(); z = (new a)(); w = new (a?.b)()',
        'async function* g() { for await (const x of y) yield* await x; yield; (yield a) + b }',
        'x = {__proto__: null, "a-b": 1, [c]: 2, d, e() {}, get f() { return 1 }, set f(v) {}}',
        'a = /=/g.test(b) / 2 / c; d = `${/re/}` + `\\u{1F600}`',
        'if (a) b; else if (c) d; else { e }\nf()\n;[g] = h',
        '(function () {})(); (() => {})(); (async () => {})(); !function () {}()',
        'export default class extends A {}',
        'import x, { y as z } from "m"; export { z as y }; export * as ns from "m"',
        'let {a: [b, ...c] = [], ...d} = e; [a.b, c[d]] = f; ({a: g.h} = i)',
        'x = a?.b.c(d)?.e[f]`g`'.replace('`g`', ''),
        'while (x) if (y) for (;;) z; else w',
        'x = 0.1 + 1e21 + 1e-7 + 0xff + 0b11 + 0o7 + 1_000 + 123n + 0x1fn',
        "x = 'a\\'b' + \"c\\\"d\" + '\\u2028' + '\\0' + '\\x001' + `\\``",
        'a: { b: while (c) { continue b } }',
        'x = (a, b) => c; y = async x => await x; z = (a = b in c) => d',
        'function f() { new.target; return new.target }',
        'x = typeof typeof a; y = - - a; z = + + a; w = ! ! a; v = ~ ~ a',
        'a ? b ? c : d : e ? f : g',
        'a = b ? (c, d) : (e = f)',
        'with (a) { b }',
        'x = a in b; for (const k in o) for (const v of o[k]) v',
        'var undefined_ = void 0, x = undefined',
    ]

    it.each(corpus)('%j', (code) => {
        roundTrip(code)
    })

    const root = fileURLToPath(new URL('../', import.meta.url))

    // Every source file of the package, so a renamed or added module is covered too.
    const sourceFiles = readdirSync(root)
        .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))
        .sort()

    it('finds the package source files', () => {
        expect(sourceFiles).toEqual(expect.arrayContaining(['minify-tokens.ts', 'parse.ts']))
    })

    it.each(sourceFiles)('round-trips the transpiled output of %s', (file) => {
        const source = readFileSync(`${root}${file}`, 'utf8')
        const code = ts.transpileModule(source, {
            compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2024 },
        }).outputText
        const out = roundTrip(code)
        expect(out.length).toBeLessThan(code.length)
    })
})

describe('structurallyEqual', () => {
    it('ignores positions, raw text and the safe rewrites only', () => {
        expect(structurallyEqual(parse('a ( 1 )'), parse('a(1.0)'))).toBe(true)
        expect(structurallyEqual(parse('x = true'), parse('x = !0'))).toBe(true)
        expect(structurallyEqual(parse('a["b"]'), parse('a.b'))).toBe(true)
        expect(structurallyEqual(parse('x = {"a": 1}'), parse('x = {a: 1}'))).toBe(true)
        expect(structurallyEqual(parse('x = void 0'), parse('x = undefined'))).toBe(false)
        expect(
            structurallyEqual(parse('x = void 0'), parse('x = undefined'), {
                undefinedAsVoid: true,
            }),
        ).toBe(true)
        expect(structurallyEqual(parse('a + b'), parse('a - b'))).toBe(false)
        expect(structurallyEqual(parse('a["b-c"]'), parse('a.b'))).toBe(false)
        expect(structurallyEqual(parse('/a/g'), parse('/a/i'))).toBe(false)
        expect(structurallyEqual(parse('"use strict"'), parse("'use strict'"))).toBe(true)
        expect(structurallyEqual(parse('"use strict"'), parse('"use\\x20strict"'))).toBe(false)
        expect(structuralDiff(parse('a; b'), parse('a; c'))).toBe('$.body[1].expression.name')
    })
})

describe('print directives and keys', () => {
    it('prints a directive with its original quotes', () => {
        expect(min("'use strict'; f()")).toBe("'use strict';f()")
    })

    it('prints computed, numeric and private-name keys', () => {
        expect(min('class A { [a](){} 1(){} static #p(){} }')).toBe(
            'class A{[a](){}1(){}static#p(){}}',
        )
        expect(min("({ [a]: 1, 1: 2, 'x': 3 })")).toBe('({[a]:1,1:2,x:3})')
    })
})
