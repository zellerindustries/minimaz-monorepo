import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { parse } from '../parse.js'
import { print } from '../print.js'
import { candidateName, rename } from '../rename.js'
import { analyze } from '../scope.js'

/** Parses, renames and prints `code`. */
function mangle(code: string): string {
    const program = parse(code)
    rename(analyze(program))
    return print(program)
}

/** Runs a script in a fresh context and returns what it logged. */
function run(code: string): string[] {
    const logged: string[] = []
    runInNewContext(code, {
        log: (...values: unknown[]) => {
            logged.push(values.map((value) => String(value)).join(' '))
        },
    })
    return logged
}

describe('candidate names', () => {
    it('goes through single characters, then longer names', () => {
        expect(candidateName(0)).toBe('a')
        expect(candidateName(25)).toBe('z')
        expect(candidateName(26)).toBe('A')
        expect(candidateName(52)).toBe('_')
        expect(candidateName(53)).toBe('$')
        expect(candidateName(54)).toBe('aa')
        expect(candidateName(55)).toBe('ba')
        expect(candidateName(54 + 54)).toBe('ab')
        expect(candidateName(54 + 54 * 64)).toBe('aaa')
    })

    it('never produces the same name twice', () => {
        const seen = new Set<string>()
        for (let index = 0; index < 20000; index++) {
            seen.add(candidateName(index))
        }
        expect(seen.size).toBe(20000)
    })
})

