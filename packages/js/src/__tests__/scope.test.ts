import { describe, expect, it } from 'vitest'
import type { Identifier, Node, Program } from '../ast.js'
import { parse } from '../parse.js'
import type { Analysis, Binding, Scope } from '../scope.js'
import { ScopeError, analyze } from '../scope.js'

interface Parsed {
    program: Program
    analysis: Analysis
}

function run(code: string): Parsed {
    const program = parse(code)
    return { program, analysis: analyze(program) }
}

function isNode(value: unknown): value is Node {
    return (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as { type?: unknown }).type === 'string'
    )
}

/** Every Identifier node in walk order (an object key before its value), stable-sorted by start. */
function identifiers(program: Program): Identifier[] {
    const found: Identifier[] = []
    const visit = (node: Node): void => {
        if (node.type === 'Identifier') {
            found.push(node)
        }
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) {
                for (const item of value) {
                    if (isNode(item)) {
                        visit(item)
                    }
                }
            } else if (isNode(value)) {
                visit(value)
            }
        }
    }
    visit(program)
    return found.sort((a, b) => a.start - b.start)
}

function defined<T>(value: T | undefined): T {
    if (value === undefined) {
        throw new Error('missing value')
    }
    return value
}

function allScopes(root: Scope): Scope[] {
    const scopes = [root]
    for (const scope of scopes) {
        scopes.push(...scope.children)
    }
    return scopes
}

function bindingOf(analysis: Analysis, id: Identifier): Binding | null {
    for (const scope of allScopes(analysis.root)) {
        for (const binding of scope.bindings.values()) {
            if (binding.identifiers.includes(id)) {
                return binding
            }
        }
    }
    return null
}

/**
 * Describes every occurrence of `name`, in source order: the index of its binding (numbered by
 * first appearance), `-` for an unresolved reference, `.` for a non-reference (property key,
 * label, member name, import/export name).
 */
function shape(code: string, name: string): string {
    const { program, analysis } = run(code)
    const seen: Binding[] = []
    return identifiers(program)
        .filter((id) => id.name === name)
        .map((id) => {
            const binding = bindingOf(analysis, id)
            if (binding !== null) {
                if (!seen.includes(binding)) {
                    seen.push(binding)
                }
                return String(seen.indexOf(binding))
            }
            return analysis.references.has(id) ? '-' : '.'
        })
        .join(' ')
}

function bindingNamed(code: string, name: string, occurrence = 0): Binding {
    const { program, analysis } = run(code)
    const id = identifiers(program).filter((i) => i.name === name)[occurrence]
    if (id === undefined) {
        throw new Error(`no identifier ${name}`)
    }
    const found = bindingOf(analysis, id)
    if (found === null) {
        throw new Error(`${name} has no binding`)
    }
    return found
}

function scopeError(code: string): ScopeError {
    try {
        analyze(parse(code))
    } catch (error) {
        if (error instanceof ScopeError) {
            return error
        }
        throw error
    }
    throw new Error(`expected ScopeError for ${code}`)
}

function unsafeKinds(code: string): string[] {
    return allScopes(run(code).analysis.root)
        .filter((s) => s.unsafe)
        .map((s) => `${s.kind}@${String(s.node.start)}`)
}

