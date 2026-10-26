import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import type { Program, Statement } from '../ast.js'
import { ParseError, parse } from '../parse.js'

function first(code: string): Statement {
    const statement = parse(code).body[0]
    if (statement === undefined) {
        throw new Error(`no statement in ${code}`)
    }
    return statement
}

function types(code: string): string[] {
    return parse(code).body.map((s) => s.type)
}

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

describe('variable declarations', () => {
    it('parses var/let/const with several declarators', () => {
        expect(first('var a, b = 1, c')).toMatchObject({
            type: 'VariableDeclaration',
            kind: 'var',
            start: 0,
            end: 15,
            declarations: [
                { id: { name: 'a' }, init: null },
                { id: { name: 'b' }, init: { value: 1 } },
                { id: { name: 'c' }, init: null },
            ],
        })
        expect(first('let x = 1;')).toMatchObject({ kind: 'let', end: 10 })
        expect(first('const y = 2')).toMatchObject({ kind: 'const' })
    })

    it('parses destructuring patterns with defaults and rest', () => {
        const declaration = first('const {a, b: [c = 1, , ...d], ...e} = f')
        expect(declaration).toMatchObject({
            declarations: [
                {
                    id: {
                        type: 'ObjectPattern',
                        properties: [
                            { type: 'Property', shorthand: true, key: { name: 'a' } },
                            {
                                type: 'Property',
                                key: { name: 'b' },
                                value: {
                                    type: 'ArrayPattern',
                                    elements: [
                                        { type: 'AssignmentPattern', left: { name: 'c' } },
                                        null,
                                        { type: 'RestElement', argument: { name: 'd' } },
                                    ],
                                },
                            },
                            { type: 'RestElement', argument: { name: 'e' } },
                        ],
                    },
                    init: { name: 'f' },
                },
            ],
        })
    })

    it('requires initializers where the grammar does', () => {
        expect(failure('const a').offset).toBe(7)
        expect(failure('let [a]').offset).toBe(7)
        expect(failure('var {a}').offset).toBe(7)
        expect(failure('let let = 1').offset).toBe(4)
        expect(failure('const let = 1').offset).toBe(6)
    })

    it('treats let as an identifier where a declaration cannot start', () => {
        expect(first('let')).toMatchObject({ type: 'ExpressionStatement' })
        expect(first('let = 1')).toMatchObject({ expression: { type: 'AssignmentExpression' } })
        expect(first('let.a')).toMatchObject({ expression: { type: 'MemberExpression' } })
        expect(first('var let = 1')).toMatchObject({ type: 'VariableDeclaration', kind: 'var' })
        expect(types('let\nx = 1')).toEqual(['VariableDeclaration'])
        expect(types('if (a) let\nx')).toEqual(['IfStatement', 'ExpressionStatement'])
    })

    it('rejects let [ as a single-statement body', () => {
        expect(failure('if (a) let [x] = y').offset).toBe(7)
        expect(failure('while (a) let x').offset).toBe(14)
        expect(failure('while (a) const x = 1').offset).toBe(10)
    })
})

describe('functions and classes', () => {
    it('parses function, async and generator declarations', () => {
        expect(first('function f(a, b = 1, {c}, [d], ...e) { return a }')).toMatchObject({
            type: 'FunctionDeclaration',
            id: { name: 'f' },
            generator: false,
            async: false,
            params: [
                { type: 'Identifier' },
                { type: 'AssignmentPattern' },
                { type: 'ObjectPattern' },
                { type: 'ArrayPattern' },
                { type: 'RestElement' },
            ],
            body: { type: 'BlockStatement', body: [{ type: 'ReturnStatement' }] },
        })
        expect(first('async function f() { await x }')).toMatchObject({
            async: true,
            start: 0,
            body: { body: [{ expression: { type: 'AwaitExpression' } }] },
        })
        expect(first('function* g() { yield 1; yield* h() }')).toMatchObject({ generator: true })
        expect(first('async function* g() { yield await x }')).toMatchObject({
            async: true,
            generator: true,
        })
    })

    it('requires a name for declarations', () => {
        expect(failure('function () {}').offset).toBe(9)
        expect(failure('class {}').offset).toBe(6)
    })

    it('parses class declarations with every member kind', () => {
        const declaration = first(
            'class A extends B { constructor() { super() } static x = 1; #p = 2; get a() { return 1 } ' +
                'set a(v) {} static { this.y = 1 } async *m() {} [k]() {} }',
        )
        expect(declaration).toMatchObject({
            type: 'ClassDeclaration',
            id: { name: 'A' },
            superClass: { name: 'B' },
        })
        expect(
            declaration.type === 'ClassDeclaration' && declaration.body.body.map((m) => m.type),
        ).toEqual([
            'MethodDefinition',
            'PropertyDefinition',
            'PropertyDefinition',
            'MethodDefinition',
            'MethodDefinition',
            'StaticBlock',
            'MethodDefinition',
            'MethodDefinition',
        ])
    })

    it('does not treat a class or function declaration as an expression statement', () => {
        expect(types('function f() {}\n/re/.test(a)')).toEqual([
            'FunctionDeclaration',
            'ExpressionStatement',
        ])
        expect(types('class A {}\n/re/.test(a)')).toEqual([
            'ClassDeclaration',
            'ExpressionStatement',
        ])
        expect(types('function f() {} + 1')).toEqual(['FunctionDeclaration', 'ExpressionStatement'])
    })

    it('allows return only inside functions', () => {
        expect(failure('return').offset).toBe(0)
        expect(failure('return 1').offset).toBe(0)
        expect(failure('class A { static { return } }').offset).toBe(19)
        expect(failure('{ return }').offset).toBe(2)
        expect(() => parse('class A { x = () => { return 1 } }')).not.toThrow()
        expect(() => parse('function f() { { return } }')).not.toThrow()
    })
})