describe('rename', () => {
    it('renames function parameters and locals', () => {
        expect(mangle('function f(x, y) { var z = x + y; return z }')).toBe(
            'function f(a,b){var c=a+b;return c}',
        )
    })

    it('gives the most used bindings the first names', () => {
        expect(mangle('function f(x, y) { return y + y + y + x }')).toBe(
            'function f(b,a){return a+a+a+b}',
        )
    })

    it('reuses names across sibling scopes', () => {
        expect(mangle('function f(x) { return x } function g(y) { return y }')).toBe(
            'function f(a){return a}function g(a){return a}',
        )
        expect(mangle('function f() { { let x = 1; g(x) } { let y = 2; g(y) } }')).toBe(
            'function f(){{let a=1;g(a)}{let a=2;g(a)}}',
        )
    })

    it('keeps names used by inner closures distinct', () => {
        expect(mangle('function f(x) { return function (y) { return x + y } }')).toBe(
            'function f(a){return function(b){return a+b}}',
        )
    })

    it('lets an inner binding shadow an outer one it does not need', () => {
        expect(mangle('function f(x) { { let x = 1; g(x) } return x }')).toBe(
            'function f(a){{let a=1;g(a)}return a}',
        )
    })

    it('never picks a free name used in the scope', () => {
        expect(mangle('function f(x) { return a + x }')).toBe('function f(b){return a+b}')
    })

    it('never picks a free name used anywhere in the program', () => {
        expect(mangle('function f(x) { return x } function g() { return a }')).toBe(
            'function f(b){return b}function g(){return a}',
        )
    })

    it('renames hoisted vars and function declarations', () => {
        expect(mangle('function f() { g(); x = 1; function g() {} var x; return x }')).toBe(
            'function f(){b();a=1;function b(){}var a;return a}',
        )
    })

    it('renames a loop let captured by closures', () => {
        expect(
            mangle(
                'function f() { var r = []; for (let i = 0; i < 3; i++) r.push(() => i); return r }',
            ),
        ).toBe('function f(){var a=[];for(let b=0;b<3;b++)a.push(()=>b);return a}')
    })

    it('renames class declarations and class expression names consistently', () => {
        expect(mangle('function f() { class A { m() { return A } } return new A }')).toBe(
            'function f(){class a{m(){return a}}return new a}',
        )
        expect(mangle('function f() { return class B { m() { return B } } }')).toBe(
            'function f(){return class a{m(){return a}}}',
        )
    })

    it('renames function expression self-names', () => {
        expect(mangle('x = function fact(n) { return n ? n * fact(n - 1) : 1 }')).toBe(
            'x=function a(b){return b?b*a(b-1):1}',
        )
    })

    it('handles default parameters', () => {
        expect(mangle('function f(x, y = x) { return y }')).toBe('function f(a,b=a){return b}')
        // A body var named like a parameter would start with the parameter's value.
        expect(mangle('function f(x = 1) { var y; return y }')).toBe(
            'function f(a=1){var b;return b}',
        )
        // Defaults see the outer `y`, never the body's.
        expect(
            mangle(
                'function o() { var y = 1; function f(x = y) { var y = 2; return x } return f() }',
            ),
        ).toBe('function o(){var b=1;function a(a=b){var b=2;return a}return a()}')
    })

    it('handles destructuring defaults referencing earlier bindings', () => {
        expect(mangle('function f({p: x, q: y = x}) { return [x, y] }')).toBe(
            'function f({p:a,q:b=a}){return[a,b]}',
        )
        expect(mangle('function f(x) { const value = x; return { value } }')).toBe(
            'function f(a){const b=a;return{value:b}}',
        )
    })

    it('merges a body var with the parameter of the same name', () => {
        expect(mangle('function f(x) { var x; return x }')).toBe('function f(a){var a;return a}')
    })

    it('renames catch parameters', () => {
        expect(mangle('function f() { try { g() } catch (e) { return e } }')).toBe(
            'function f(){try{g()}catch(a){return a}}',
        )
    })

    it('keeps a catch body declaration apart from the catch parameter', () => {
        expect(mangle('function f() { try {} catch (e) { let x = 1; return x } }')).toBe(
            'function f(){try{}catch(a){let b=1;return b}}',
        )
        // A var named like the catch parameter would assign the parameter instead.
        expect(mangle('function f() { try { throw 1 } catch (e) { var x = 2 } return x }')).toBe(
            'function f(){try{throw 1}catch(b){var a=2}return a}',
        )
    })

    it('never renames arguments, properties or labels', () => {
        expect(mangle('function f(x) { return arguments[0] + x }')).toBe(
            'function f(a){return arguments[0]+a}',
        )
        expect(mangle('function f(o) { return o.a + o.x }')).toBe('function f(a){return a.a+a.x}')
        expect(mangle('function f(x) { a: for (;;) { break a } return x }')).toBe(
            'function f(a){a:for(;;){break a}return a}',
        )
    })

    it('renames a local named undefined', () => {
        expect(mangle('function f(undefined) { return undefined }')).toBe('function f(a){return a}')
    })

    it('leaves scopes with eval or with untouched', () => {
        expect(mangle('function f(x) { eval("x") }')).toBe('function f(x){eval("x")}')
        expect(mangle('function f(o, x) { with (o) { return x } }')).toBe(
            'function f(o,x){with(o){return x}}',
        )
        expect(mangle('function f(x) { eval("") } function g(y) { return y }')).toBe(
            'function f(x){eval("")}function g(a){return a}',
        )
    })

    it('keeps names of untouched (Annex B) bindings below a renamed scope occupied', () => {
        expect(
            mangle(
                'function o() { let q = 1; function inner() { { function a() {} } return q } return inner }',
            ),
        ).toBe('function o(){let b=1;function c(){{function a(){}}return b}return c}')
    })

    it('leaves script top-level bindings untouched', () => {
        const code = 'var x=1;let y=2;const z=3;function f(){}class C{}'
        expect(mangle(code)).toBe(code)
        expect(mangle('let x = 1; { let y = x; g(y) }')).toBe('let x=1;{let a=x;g(a)}')
    })

    it('renames module top-level bindings but keeps exported ones', () => {
        expect(
            mangle(
                'import {a as b} from "m"; const x = b; export const y = x; let z = 1; export {z as w}',
            ),
        ).toBe('import{a}from"m";const b=a;export const y=b;let z=1;export{z as w}')
        expect(mangle('export default function f() { return f }')).toBe(
            'export default function f(){return f}',
        )
    })

    it('rewrites renamed imports', () => {
        expect(
            mangle('import {x as y, z} from "m"; import d, * as ns from "n"; y(z, d, ns, y, z, d)'),
        ).toBe('import{x as a,z as b}from"m";import c,*as d from"n";a(b,c,d,a,b,c)')
    })

    it('treats a module reached only through top-level await as a script', () => {
        // Run as a sloppy script, `h` is hoisted out of the block (Annex B): renaming it would break `h()`.
        expect(mangle('await(x);function g(){{function h(){}}h()}')).toBe(
            'await x;function g(){{function h(){}}h()}',
        )
    })

    it('skips reserved words once names get longer', () => {
        const names = Array.from({ length: 1000 }, (_, index) => `v${String(index)}`)
        const output = mangle(`function f() { var ${names.join(', ')}; return [${names.join()}] }`)
        expect(output).toMatch(/^function f\(\)\{var a,b,c,/)
        expect(output).not.toMatch(/\b(do|if|in|of|as)\b/)
        expect(() => parse(output)).not.toThrow()
    })

    it('is deterministic', () => {
        const code =
            'export function f(a, b) { const c = a + b; return [1, 2].map((d) => d * c) } let q = f(1, 2)'
        expect(mangle(code)).toBe(mangle(code))
        expect(mangle(code)).toBe(
            'export function f(a,b){const c=a+b;return[1,2].map(a=>a*c)}let a=f(1,2)',
        )
    })
})

describe('behavior is preserved', () => {
    const programs = [
        'function f(x, y = x * 2) { var z = y; return [x, y, z] } log(f(1))',
        'function o() { var y = 1; function f(x = y) { var y = 2; return [x, y] } return f() } log(o())',
        'function f() { try { throw 1 } catch (e) { var x = 2 } return x } log(f())',
        'function f(x = 1) { var y; return y } log(f())',
        'function f() { var r = []; for (let i = 0; i < 3; i++) r.push(() => i); return r.map((g) => g()) } log(f())',
        'function f() { class A { static n = 1; m() { return A.n } } return new A().m() } log(f())',
        'function f(x) { { let x = 5; log(x) } return x } log(f(1))',
        'x = function fact(n) { return n ? n * fact(n - 1) : 1 }; log(x(5))',
        'function f() { let a = 1; { let b = a; { let a = 2; log(a, b) } } } f()',
        'function f(undefined) { return typeof undefined } log(f(3), f())',
    ]
    for (const code of programs) {
        it(code, () => {
            expect(run(mangle(code))).toEqual(run(code))
        })
    }
})