describe('var hoisting', () => {
    it('hoists var out of blocks to the function scope', () => {
        const code = 'function f(){ { var a = 1 } return a } a'
        expect(shape(code, 'a')).toBe('0 0 -')
        expect(bindingNamed(code, 'a').scope.kind).toBe('function')
        expect(bindingNamed(code, 'a').kind).toBe('var')
    })

    it('hoists var out of for, for-in, for-of, labels, switch, catch, if, while and with heads', () => {
        const code =
            'function f(){ for (var i = 0;;) {} for (var j in o) {} for (var k of o) {}' +
            ' l: { var m } switch (x) { case 1: var n } try {} catch (e) { var p }' +
            ' if (x) var q; while (x) { var r } return [i, j, k, m, n, p, q, r] }'
        for (const name of ['i', 'j', 'k', 'm', 'n', 'p', 'q', 'r']) {
            expect(shape(code, name)).toBe('0 0')
            expect(bindingNamed(code, name).scope.kind).toBe('function')
        }
    })

    it('hoists var to the script top level and references before the declaration resolve', () => {
        expect(shape('a; { var a }', 'a')).toBe('0 0')
        expect(bindingNamed('a; { var a }', 'a').scope.kind).toBe('script')
    })

    it('does not hoist var out of a function, arrow or static block', () => {
        expect(shape('function f(){ var a } a', 'a')).toBe('0 -')
        expect(shape('() => { var a }; a', 'a')).toBe('0 -')
        expect(shape('class C { static { var a } } a', 'a')).toBe('0 -')
        expect(bindingNamed('class C { static { var a } }', 'a').scope.kind).toBe('function')
    })

    it('merges redeclared vars and functions into one binding', () => {
        expect(shape('var a; var a = 1; function a(){} a', 'a')).toBe('0 0 0 0')
    })

    it('hoists var destructuring targets and resolves their defaults in place', () => {
        const code = 'function f(){ { let b; var { a = b, [b]: c } = o } }'
        expect(shape(code, 'a')).toBe('. 0')
        expect(shape(code, 'b')).toBe('0 0 0')
        expect(bindingNamed(code, 'c').scope.kind).toBe('function')
    })
})

describe('function declarations', () => {
    it('hoists top-level function declarations', () => {
        expect(shape('f(); function f(){}', 'f')).toBe('0 0')
        expect(bindingNamed('function g(){ f(); function f(){} }', 'f').kind).toBe('function')
    })

    it('treats block functions in strict code as purely block scoped', () => {
        const code = "'use strict'; { function f(){} f } f"
        expect(shape(code, 'f')).toBe('0 0 -')
        expect(unsafeKinds(code)).toEqual([])
    })

    it('treats block functions in modules and classes as block scoped', () => {
        expect(shape('export {}; { function f(){} } f', 'f')).toBe('0 -')
        expect(shape('class C { m() { { function f(){} } f } }', 'f')).toBe('0 -')
    })

    it('models sloppy block functions (Annex B) as a block binding plus a var, all unsafe', () => {
        const code = 'function g(){ { function f(){} f } f }'
        expect(shape(code, 'f')).toBe('0 0 1')
        expect(bindingNamed(code, 'f', 2).scope.kind).toBe('function')
        expect(unsafeKinds(code)).toEqual(['function@0', 'block@14'])
    })

    it('does not hoist an Annex B function past a conflicting lexical binding', () => {
        const code = 'function g(){ let f; { function f(){} } f }'
        expect(shape(code, 'f')).toBe('0 1 0')
        expect(unsafeKinds(code)).toEqual(['function@0', 'block@21'])
        expect(shape('function g(f){ { function f(){} } f }', 'f')).toBe('0 1 0')
        expect(shape('function g(f = 1){ { function f(){} } f }', 'f')).toBe('0 1 0')
        expect(shape('{ let f; { function f(){} } } f', 'f')).toBe('0 1 -')
    })

    it('hoists an Annex B function into an existing var and through a catch parameter', () => {
        expect(shape('var f; { function f(){} } f', 'f')).toBe('0 1 0')
        expect(shape('try {} catch (f) { { function f(){} } f } f', 'f')).toBe('0 1 0 2')
    })

    it('wraps a sloppy if-statement function body in its own block scope', () => {
        const code = 'if (x) function f(){} else function g(){} f; g'
        expect(shape(code, 'f')).toBe('0 1')
        expect(shape(code, 'g')).toBe('0 1')
        expect(bindingNamed(code, 'f').scope.kind).toBe('block')
    })

    it('allows duplicate plain functions in a sloppy block, nowhere else', () => {
        expect(shape('{ function f(){} function f(){} f }', 'f')).toBe('0 0 0')
        expect(scopeError("'use strict'; { function f(){} function f(){} }").message).toMatch(
            /already declared/,
        )
        expect(() => run('{ function f(){} function* f(){} }')).toThrow(ScopeError)
        expect(() => run('{ async function f(){} function f(){} }')).toThrow(ScopeError)
        expect(() => run('export {}; function f(){} function f(){}')).toThrow(ScopeError)
    })
})