describe('control flow', () => {
    it('parses if/else with ASI', () => {
        expect(first('if (a) b; else c')).toMatchObject({
            type: 'IfStatement',
            consequent: { type: 'ExpressionStatement' },
            alternate: { type: 'ExpressionStatement' },
        })
        expect(first('if (a) b\nelse c')).toMatchObject({
            alternate: { type: 'ExpressionStatement' },
        })
        expect(first('if (a) {} else if (b) {} else {}')).toMatchObject({
            alternate: { type: 'IfStatement', alternate: { type: 'BlockStatement' } },
        })
        expect(first('if (a);')).toMatchObject({ consequent: { type: 'EmptyStatement' } })
    })

    it('allows a plain function declaration as an if body in sloppy mode only', () => {
        expect(first('if (a) function f() {}')).toMatchObject({
            consequent: { type: 'FunctionDeclaration' },
        })
        expect(failure("'use strict'; if (a) function f() {}").offset).toBe(21)
        expect(failure('if (a) function* f() {}').offset).toBe(7)
        expect(failure('if (a) async function f() {}').offset).toBe(7)
        expect(failure('if (a) class A {}').offset).toBe(7)
        expect(failure('while (a) function f() {}').offset).toBe(10)
    })

    it('parses every for form', () => {
        expect(first('for (;;) break')).toMatchObject({
            type: 'ForStatement',
            init: null,
            test: null,
            update: null,
        })
        expect(first('for (var i = 0, j = 1; i < 10; i++, j--) {}')).toMatchObject({
            init: { type: 'VariableDeclaration', declarations: [{}, {}] },
            test: { type: 'BinaryExpression' },
            update: { type: 'SequenceExpression' },
        })
        expect(first('for (i = 0, j; ;) ;')).toMatchObject({ init: { type: 'SequenceExpression' } })
        expect(first('for (const k in o) x')).toMatchObject({
            type: 'ForInStatement',
            left: { type: 'VariableDeclaration', kind: 'const' },
            right: { name: 'o' },
        })
        expect(first('for (k in o, p) x')).toMatchObject({
            type: 'ForInStatement',
            left: { type: 'Identifier' },
            right: { type: 'SequenceExpression' },
        })
        expect(first('for (const v of arr) x')).toMatchObject({
            type: 'ForOfStatement',
            await: false,
        })
        expect(first('for ([a, b] of arr) x')).toMatchObject({
            type: 'ForOfStatement',
            left: { type: 'ArrayPattern' },
        })
        expect(first('for ({a, b = 1} of arr) x')).toMatchObject({
            left: { type: 'ObjectPattern' },
        })
        expect(first('for (a.b of c) x')).toMatchObject({ left: { type: 'MemberExpression' } })
        expect(first('async function f() { for await (const x of y) z }')).toMatchObject({
            body: { body: [{ type: 'ForOfStatement', await: true }] },
        })
    })

    it('parses legacy and identifier forms of the for head', () => {
        expect(first('for (var a = 1 in o);')).toMatchObject({
            type: 'ForInStatement',
            left: { declarations: [{ init: { value: 1 } }] },
        })
        expect(first('for (let in o);')).toMatchObject({
            type: 'ForInStatement',
            left: { name: 'let' },
        })
        expect(first('for (x of /re/);')).toMatchObject({ right: { type: 'Literal' } })
        expect(first('for (a in b ? c : d);')).toMatchObject({ type: 'ForInStatement' })
    })

    it.each([
        'for (const a;;);',
        'for (let [a];;);',
        'for (let a = 1 of b);',
        'for (var a = 1 of b);',
        'for (let a = 1 in b);',
        'for (var [a] = 1 in b);',
        'for (var a, b of c);',
        'for (let of x);',
        'for (let.a of x);',
        'for (f() of y);',
        'for (x = 1 in y);',
        'for (x = 1 of y);',
        'for (a, b of c);',
        'for (x of y, z);',
        'async function f() { for await (x in y); }',
        'async function f() { for await (;;); }',
        'async function f() { for await (x;;); }',
        "'use strict'; for (var a = 1 in b);",
    ])('rejects the invalid for head %j', (code) => {
        expect(() => parse(code)).toThrow(ParseError)
    })

    it('parses while and do-while, with ASI after do-while', () => {
        expect(first('while (a) { if (b) break; continue }')).toMatchObject({
            type: 'WhileStatement',
        })
        expect(types('do x; while (y) z')).toEqual(['DoWhileStatement', 'ExpressionStatement'])
        expect(types('do x\nwhile (y)\nz')).toEqual(['DoWhileStatement', 'ExpressionStatement'])
        expect(types('do {} while (a); b')).toEqual(['DoWhileStatement', 'ExpressionStatement'])
        expect(first('do ; while (0) ;')).toMatchObject({ end: 16 })
        expect(types('do; while (y) z')).toEqual(['DoWhileStatement', 'ExpressionStatement'])
        expect(types('while (a) do x; while (b) c')).toEqual([
            'WhileStatement',
            'ExpressionStatement',
        ])
    })

    it('parses switch', () => {
        expect(
            first('switch (a) { case 1: b; break; case 2: case 3: { c } default: d }'),
        ).toMatchObject({
            type: 'SwitchStatement',
            cases: [
                { test: { value: 1 }, consequent: [{}, {}] },
                { test: { value: 2 }, consequent: [] },
                { test: { value: 3 }, consequent: [{ type: 'BlockStatement' }] },
                { test: null, consequent: [{}] },
            ],
        })
        expect(first('switch (a) {}')).toMatchObject({ cases: [] })
        expect(failure('switch (a) { default: default: }').offset).toBe(22)
        expect(failure('switch (a) { b }').offset).toBe(13)
        expect(() => parse('switch (1) { case 1: let x; function f() {} }')).not.toThrow()
    })

    it('parses try/catch/finally with optional and pattern catch bindings', () => {
        expect(first('try { a } catch (e) { b }')).toMatchObject({
            handler: { type: 'CatchClause', param: { name: 'e' } },
            finalizer: null,
        })
        expect(first('try { a } catch { b }')).toMatchObject({ handler: { param: null } })
        expect(first('try { a } catch ({message}) { b } finally { c }')).toMatchObject({
            handler: { param: { type: 'ObjectPattern' } },
            finalizer: { type: 'BlockStatement' },
        })
        expect(first('try {} finally {}')).toMatchObject({ handler: null })
        expect(failure('try {}').offset).toBe(6)
        expect(failure('try {} catch () {}').offset).toBe(14)
    })

    it('parses throw and rejects a line break after it', () => {
        expect(first("throw new Error('x')")).toMatchObject({ type: 'ThrowStatement' })
        expect(failure('throw\nx').offset).toBe(6)
        expect(failure('throw').offset).toBe(5)
    })

    it('parses with, debugger, empty statements and blocks', () => {
        expect(first('with (a) b')).toMatchObject({ type: 'WithStatement' })
        expect(types('debugger\ndebugger;')).toEqual(['DebuggerStatement', 'DebuggerStatement'])
        expect(types(';;;')).toEqual(['EmptyStatement', 'EmptyStatement', 'EmptyStatement'])
        expect(first('{}')).toMatchObject({ type: 'BlockStatement', body: [] })
        expect(first('{ a\nb }')).toMatchObject({ body: [{}, {}] })
    })
})

describe('labels, break and continue', () => {
    it('parses labeled statements and labeled jumps', () => {
        expect(first('a: for (;;) { break a }')).toMatchObject({
            type: 'LabeledStatement',
            label: { name: 'a' },
            body: { type: 'ForStatement' },
        })
        expect(() => parse('a: b: for (;;) { continue a }')).not.toThrow()
        expect(() => parse('a: { break a }')).not.toThrow()
        expect(() => parse('a: while (1) { b: while (1) { continue a } }')).not.toThrow()
        expect(() => parse('a: while (1) { function f() { a: ; } }')).not.toThrow()
        expect(first('a: function f() {}')).toMatchObject({ body: { type: 'FunctionDeclaration' } })
        expect(first('foo: bar')).toMatchObject({ body: { type: 'ExpressionStatement' } })
    })

    it('puts a line break between a jump keyword and its label out of play', () => {
        expect(types('a: while (1) { break\na }')).toEqual(['LabeledStatement'])
        expect(first('while (1) { break\na }')).toMatchObject({
            body: { body: [{ label: null }, { type: 'ExpressionStatement' }] },
        })
        expect(first('a: while (1) { continue\na }')).toMatchObject({
            body: { body: { body: [{ label: null }, {}] } },
        })
    })

    it.each([
        ['break', 0],
        ['continue', 0],
        ['function f() { break }', 15],
        ['while (1) { function f() { break } }', 27],
        ['a: { continue a }', 14],
        ['a: while (1) { function f() { continue a } }', 39],
        ['a: a: ;', 3],
        ['a: { a: ; }', 5],
        ['x: while (1) { break y }', 21],
        ['switch (1) { case 1: continue }', 21],
        ['a: class A {}', 3],
        ['a: let x', 7],
    ])('rejects %j at %i', (code, offset) => {
        expect(failure(code).offset).toBe(offset)
    })

    it('accepts break inside switch and continue inside a loop around a switch', () => {
        expect(() => parse('switch (1) { case 1: break }')).not.toThrow()
        expect(() => parse('while (1) switch (1) { case 1: continue }')).not.toThrow()
        expect(() => parse('a: switch (1) { case 1: break a }')).not.toThrow()
    })

    it('reuses a label after its statement ends', () => {
        expect(() => parse('a: ; a: ;')).not.toThrow()
    })
})