describe('lexical declarations and TDZ', () => {
    it('binds a reference before a let to the block binding (TDZ)', () => {
        expect(shape('let a = 1; { a; let a = 2 }', 'a')).toBe('0 1 1')
        expect(shape('const a = 1; { a; class a {} }', 'a')).toBe('0 1 1')
    })

    it('gives a for statement its own scope for let/const heads', () => {
        const code = 'for (let i = 0; i < 3; i++) { let i; i } i'
        expect(shape(code, 'i')).toBe('0 0 0 1 1 -')
        const loop = bindingNamed(code, 'i').scope
        expect(loop.kind).toBe('block')
        expect(loop.node.type).toBe('ForStatement')
    })

    it('resolves the right side of for-of/for-in let heads to the TDZ binding', () => {
        expect(shape('let x; for (let x of x) {}', 'x')).toBe('0 1 1')
        expect(shape('let x; for (const x in x) {}', 'x')).toBe('0 1 1')
        expect(shape('let x; for (var y of x) {}', 'x')).toBe('0 0')
    })

    it('resolves closures in loops to the loop binding', () => {
        expect(shape('for (let i of a) fs.push(() => i)', 'i')).toBe('0 0')
    })

    it('scopes switch cases together, discriminant outside', () => {
        const code = 'let a; switch (a) { case 1: let a; break; case a: a }'
        expect(shape(code, 'a')).toBe('0 0 1 1 1')
        expect(bindingNamed(code, 'a', 2).scope.node.type).toBe('SwitchStatement')
    })

    it('throws ScopeError on illegal redeclarations', () => {
        for (const code of [
            'let a; let a',
            'let a; var a',
            'var a; let a',
            'const a = 1; function a(){}',
            'function a(){} class a {}',
            '{ let a; { var a } }',
            '{ var a; let a }',
            'class C {} class C {}',
            'let [a, a] = o',
            'for (let i of x) { var i }',
            'for (let [i, i] of x) {}',
            'switch (x) { case 1: let a; case 2: let a }',
            'function f(a) { let a }',
            'function f(a = 1) { const a = 1 }',
            'function f() { let a; var a }',
            'class C { static { let a; var a } }',
            "import { a } from 'm'; var a",
            "import a from 'm'; import { b as a } from 'n'",
            "import a from 'm'; function a() {}",
        ]) {
            expect(() => run(code), code).toThrow(ScopeError)
        }
    })

    it('accepts legal redeclarations', () => {
        for (const code of [
            'var a; var a',
            'function a(){} var a',
            'var a; function a(){}',
            'function a(){} function a(){}',
            'function f(a) { var a; function a(){} }',
            'function f(a = 1) { var a }',
            'let a; { let a } ',
            'let a; function f() { var a }',
            'for (let i;;) { let i }',
            '(function a() { let a })',
            'class a { m(a) { let b } }',
            'try {} catch (e) { var e }',
            // Top-level functions of a static block are var-scoped (V8 agrees; acorn rejects).
            'class C { static { var c; function c() {} function c() {} } }',
        ]) {
            expect(() => run(code), code).not.toThrow()
        }
    })

    it('reports the offset of the conflicting declaration', () => {
        const error = scopeError('let a; let a')
        expect(error.name).toBe('ScopeError')
        expect(error.offset).toBe(11)
        expect(scopeError('{ let a; { var a } }').offset).toBe(15)
    })
})