describe('ASI', () => {
    it('inserts a semicolon at a line break, before } and at end of input', () => {
        expect(types('a\nb')).toEqual(['ExpressionStatement', 'ExpressionStatement'])
        expect(first('{ a }')).toMatchObject({ body: [{ end: 3 }] })
        expect(first('a')).toMatchObject({ end: 1 })
        expect(types('var a = 1\nvar b = 2')).toEqual([
            'VariableDeclaration',
            'VariableDeclaration',
        ])
        expect(failure('a b').offset).toBe(2)
        expect(failure('var a = 1 var b').offset).toBe(10)
        expect(failure('a b\nc').offset).toBe(2)
    })

    it('does not insert a semicolon where the next line continues the expression', () => {
        expect(types('a\n(b)')).toEqual(['ExpressionStatement'])
        expect(types('a = b\n(c)')).toEqual(['ExpressionStatement'])
        // `let x\n[1]` cannot continue the declaration, so ASI applies (unlike `let x = y\n[1]`).
        expect(types('let x\n[1].map')).toEqual(['VariableDeclaration', 'ExpressionStatement'])
        expect(first('let x\n[1].map')).toMatchObject({
            declarations: [{ init: null }],
        })
        expect(types('let x = y\n[1].map')).toEqual(['VariableDeclaration'])
        expect(types('x = {}\nfoo()')).toEqual(['ExpressionStatement', 'ExpressionStatement'])
        expect(types('a\n`t`')).toEqual(['ExpressionStatement'])
        expect(types('a\n+ b')).toEqual(['ExpressionStatement'])
        expect(types('a\n?.b')).toEqual(['ExpressionStatement'])
        expect(types('a\nin b')).toEqual(['ExpressionStatement'])
        expect(types('a\n.b')).toEqual(['ExpressionStatement'])
    })

    it('parses a regex after a line break only when the previous statement is complete', () => {
        // division: `a / re / g.test(b)`
        expect(types('a\n/re/g.test(b)')).toEqual(['ExpressionStatement'])
        expect(first('a\n/re/g.test(b)')).toMatchObject({
            expression: { type: 'BinaryExpression', operator: '/' },
        })
        // statement boundaries make `/` start a regex
        expect(types('if (a) {}\n/re/.test(b)')).toEqual(['IfStatement', 'ExpressionStatement'])
        expect(types('{}\n/re/.test(b)')).toEqual(['BlockStatement', 'ExpressionStatement'])
        expect(first('if (a) /re/.test(b)')).toMatchObject({
            consequent: { expression: { type: 'CallExpression' } },
        })
        expect(first('while (a)\n/re/.test(b)')).toMatchObject({
            body: { type: 'ExpressionStatement' },
        })
        expect(first('a: /re/.test(b)')).toMatchObject({ body: { type: 'ExpressionStatement' } })
        expect(first('do /re/.test(a); while (b)')).toMatchObject({ type: 'DoWhileStatement' })
        expect(first('if (a) {} else /re/.test(b)')).toMatchObject({
            alternate: { type: 'ExpressionStatement' },
        })
        expect(first('x = a\n++\n/re/.x')).toMatchObject({ type: 'ExpressionStatement' })
        expect(types('function f() {}\n/re/.test(a)')).toEqual([
            'FunctionDeclaration',
            'ExpressionStatement',
        ])
        // an object literal expression is not a statement boundary: this is a division
        expect(failure('({})\n/re/.test(a)').offset).toBe(9)
        expect(failure('x = {}\n/re/.test(a)').offset).toBe(11)
    })

    it('applies the restricted productions', () => {
        expect(first('function f() { return\nx }')).toMatchObject({
            body: {
                body: [
                    { type: 'ReturnStatement', argument: null },
                    { type: 'ExpressionStatement' },
                ],
            },
        })
        expect(first('function f() { return /* a\n*/ x }')).toMatchObject({
            body: { body: [{ argument: null }, {}] },
        })
        expect(first('function f() { return /* a */ x }')).toMatchObject({
            body: { body: [{ argument: { name: 'x' } }] },
        })
        expect(first('function f() { return\n/re/.test(a) }')).toMatchObject({
            body: { body: [{ argument: null }, {}] },
        })
        expect(types('a\n++b')).toEqual(['ExpressionStatement', 'ExpressionStatement'])
        expect(types('a\n--b')).toEqual(['ExpressionStatement', 'ExpressionStatement'])
        expect(first('a\n++\nb')).toMatchObject({ expression: { type: 'Identifier' } })
        expect(first('a++\nb')).toMatchObject({ expression: { type: 'UpdateExpression' } })
        expect(first('function* g() { yield\n1 }')).toMatchObject({
            body: { body: [{ expression: { type: 'YieldExpression', argument: null } }, {}] },
        })
        expect(types('async\nfunction f() {}')).toEqual([
            'ExpressionStatement',
            'FunctionDeclaration',
        ])
        expect(failure('x = async\n(a) => 1').offset).toBe(14)
        expect(failure('(a, b)\n=> 1').offset).toBe(7)
        expect(failure('a\n=> 1').offset).toBe(2)
        expect(failure('x = async (a)\n=> 1').offset).toBe(14)
    })

    it('recognises the offending-token cases', () => {
        expect(types('var a = 1\n++b')).toEqual(['VariableDeclaration', 'ExpressionStatement'])
        expect(types('a = b\n++c')).toEqual(['ExpressionStatement', 'ExpressionStatement'])
        expect(types('for (;;)\n;')).toEqual(['ForStatement'])
        expect(types('if (a) b\nelse c\nd')).toEqual(['IfStatement', 'ExpressionStatement'])
        expect(types('class A { x\ny\nz() {} }')).toEqual(['ClassDeclaration'])
        expect(failure('{ a } b c').offset).toBe(8)
    })

    it('handles let as an identifier around line breaks', () => {
        expect(types('let\nx')).toEqual(['VariableDeclaration'])
        expect(types('let\n[a] = b')).toEqual(['VariableDeclaration'])
        expect(types('let x = 1; let\ny = 2')).toEqual([
            'VariableDeclaration',
            'VariableDeclaration',
        ])
        expect(types('let\n')).toEqual(['ExpressionStatement'])
    })

    it('keeps ASI inside module items', () => {
        expect(types('export default 1\nexport default 2')).toEqual([
            'ExportDefaultDeclaration',
            'ExportDefaultDeclaration',
        ])
        expect(types('import a from "a"\nimport b from "b"')).toEqual([
            'ImportDeclaration',
            'ImportDeclaration',
        ])
        expect(types('export {}\nvar a')).toEqual(['ExportNamedDeclaration', 'VariableDeclaration'])
        expect(failure('import a from "a" import b from "b"').offset).toBe(18)
    })
})

describe('directives and hashbang', () => {
    it('marks the directive prologue of the program and of function bodies', () => {
        const program = parse("'use strict'\n'a'\nfoo\n'late'")
        expect(
            program.body.map((s) => (s.type === 'ExpressionStatement' ? s.directive : 'x')),
        ).toEqual(['use strict', 'a', undefined, undefined])
        expect(first("function f() { 'use strict'; 'x'; a; 'y' }")).toMatchObject({
            body: {
                body: [{ directive: 'use strict' }, { directive: 'x' }, {}, {}],
            },
        })
        expect(first("function f() { 'use strict'; 'x'; a; 'y' }")).toMatchObject({
            body: { body: [{}, {}, {}, { type: 'ExpressionStatement' }] },
        })
    })

    it('does not mark directives inside plain blocks or parenthesized strings', () => {
        expect(first("{ 'use strict' }")).toMatchObject({ body: [{ type: 'ExpressionStatement' }] })
        expect(first("{ 'use strict' }")).not.toMatchObject({ body: [{ directive: 'use strict' }] })
        expect(first("('use strict')")).not.toHaveProperty('directive')
        expect(first("'use strict' + 1")).not.toHaveProperty('directive')
    })

    it('accepts a hashbang line', () => {
        expect(types('#!/usr/bin/env node\nvar a')).toEqual(['VariableDeclaration'])
    })
})