describe('classes', () => {
    it('resolves class declaration names inside and outside the class to one binding', () => {
        const code = 'class C extends C { m() { return C } } C'
        expect(shape(code, 'C')).toBe('0 0 0 0')
        expect(bindingNamed(code, 'C').kind).toBe('class')
        expect(bindingNamed(code, 'C').scope.kind).toBe('script')
    })

    it('scopes class declarations in blocks', () => {
        expect(shape('{ class C {} C } C', 'C')).toBe('0 0 -')
    })

    it('binds a class expression name only inside the class', () => {
        const code = 'const D = class C { m() { return C } }; C'
        expect(shape(code, 'C')).toBe('0 0 -')
        expect(bindingNamed(code, 'C').scope.kind).toBe('class')
    })

    it('evaluates heritage and computed keys in the class scope', () => {
        expect(shape('(class C extends C { [C] = C; [C]() {} })', 'C')).toBe('0 0 0 0 0')
        expect(shape('(class extends k { [k] = k })', 'k')).toBe('- - -')
    })

    it('never treats class member names or private names as references', () => {
        const code = 'class K { f = 1; g() {} static h; get i() {} #p; m() { this.#p; this.f } }'
        for (const name of ['f', 'g', 'h', 'i', 'm']) {
            expect(shape(`${code} ${name}`, name)).toMatch(/^(\. )+-$/)
        }
    })

    it('gives field initializers and static blocks their own function-like scope', () => {
        const code =
            'function f() { class A { x = arguments; static { var v; let w; arguments } } }'
        const { analysis } = run(code)
        const kinds = allScopes(analysis.root).map((s) => `${s.kind}:${s.node.type}`)
        expect(kinds).toContain('function:PropertyDefinition')
        expect(kinds).toContain('function:StaticBlock')
        expect(shape(code, 'arguments')).toBe('- -')
        expect(bindingNamed(code, 'w').scope.node.type).toBe('StaticBlock')
    })
})

describe('parameters', () => {
    it('declares simple parameters in the function scope', () => {
        const code = 'function f(a, b) { return a + b }'
        expect(bindingNamed(code, 'a').kind).toBe('param')
        expect(bindingNamed(code, 'a').scope.kind).toBe('function')
    })

    it('uses a separate params scope when the parameter list is not simple', () => {
        const { analysis } = run('function f(a = 1) { let b }')
        const params = defined(analysis.root.children[0])
        expect(params.kind).toBe('params')
        expect([...params.bindings.keys()]).toEqual(['a'])
        const body = defined(params.children[0])
        expect(body.kind).toBe('function')
        expect([...body.bindings.keys()]).toEqual(['b'])
    })

    it('resolves defaults to earlier parameters, later ones (TDZ) and outer names', () => {
        expect(shape('function f(a, b = a) {}', 'a')).toBe('0 0')
        expect(shape('function f(b = a, a) {}', 'a')).toBe('0 0')
        expect(shape('let a; function f(b = a) { var a }', 'a')).toBe('0 0 1')
    })

    it('does not let defaults see body declarations', () => {
        expect(shape('function f(a = g) { function g(){} }', 'g')).toBe('- 0')
        expect(shape('function f(a = () => x) { var x = 1 }', 'x')).toBe('- 0')
    })

    it('merges a body var or function with a parameter of the same name', () => {
        expect(shape('function f(a = 1) { var a; return a }', 'a')).toBe('0 0 0')
        expect(shape('function f({ a }) { function a(){} a }', 'a')).toBe('. 0 0 0')
        expect(bindingNamed('function f(a = 1) { var a }', 'a', 1).kind).toBe('param')
    })

    it('handles destructuring parameters with defaults and computed keys', () => {
        const code = 'function f({ [k]: a = b, b } = d, ...[c = a]) {}'
        expect(shape(code, 'k')).toBe('-')
        expect(shape(code, 'b')).toBe('0 . 0')
        expect(shape(code, 'a')).toBe('0 0')
        expect(bindingNamed(code, 'c').kind).toBe('param')
    })

    it('allows duplicate parameters only in sloppy simple non-arrow non-method lists', () => {
        expect(shape('function f(a, a) { a }', 'a')).toBe('0 0 0')
        expect(shape('(function (a, a) {})', 'a')).toBe('0 0')
        for (const code of [
            '(a, a) => 1',
            'function f(a, a = 1) {}',
            'function f(a, [a]) {}',
            "function f(a, a) { 'use strict' }",
            "'use strict'; function f(a, a) {}",
            '({ m(a, a) {} })',
            'class C { m(a, a) {} }',
            'try {} catch ([e, e]) {}',
        ]) {
            expect(() => run(code), code).toThrow(ScopeError)
        }
    })

    it('handles arrow functions, generators and async functions', () => {
        expect(shape('const f = async (x) => await x; x', 'x')).toBe('0 0 -')
        expect(
            shape('async function* g(a) { yield a; await a; for await (const b of a) b }', 'a'),
        ).toBe('0 0 0 0')
        expect(shape('x => y => x + y', 'x')).toBe('0 0')
    })
})

describe('function expression names', () => {
    it('binds the name in its own scope around the function', () => {
        const code = '(function f() { return f }); f'
        expect(shape(code, 'f')).toBe('0 0 -')
        const scope = bindingNamed(code, 'f').scope
        expect(scope.kind).toBe('block')
        expect(scope.node.type).toBe('FunctionExpression')
        expect(scope.children[0]?.kind).toBe('function')
    })

    it('is shadowed by parameters, vars and inner functions', () => {
        expect(shape('(function f(f) { return f })', 'f')).toBe('0 1 1')
        expect(shape('(function f() { var f; return f })', 'f')).toBe('0 1 1')
        expect(shape('(function f(a = f) { var f })', 'f')).toBe('0 0 1')
    })

    it('does not give methods or arrows a self name', () => {
        expect(shape('({ f() { return f } })', 'f')).toBe('. -')
    })
})

describe('catch', () => {
    it('binds the parameter in a catch scope', () => {
        const code = 'try {} catch (e) { e } e'
        expect(shape(code, 'e')).toBe('0 0 -')
        expect(bindingNamed(code, 'e').kind).toBe('catch')
        expect(bindingNamed(code, 'e').scope.kind).toBe('catch')
    })

    it('binds destructured parameters in the catch scope and the body in a block below it', () => {
        const code = 'try {} catch ({ a, b = a }) { let c; a }'
        expect(shape(code, 'a')).toBe('. 0 0 0')
        const body = bindingNamed(code, 'c').scope
        expect(body.kind).toBe('block')
        expect(body.parent?.kind).toBe('catch')
    })

    it('does not let parameter defaults see the body declarations', () => {
        expect(shape('let a; try {} catch ({ b = a }) { let a }', 'a')).toBe('0 0 1')
        expect(shape("'use strict'; try {} catch ({ [k]: b }) { function k() {} }", 'k')).toBe(
            '- 0',
        )
        // Sloppy: Annex B hoists k to the script, which the key does see.
        expect(shape('try {} catch ({ [k]: b }) { function k() {} }', 'k')).toBe('0 1')
    })

    it('rejects lexical redeclaration of the parameter and var over a pattern parameter', () => {
        expect(() => run('try {} catch (e) { let e }')).toThrow(ScopeError)
        expect(() => run('try {} catch ([e]) { var e }')).toThrow(ScopeError)
        expect(() => run('try {} catch (e) { for (var e of x) {} }')).not.toThrow()
    })

    it('marks var-over-catch-parameter (Annex B) unsafe up to the var scope', () => {
        const code = 'function f(){ try {} catch (e) { { var e = 1 } } return e }'
        expect(shape(code, 'e')).toBe('0 1 1')
        expect(unsafeKinds(code)).toEqual(['function@0', 'catch@21', 'block@31', 'block@33'])
    })

    it('handles a catch without a parameter', () => {
        expect(shape('try {} catch { let x; x }', 'x')).toBe('0 0')
    })
})

describe('references and non-references', () => {
    it('tracks shorthand properties as references, keys as names', () => {
        expect(shape('const a = 1; const o = { a }', 'a')).toBe('0 . 0')
        expect(shape('let a; ({ a } = o)', 'a')).toBe('0 . 0')
        expect(shape('let a; ({ a = a } = o)', 'a')).toBe('0 . 0 0')
        expect(shape('let { a = a } = o', 'a')).toBe('. 0 0')
    })

    it('treats member names, keys and meta properties as non-references', () => {
        expect(shape('a.b; a?.b; a[b]', 'b')).toBe('. . -')
        expect(shape('({ b: 1, [b]: 2, b() {}, get b() {}, "b": b })', 'b')).toBe('. - . . -')
        expect(shape('function f() { new.target; target }', 'target')).toBe('. -')
    })

    it('does not treat labels as bindings or references', () => {
        expect(shape('var a; a: for (;;) { break a; continue a; a }', 'a')).toBe('0 . . . 0')
        expect(shape('a: { break a }', 'a')).toBe('. .')
    })

    it('collects references in templates, tagged templates, spread and calls', () => {
        expect(shape('let t; t`a${t}b${[...t]}`; new t(t)(t)', 't')).toBe('0 0 0 0 0 0 0')
    })

    it('maps every reference to its binding or null', () => {
        const { program, analysis } = run('let a; a; b; typeof c')
        const [declA, refA, refB, refC] = identifiers(program)
        expect(declA).toBeDefined()
        expect(analysis.references.has(defined(declA))).toBe(false)
        expect(analysis.references.get(defined(refA))?.name).toBe('a')
        expect(analysis.references.get(defined(refB))).toBeNull()
        expect(analysis.references.get(defined(refC))).toBeNull()
    })

    it('treats this, super and import.meta as non-identifiers', () => {
        const { analysis } = run('class A extends B { m() { return this.x + super.y } }')
        expect([...analysis.unresolved]).toEqual(['B'])
    })
})