describe('modules', () => {
    it('parses every import form', () => {
        expect(first('import a from "a"')).toMatchObject({
            type: 'ImportDeclaration',
            specifiers: [{ type: 'ImportDefaultSpecifier', local: { name: 'a' } }],
            source: { value: 'a' },
            attributes: [],
        })
        expect(first('import "a"')).toMatchObject({ specifiers: [], source: { value: 'a' } })
        expect(first('import a, { b, c as d } from "a"')).toMatchObject({
            specifiers: [
                { type: 'ImportDefaultSpecifier' },
                { type: 'ImportSpecifier', imported: { name: 'b' }, local: { name: 'b' } },
                { type: 'ImportSpecifier', imported: { name: 'c' }, local: { name: 'd' } },
            ],
        })
        expect(first('import a, * as b from "a"')).toMatchObject({
            specifiers: [
                { type: 'ImportDefaultSpecifier' },
                { type: 'ImportNamespaceSpecifier', local: { name: 'b' } },
            ],
        })
        expect(first('import * as ns from "a"')).toMatchObject({
            specifiers: [{ type: 'ImportNamespaceSpecifier' }],
        })
        expect(first('import { default as x, "str" as y, z, } from "a"')).toMatchObject({
            specifiers: [
                { imported: { name: 'default' }, local: { name: 'x' } },
                { imported: { type: 'Literal', value: 'str' }, local: { name: 'y' } },
                { imported: { name: 'z' } },
            ],
        })
        expect(first('import {} from "a"')).toMatchObject({ specifiers: [] })
        expect(first('import from from "a"')).toMatchObject({
            specifiers: [{ local: { name: 'from' } }],
        })
    })

    it('parses import attributes', () => {
        expect(first("import j from './a.json' with { type: 'json', \"x\": 'y', }")).toMatchObject({
            attributes: [
                { type: 'ImportAttribute', key: { name: 'type' }, value: { value: 'json' } },
                { key: { type: 'Literal', value: 'x' }, value: { value: 'y' } },
            ],
        })
        expect(first("export { a } from 'a' with { type: 'json' }")).toMatchObject({
            attributes: [{ key: { name: 'type' } }],
        })
        expect(first("export * from 'a' with { type: 'json' }")).toMatchObject({
            attributes: [{ key: { name: 'type' } }],
        })
        expect(() => parse("import a from 'a' with { type: 'x', type: 'y' }")).toThrow(ParseError)
        expect(() => parse("import a from 'a' with { type: 1 }")).toThrow(ParseError)
    })

    it('parses every export form', () => {
        expect(first('export var a = 1')).toMatchObject({
            type: 'ExportNamedDeclaration',
            declaration: { type: 'VariableDeclaration' },
            specifiers: [],
            source: null,
        })
        expect(first('export function f() {}')).toMatchObject({
            declaration: { type: 'FunctionDeclaration' },
        })
        expect(first('export async function f() {}')).toMatchObject({
            declaration: { type: 'FunctionDeclaration', async: true, start: 7 },
        })
        expect(first('export class A {}')).toMatchObject({
            declaration: { type: 'ClassDeclaration' },
        })
        expect(first('export default function () {}')).toMatchObject({
            type: 'ExportDefaultDeclaration',
            declaration: { type: 'FunctionDeclaration', id: null },
        })
        expect(first('export default async function () {}')).toMatchObject({
            declaration: { type: 'FunctionDeclaration', id: null, async: true },
        })
        expect(first('export default function* g() {}')).toMatchObject({
            declaration: { id: { name: 'g' }, generator: true },
        })
        expect(first('export default class {}')).toMatchObject({
            declaration: { type: 'ClassDeclaration', id: null },
        })
        expect(first('export default class A extends B {}')).toMatchObject({
            declaration: { id: { name: 'A' } },
        })
        expect(first('export default 1 + 2')).toMatchObject({
            declaration: { type: 'BinaryExpression' },
        })
        expect(first('export default (function () {})')).toMatchObject({
            declaration: { type: 'FunctionExpression' },
        })
        expect(first('export default async () => {}')).toMatchObject({
            declaration: { type: 'ArrowFunctionExpression' },
        })
        expect(first('export default a = 1')).toMatchObject({
            declaration: { type: 'AssignmentExpression' },
        })
        expect(first('export default {}')).toMatchObject({
            declaration: { type: 'ObjectExpression' },
        })
        expect(first('export default /re/.test(a)')).toMatchObject({
            declaration: { type: 'CallExpression' },
        })
        expect(first('export * from "a"')).toMatchObject({
            type: 'ExportAllDeclaration',
            exported: null,
            source: { value: 'a' },
        })
        expect(first('export * as ns from "a"')).toMatchObject({ exported: { name: 'ns' } })
        expect(first('export * as default from "a"')).toMatchObject({
            exported: { name: 'default' },
        })
        expect(first('export * as "x y" from "a"')).toMatchObject({
            exported: { type: 'Literal', value: 'x y' },
        })
        expect(first('export { a as b, c as default, d }; var a, c, d')).toMatchObject({
            declaration: null,
            specifiers: [
                { local: { name: 'a' }, exported: { name: 'b' } },
                { local: { name: 'c' }, exported: { name: 'default' } },
                { local: { name: 'd' }, exported: { name: 'd' } },
            ],
        })
        expect(first('export { a, b as c } from "a"')).toMatchObject({
            source: { value: 'a' },
        })
        expect(first('export { default } from "a"')).toMatchObject({
            specifiers: [{ local: { name: 'default' } }],
        })
        expect(first('export { "a" as b } from "a"')).toMatchObject({
            specifiers: [{ local: { type: 'Literal', value: 'a' } }],
        })
        expect(first('export {}')).toMatchObject({ specifiers: [], source: null })
    })

    it('rejects malformed or misplaced module items', () => {
        expect(failure('function f() { import a from "a" }').offset).toBe(15)
        expect(failure('{ export var a }').offset).toBe(2)
        expect(failure('if (a) { import a from "a" }').offset).toBe(9)
        expect(failure('export default var a').offset).toBe(15)
        expect(failure('export { "a" }').offset).toBe(9)
        expect(failure('export { if }').offset).toBe(9)
        expect(failure('import { default } from "a"').offset).toBe(9)
        expect(failure('import { "a" } from "a"').offset).toBe(9)
        expect(failure('import * as a, b from "a"').offset).toBe(13)
        expect(failure('export async x').offset).toBe(7)
        expect(failure('export async\nfunction f() {}').offset).toBe(7)
        expect(failure('import a from').offset).toBe(13)
        expect(failure('export').offset).toBe(6)
    })

    it('keeps import() and import.meta as expressions', () => {
        expect(first("import('a')")).toMatchObject({ expression: { type: 'ImportExpression' } })
        expect(first('import.meta.url')).toMatchObject({
            expression: { object: { type: 'MetaProperty' } },
        })
        expect(first('import\n.meta')).toMatchObject({ expression: { type: 'MetaProperty' } })
    })
})