describe('unresolved names', () => {
    it('collects free names per scope, transitively', () => {
        const { analysis } = run('let a; function f() { return g + h.k + a; function i() { j } }')
        expect([...analysis.unresolved].sort()).toEqual(['g', 'h', 'j'])
        expect(analysis.root.unresolved).toBe(analysis.unresolved)
        const f = defined(analysis.root.children[0])
        expect([...f.unresolved].sort()).toEqual(['g', 'h', 'j'])
        expect([...defined(f.children[0]).unresolved]).toEqual(['j'])
    })

    it('includes typeof of undeclared names', () => {
        expect([...run('typeof undeclaredThing').analysis.unresolved]).toEqual(['undeclaredThing'])
    })

    it('records outer bindings used inside a scope in through', () => {
        const code = 'function f(){ let a; { a; var b } }'
        const { analysis } = run(code)
        const f = defined(analysis.root.children[0])
        const block = defined(f.children[0])
        expect([...block.through].map((b) => b.name).sort()).toEqual(['a', 'b'])
        expect([...f.through]).toEqual([])
    })
})

describe('arguments and this', () => {
    it('leaves arguments implicit and unresolved up to its function only', () => {
        const code = 'function f() { return () => arguments }'
        const { analysis } = run(code)
        expect(shape(code, 'arguments')).toBe('-')
        expect(analysis.unresolved.has('arguments')).toBe(false)
        const f = defined(analysis.root.children[0])
        expect(f.unresolved.has('arguments')).toBe(true)
    })

    it('does not resolve arguments to an outer binding across a function', () => {
        expect(
            shape('function f(arguments) { function g() { return arguments } }', 'arguments'),
        ).toBe('0 -')
        expect(shape('function f(arguments) { return arguments }', 'arguments')).toBe('0 0')
        expect(shape('function f(a = arguments) {}', 'arguments')).toBe('-')
    })

    it('treats top-level arguments in a script as a global', () => {
        expect(run('arguments').analysis.unresolved.has('arguments')).toBe(true)
    })

    it('marks a function that var-declares arguments unsafe', () => {
        const code = 'function f() { var arguments; return arguments }'
        expect(shape(code, 'arguments')).toBe('0 0')
        expect(unsafeKinds(code)).toEqual(['function@0'])
        expect(unsafeKinds('function f() { let arguments }')).toEqual([])
    })

    it('records nothing for this', () => {
        const { analysis } = run('function f() { return this }')
        expect(analysis.unresolved.size).toBe(0)
    })
})

describe('eval and with', () => {
    it('marks direct eval scopes, their ancestors and descendants unsafe', () => {
        const code =
            'function f() { function g() { eval(s); function k() {} } function h() { var y } }'
        expect(unsafeKinds(code)).toEqual(['script@0', 'function@0', 'function@15', 'function@39'])
    })

    it('treats optional eval calls as direct and indirect eval as safe', () => {
        expect(unsafeKinds('function f() { eval?.(s) }')).toEqual(['script@0', 'function@0'])
        expect(unsafeKinds('function f() { (0, eval)(s); window.eval(s) }')).toEqual([])
    })

    it('marks with statements unsafe around and inside', () => {
        const code = 'function f(o) { with (o) { let a; x } } function g() {}'
        expect(unsafeKinds(code)).toEqual(['script@0', 'function@0', 'block@25'])
    })

    it('marks eval in a parameter default', () => {
        expect(unsafeKinds('function f(a = eval(s)) { { let b } }')).toEqual([
            'script@0',
            'params@0',
            'function@0',
            'block@26',
        ])
    })
})

describe('modules', () => {
    it('declares imports as module bindings and never imported names', () => {
        const code = "import d, { a as b, c } from 'm'; import * as ns from 'n'; b; d; ns"
        expect(shape(code, 'a')).toBe('.')
        expect(shape(code, 'b')).toBe('0 0')
        expect(shape(code, 'c')).toBe('. 0')
        for (const [name, occurrence] of [
            ['b', 0],
            ['c', 1],
            ['d', 0],
            ['ns', 0],
        ] as const) {
            expect(bindingNamed(code, name, occurrence).kind).toBe('import')
            expect(bindingNamed(code, name, occurrence).scope.kind).toBe('module')
        }
    })

    it('marks exported declarations', () => {
        const code =
            'export const a = 1, { b } = o; export var v; export function f(){} export class C {}' +
            ' export default function g(){} let n'
        for (const name of ['a', 'v', 'f', 'C', 'g']) {
            expect(bindingNamed(code, name).exported, name).toBe(true)
        }
        expect(bindingNamed(code, 'b', 1).exported).toBe(true)
        expect(bindingNamed(code, 'n').exported).toBe(false)
    })

    it('marks export specifier locals exported and resolves them as references', () => {
        const code = 'const x = 1; export { x as y, x }'
        expect(shape(code, 'x')).toBe('0 0 0 .')
        expect(shape(code, 'y')).toBe('.')
        expect(bindingNamed(code, 'x').exported).toBe(true)
        expect(bindingNamed("import { a } from 'm'; export { a }", 'a', 1).exported).toBe(true)
    })

    it('treats re-exports as names only', () => {
        expect(shape("export { a as b } from 'm'; export * as a from 'n'", 'a')).toBe('. .')
    })

    it('resolves export default expressions as references', () => {
        expect(shape('let a; export default a', 'a')).toBe('0 0')
        expect(shape('export default class { m() { a } }', 'a')).toBe('-')
    })

    it('rejects exporting undeclared names and duplicate export names', () => {
        expect(() => run('export { z }')).toThrow(ScopeError)
        expect(() => run('function f() { var z } export { z }')).toThrow(ScopeError)
        expect(() => run('let a; export { a, a }')).toThrow(ScopeError)
        expect(() => run('let a; export { a as default }; export default 1')).toThrow(ScopeError)
        expect(() => run("export * as m from 'm'; export const m = 1")).toThrow(ScopeError)
    })

    it('reports module syntax only for import, export and import.meta', () => {
        expect(run("import 'x'").analysis.hasModuleSyntax).toBe(true)
        expect(run('export {}').analysis.hasModuleSyntax).toBe(true)
        expect(run('import.meta.url').analysis.hasModuleSyntax).toBe(true)
        expect(run('function f() { import.meta }').analysis.hasModuleSyntax).toBe(true)
        expect(run("import('x')").analysis.hasModuleSyntax).toBe(false)
        const tla = run('await x')
        expect(tla.program.sourceType).toBe('module')
        expect(tla.analysis.hasModuleSyntax).toBe(false)
        expect(tla.analysis.root.kind).toBe('module')
        expect(run('var a').analysis.root.kind).toBe('script')
    })
})

describe('structure', () => {
    it('links scopes to parents and nodes', () => {
        const { analysis, program } = run('function f() { { let a } }')
        expect(analysis.root.parent).toBeNull()
        expect(analysis.root.node).toBe(program)
        const f = defined(analysis.root.children[0])
        expect(f.parent).toBe(analysis.root)
        expect(f.children[0]?.parent).toBe(f)
    })

    it('tracks strictness', () => {
        const { analysis } = run(
            "function f() { 'use strict'; { } } function g() { (class { m() {} }) }",
        )
        const [f, g] = analysis.root.children as [Scope, Scope]
        expect(analysis.root.strict).toBe(false)
        expect(f.strict).toBe(true)
        expect(f.children[0]?.strict).toBe(true)
        expect(g.strict).toBe(false)
        expect(g.children[0]?.strict).toBe(true)
    })
})