describe('source type detection', () => {
    const sourceType = (code: string): Program['sourceType'] => parse(code).sourceType

    it('is a script by default', () => {
        expect(sourceType('var a')).toBe('script')
        expect(sourceType('')).toBe('script')
        expect(sourceType("import('a')")).toBe('script')
        expect(sourceType('var await = 1')).toBe('script')
        expect(sourceType('function f() { await }')).toBe('script')
    })

    it('is a module for import, export and import.meta', () => {
        expect(sourceType('import a from "a"')).toBe('module')
        expect(sourceType('import "a"')).toBe('module')
        expect(sourceType('export var a')).toBe('module')
        expect(sourceType('export {}')).toBe('module')
        expect(sourceType('import.meta.url')).toBe('module')
        expect(sourceType('var a; function f() { return import.meta }')).toBe('module')
    })

    it('is a module for top-level await, for await and top-level await calls', () => {
        expect(sourceType('await x')).toBe('module')
        expect(sourceType('const a = await x')).toBe('module')
        expect(sourceType('await (x)')).toBe('module')
        expect(sourceType('await\nx')).toBe('module')
        expect(sourceType('for await (const a of b) c')).toBe('module')
        expect(sourceType('if (a) { await b }')).toBe('module')
        expect(first('await (x)')).toMatchObject({ expression: { type: 'AwaitExpression' } })
        expect(sourceType('const f = async () => { await x }')).toBe('script')
    })

    it('treats module code as strict', () => {
        expect(failure('export {}; var public').offset).toBe(15)
        expect(failure('export {}; with (a) b').offset).toBe(11)
        expect(failure('export {}; var await').offset).toBe(15)
        expect(failure('export {}; function f() { var await }').offset).toBe(30)
        expect(failure('export {}; eval = 1').offset).toBe(11)
        expect(failure('export {}; (function () { var yield })').offset).toBe(30)
        expect(() => parse('export {}; var a; a.await; a.public')).not.toThrow()
    })

    it('rejects top-level await in a non-async function of a module', () => {
        expect(failure('await a; function f() { await b }').offset).toBeGreaterThan(0)
        expect(failure('await a; const f = () => await b').offset).toBeGreaterThan(0)
        expect(() => parse('await a; async function f() { await b }')).not.toThrow()
    })

    it('reports the module error when the source clearly is a module', () => {
        expect(failure('import a from "a"; var').offset).toBe(22)
        expect(failure('await a;;; )').offset).toBe(11)
    })

    it('reports the script error for plain scripts', () => {
        expect(failure('var a = )').offset).toBe(8)
        expect(failure('var a = 1 2').offset).toBe(10)
    })
})

describe('strict mode', () => {
    it.each([
        ["'use strict'; var yield", 18],
        ["'use strict'; var let", 18],
        ["'use strict'; var static", 18],
        ["'use strict'; var public", 18],
        ["'use strict'; with (a) b", 14],
        ["'use strict'; eval = 1", 14],
        ["'use strict'; arguments++", 14],
        ["'use strict'; var eval", 18],
        ["'use strict'; function eval() {}", 23],
        ["'use strict'; delete a", 14],
        ["'use strict'; (function (eval) {})", 25],
        ["function f() { 'use strict'; with (a) b }", 29],
        ["function f() { 'use strict'; var public }", 33],
        ['class A { m() { var let } }', 20],
        ['class A { m() { with (a) b } }', 16],
        ['class public {}', 6],
        ['class A extends (function () { with (a) b }) {}', 31],
    ])('rejects %j at %i', (code, offset) => {
        expect(failure(code).offset).toBe(offset)
    })

    it('limits strictness to the function or class that declares it', () => {
        expect(() => parse("function f() { 'use strict' } var public")).not.toThrow()
        expect(() => parse("function f() { 'use strict' } with (a) b")).not.toThrow()
        expect(() => parse("function f() { 'use strict' } var arguments")).not.toThrow()
        expect(() => parse('var public; class A { m() {} } var static; with (a) b')).not.toThrow()
        expect(() => parse("(() => { 'use strict' }); var public")).not.toThrow()
        expect(() => parse("x = { m() { 'use strict' } }; var public")).not.toThrow()
        expect(() => parse("'use strict'; delete a.b; delete a[b]; delete f()")).not.toThrow()
    })

    it('keeps sloppy-mode identifiers valid in scripts', () => {
        expect(() => parse('var yield = 1; var let = 2; var static, public, package')).not.toThrow()
        expect(() => parse('eval = 1; arguments++; delete a; with (a) b')).not.toThrow()
    })

    it('only honors an exact use strict directive', () => {
        expect(() => parse("'use\\x20strict'; var public")).not.toThrow()
        expect(() => parse("'use strict' + 1; var public")).not.toThrow()
        expect(() => parse("('use strict'); var public")).not.toThrow()
        expect(() => parse("1; 'use strict'; var public")).not.toThrow()
        expect(() => parse("function f() { 1; 'use strict'; var public }")).not.toThrow()
    })

    it('keeps yield and await as identifiers where they are not reserved', () => {
        expect(() => parse('var yield; yield = 1')).not.toThrow()
        expect(() => parse('function f() { var await }')).not.toThrow()
        expect(failure('function* g() { var yield }').offset).toBe(20)
        expect(failure('async function f() { var await }').offset).toBe(25)
    })
})

describe('ParseError offsets for statements', () => {
    it.each([
        ['}', 0],
        ['{', 1],
        ['var', 3],
        ['var 1', 4],
        ['var a b', 6],
        ['var a,', 6],
        ['if', 2],
        ['if (a) else', 7],
        ['else', 0],
        ['case 1:', 0],
        ['class A', 7],
        ['function f(', 11],
        ['import', 6],
        ['import a', 8],
        ['a: ', 3],
    ])('points %j at offset %i', (code, offset) => {
        expect(failure(code).offset).toBe(offset)
    })
})

describe('real code', () => {
    const root = fileURLToPath(new URL('../', import.meta.url))

    /** Transpiles a TypeScript source file of this package to modern ESM JavaScript. */
    function transpile(file: string): string {
        const source = readFileSync(`${root}${file}`, 'utf8')
        return ts.transpileModule(source, {
            compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2024 },
        }).outputText
    }

    it.each(['lexer.ts', 'parse.ts', 'minify.ts', 'tokenize.ts', 'ast.ts'])(
        'parses the transpiled output of %s as a module',
        (file) => {
            const program = parse(transpile(file))
            expect(program.sourceType === 'module' || file === 'ast.ts').toBe(true)
            expect(program.body.length).toBeGreaterThan(0)
        },
    )

    it('parses a script with sloppy-mode constructs', () => {
        const code = [
            '#!/usr/bin/env node',
            "'use strict'",
            'var fs = require("fs"), path = require("path")',
            'function main(argv) {',
            '    for (var i = 0; i < argv.length; i++) {',
            '        switch (argv[i]) { case "-a": continue; default: break }',
            '    }',
            '    try { fs.readFileSync(path.join(__dirname, "x")) } catch (e) { throw e } finally { done() }',
            '}',
            'module.exports = { main: main }',
        ].join('\n')
        const program = parse(code)
        expect(program.sourceType).toBe('script')
        expect(program.body).toHaveLength(4)
    })
})
