import { describe, expect, it } from 'vitest'
import type { Expression, ExpressionStatement, Node } from '../ast.js'
import { Lexer } from '../lexer.js'
import { ParseError, parse } from '../parse.js'

/** Parses `code` and returns the expression of its first (expression) statement. */
function expr(code: string): Expression {
    const statement = parse(code).body[0]
    if (statement?.type !== 'ExpressionStatement') {
        throw new Error(`expected an expression statement for ${code}`)
    }
    return statement.expression
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

/** Compact S-expression rendering so precedence and structure can be asserted in one line. */
function sx(node: Node | null): string {
    if (node === null) {
        return '_'
    }
    if (node.type === 'Identifier') {
        return node.name
    }
    if (node.type === 'PrivateIdentifier') {
        return `#${node.name}`
    }
    if (node.type === 'Literal') {
        return node.raw
    }
    if (node.type === 'ThisExpression') {
        return 'this'
    }
    if (node.type === 'Super') {
        return 'super'
    }
    if (
        node.type === 'BinaryExpression' ||
        node.type === 'LogicalExpression' ||
        node.type === 'AssignmentExpression'
    ) {
        return `(${node.operator} ${sx(node.left)} ${sx(node.right)})`
    }
    if (node.type === 'UnaryExpression') {
        return `(${node.operator} ${sx(node.argument)})`
    }
    if (node.type === 'UpdateExpression') {
        return node.prefix
            ? `(${node.operator}x ${sx(node.argument)})`
            : `(x${node.operator} ${sx(node.argument)})`
    }
    if (node.type === 'ConditionalExpression') {
        return `(? ${sx(node.test)} ${sx(node.consequent)} ${sx(node.alternate)})`
    }
    if (node.type === 'SequenceExpression') {
        return `(, ${node.expressions.map(sx).join(' ')})`
    }
    if (node.type === 'MemberExpression') {
        const op = `${node.optional ? '?.' : '.'}${node.computed ? '[]' : ''}`
        return `(${op} ${sx(node.object)} ${sx(node.property)})`
    }
    if (node.type === 'CallExpression') {
        return `(${node.optional ? 'call?' : 'call'} ${[node.callee, ...node.arguments].map(sx).join(' ')})`
    }
    if (node.type === 'NewExpression') {
        return `(new ${[node.callee, ...node.arguments].map(sx).join(' ')})`
    }
    if (node.type === 'ChainExpression') {
        return `(chain ${sx(node.expression)})`
    }
    if (node.type === 'ArrayExpression' || node.type === 'ArrayPattern') {
        return `[${node.elements.map(sx).join(' ')}]`
    }
    if (node.type === 'SpreadElement') {
        return `...${sx(node.argument)}`
    }
    if (node.type === 'RestElement') {
        return `...${sx(node.argument)}`
    }
    if (node.type === 'AssignmentPattern') {
        return `(= ${sx(node.left)} ${sx(node.right)})`
    }
    if (node.type === 'ObjectPattern' || node.type === 'ObjectExpression') {
        return `{${node.properties.map(sx).join(' ')}}`
    }
    if (node.type === 'Property') {
        if (node.shorthand) {
            return node.value.type === 'AssignmentPattern' ? sx(node.value) : sx(node.key)
        }
        return `${sx(node.key)}:${sx(node.value)}`
    }
    if (node.type === 'AwaitExpression') {
        return `(await ${sx(node.argument)})`
    }
    if (node.type === 'YieldExpression') {
        return `(yield${node.delegate ? '*' : ''} ${sx(node.argument)})`
    }
    if (node.type === 'ArrowFunctionExpression') {
        const body =
            node.body.type === 'BlockStatement'
                ? `{${String(node.body.body.length)}}`
                : sx(node.body)
        return `(${node.async ? 'async ' : ''}=> (${node.params.map(sx).join(' ')}) ${body})`
    }
    return node.type
}

function sxOf(code: string): string {
    return sx(expr(code))
}

describe('operators and precedence', () => {
    it.each<[string, string]>([
        ['a + b * c', '(+ a (* b c))'],
        ['a * b + c', '(+ (* a b) c)'],
        ['a - b - c', '(- (- a b) c)'],
        ['a / b % c * d', '(* (% (/ a b) c) d)'],
        ['a ** b ** c', '(** a (** b c))'],
        ['(a ** b) ** c', '(** (** a b) c)'],
        ['a * b ** c', '(* a (** b c))'],
        ['2 ** -x', '(** 2 (- x))'],
        ['a << b + c', '(<< a (+ b c))'],
        ['a >> b >>> c', '(>>> (>> a b) c)'],
        ['a < b == c > d', '(== (< a b) (> c d))'],
        ['a <= b != c >= d', '(!= (<= a b) (>= c d))'],
        ['a === b !== c', '(!== (=== a b) c)'],
        ['a & b | c ^ d', '(| (& a b) (^ c d))'],
        ['a | b & c', '(| a (& b c))'],
        ['a && b || c && d', '(|| (&& a b) (&& c d))'],
        ['a || b && c', '(|| a (&& b c))'],
        ['a in b instanceof c', '(instanceof (in a b) c)'],
        ['a + b in c', '(in (+ a b) c)'],
        ['a ?? b ?? c', '(?? (?? a b) c)'],
        ['(a ?? b) || c', '(|| (?? a b) c)'],
        ['a ?? (b || c)', '(?? a (|| b c))'],
        ['(a, b)', '(, a b)'],
        ['a, b, c', '(, a b c)'],
    ])('%s', (code, expected) => {
        expect(sxOf(code)).toBe(expected)
    })

    it('rejects an unparenthesized unary operand of **', () => {
        expect(failure('-a ** 2').offset).toBe(0)
        expect(failure('typeof a ** 2').offset).toBe(0)
        expect(failure('!a ** 2').offset).toBe(0)
        expect(sxOf('(-a) ** 2')).toBe('(** (- a) 2)')
        expect(sxOf('a++ ** 2')).toBe('(** (x++ a) 2)')
        expect(sxOf('++a ** 2')).toBe('(** (++x a) 2)')
    })

    it('rejects mixing ?? with || or && without parentheses', () => {
        for (const code of ['a ?? b || c', 'a || b ?? c', 'a && b ?? c', 'a ?? b && c']) {
            expect(failure(code).offset, code).toBe(0)
        }
        expect(sxOf('(a && b) ?? c')).toBe('(?? (&& a b) c)')
        expect(sxOf('a ?? (b && c)')).toBe('(?? a (&& b c))')
    })

    it('produces LogicalExpression for && || ?? and BinaryExpression otherwise', () => {
        expect(expr('a ?? b')).toMatchObject({ type: 'LogicalExpression', operator: '??' })
        expect(expr('a && b')).toMatchObject({ type: 'LogicalExpression', operator: '&&' })
        expect(expr('a | b')).toMatchObject({ type: 'BinaryExpression', operator: '|' })
        expect(expr('a in b')).toMatchObject({ type: 'BinaryExpression', operator: 'in' })
    })

    it('parses private-name brand checks (#x in obj)', () => {
        expect(expr('#x in a')).toMatchObject({
            type: 'BinaryExpression',
            operator: 'in',
            left: { type: 'PrivateIdentifier', name: 'x' },
            right: { type: 'Identifier', name: 'a' },
        })
        expect(sxOf('a && #x in b')).toBe('(&& a (in #x b))')
        expect(failure('a + #x in b').offset).toBe(4)
        expect(failure('#x + 1').offset).toBe(0)
        expect(failure('#x').offset).toBe(0)
    })
})

describe('unary, update, conditional, sequence', () => {
    it.each<[string, string]>([
        ['!a', '(! a)'],
        ['~a', '(~ a)'],
        ['-a', '(- a)'],
        ['+a', '(+ a)'],
        ['typeof a', '(typeof a)'],
        ['void 0', '(void 0)'],
        ['delete a.b', '(delete (. a b))'],
        ['- -a', '(- (- a))'],
        ['typeof typeof a', '(typeof (typeof a))'],
        ['!!a', '(! (! a))'],
        ['++a', '(++x a)'],
        ['--a', '(--x a)'],
        ['a++', '(x++ a)'],
        ['a--', '(x-- a)'],
        ['a++ + ++b', '(+ (x++ a) (++x b))'],
        ['-a++', '(- (x++ a))'],
        ['a ? b : c ? d : e', '(? a b (? c d e))'],
        ['a ? b ? c : d : e', '(? a (? b c d) e)'],
        ['(a ? b : c) ? d : e', '(? (? a b c) d e)'],
        ['a ? (b) : c', '(? a b c)'],
        ['a = b ? c : d', '(= a (? b c d))'],
        ['a ? b = c : d = e', '(? a (= b c) (= d e))'],
    ])('%s', (code, expected) => {
        expect(sxOf(code)).toBe(expected)
    })

    it('does not treat a newline before ++ as postfix', () => {
        const body = parse('a\n++b').body
        expect(
            body.map((s) => (s.type === 'ExpressionStatement' ? sx(s.expression) : s.type)),
        ).toEqual(['a', '(++x b)'])
    })

    it('has the ESTree UnaryExpression/UpdateExpression shape', () => {
        expect(expr('!a')).toMatchObject({ type: 'UnaryExpression', operator: '!', prefix: true })
        expect(expr('a++')).toMatchObject({
            type: 'UpdateExpression',
            operator: '++',
            prefix: false,
        })
        expect(expr('--a')).toMatchObject({
            type: 'UpdateExpression',
            operator: '--',
            prefix: true,
        })
    })
})

describe('assignment', () => {
    it.each([
        '=',
        '+=',
        '-=',
        '*=',
        '/=',
        '%=',
        '**=',
        '<<=',
        '>>=',
        '>>>=',
        '&=',
        '|=',
        '^=',
        '&&=',
        '||=',
        '??=',
    ])('operator %s', (operator) => {
        expect(expr(`a ${operator} b`)).toMatchObject({
            type: 'AssignmentExpression',
            operator,
            left: { type: 'Identifier', name: 'a' },
            right: { type: 'Identifier', name: 'b' },
        })
        expect(expr(`a.b ${operator} c`)).toMatchObject({
            type: 'AssignmentExpression',
            left: { type: 'MemberExpression' },
        })
    })

    it('is right associative', () => {
        expect(sxOf('a = b = c')).toBe('(= a (= b c))')
        expect(sxOf('a += b -= c')).toBe('(+= a (-= b c))')
    })

    it('converts array and object literals into patterns', () => {
        expect(expr('[a, b] = c')).toMatchObject({
            type: 'AssignmentExpression',
            left: { type: 'ArrayPattern', elements: [{ name: 'a' }, { name: 'b' }] },
        })
        expect(sxOf('[a, , ...b] = c')).toBe('(= [a _ ...b] c)')
        expect(sxOf('({a, b: c, ...d} = e)')).toBe('(= {a b:c ...d} e)')
        expect(sxOf('({a = 1, b: [c = 2]} = d)')).toBe('(= {(= a 1) b:[(= c 2)]} d)')
        expect(sxOf('[a.b, c[d]] = e')).toBe('(= [(. a b) (.[] c d)] e)')
        expect(sxOf('[(a), (b.c)] = d')).toBe('(= [a (. b c)] d)')
        expect(sxOf('({a: {b = 1}} = c)')).toBe('(= {a:{(= b 1)}} c)')
        expect(sxOf('x = {a, b} = c')).toBe('(= x (= {a b} c))')
    })

    it('shapes shorthand properties with defaults like ESTree', () => {
        expect(expr('({a = 1} = b)')).toMatchObject({
            left: {
                type: 'ObjectPattern',
                properties: [
                    {
                        type: 'Property',
                        shorthand: true,
                        key: { name: 'a' },
                        value: {
                            type: 'AssignmentPattern',
                            left: { name: 'a' },
                            right: { value: 1 },
                        },
                    },
                ],
            },
        })
    })

    it.each([
        ['1 = 2', 0],
        ['a + b = c', 0],
        ['(a, b) = c', 1],
        ['({a}) = 1', 1],
        ['([a]) = 1', 1],
        ['a?.b = 1', 0],
        ['a++ = 1', 0],
        ['a() = 1', 0],
        ['[a, ...b,] = c', 4],
        ['[...a, b] = c', 1],
        ['({...a, b} = c)', 2],
        ['({a: 1} = b)', 5],
        ['[a + 1] = b', 1],
        ['++a++', 2],
        ['--1', 2],
        ['a?.b++', 0],
        ['({a = 1})', 4],
        ['f({a = 1})', 5],
        ['[{a = 1}]', 4],
        ['({a = 1}, b)', 4],
        ['x = {a = 1}', 7],
    ])('rejects invalid target in %s (offset %i)', (code, offset) => {
        expect(failure(code).offset).toBe(offset)
    })

    it('accepts parenthesized simple targets', () => {
        expect(sxOf('(a) = 1')).toBe('(= a 1)')
        expect(sxOf('(a.b) = 1')).toBe('(= (. a b) 1)')
        expect(sxOf('(a)++')).toBe('(x++ a)')
    })
})

describe('arrow functions', () => {
    it.each<[string, string]>([
        ['x => x', '(=> (x) x)'],
        ['(x) => x', '(=> (x) x)'],
        ['() => 1', '(=> () 1)'],
        ['(x, y) => x + y', '(=> (x y) (+ x y))'],
        ['(a = 1, {b, c}, [d, e], ...f) => 0', '(=> ((= a 1) {b c} [d e] ...f) 0)'],
        ['({a = 1}) => a', '(=> ({(= a 1)}) a)'],
        ['(a, [b, c] = [], {d} = {}) => 0', '(=> (a (= [b c] []) (= {d} {})) 0)'],
        ['(...[a, b]) => 0', '(=> (...[a b]) 0)'],
        ['(...{length}) => 0', '(=> (...{length}) 0)'],
        ['async x => x', '(async => (x) x)'],
        ['async (x) => x', '(async => (x) x)'],
        ['async () => 1', '(async => () 1)'],
        ['async (a, b = 1, ...c) => a', '(async => (a (= b 1) ...c) a)'],
        ['async => a', '(=> (async) a)'],
        ['async(a, b)', '(call async a b)'],
        ['async + 1', '(+ async 1)'],
        ['x => y => z', '(=> (x) (=> (y) z))'],
        ['x => (y, z)', '(=> (x) (, y z))'],
        ['x => ({})', '(=> (x) {})'],
        ['x => { a; b }', '(=> (x) {2})'],
        ['async x => { }', '(async => (x) {0})'],
        ['a ? x => y : z => w', '(? a (=> (x) y) (=> (z) w))'],
        ['x = y => y', '(= x (=> (y) y))'],
        ['(x => x)(1)', '(call (=> (x) x) 1)'],
        ['((a,) => a)', '(=> (a) a)'],
        ['(a,) => a', '(=> (a) a)'],
    ])('%s', (code, expected) => {
        expect(sxOf(code)).toBe(expected)
    })

    it('has the ESTree ArrowFunctionExpression shape', () => {
        expect(expr('x => x')).toMatchObject({
            type: 'ArrowFunctionExpression',
            id: null,
            expression: true,
            generator: false,
            async: false,
            params: [{ type: 'Identifier', name: 'x' }],
            body: { type: 'Identifier', name: 'x' },
        })
        expect(expr('async () => {}')).toMatchObject({
            async: true,
            expression: false,
            body: { type: 'BlockStatement', body: [] },
        })
    })

    it.each([
        ['x\n=> 1', 2],
        ['(a)\n=> 1', 4],
        ['async x\n=> 1', 6],
        ['a + x => 1', 6],
        ['x => {} + 1', 8],
        ['x => {}()', 7],
        ['((a)) => 1', 2],
        ['([(a)]) => 1', 3],
        ['(a.b) => 1', 1],
        ['(1) => 1', 1],
        ['(a, ...b,) => 1', 4],
        ['(...a, b) => 1', 1],
        ['() + 1', 1],
        ['()', 1],
        ['(a,) + 1', 3],
        ['(...a)', 1],
        ['({a: 1}) => 1', 5],
        ['(a, a.b) => 1', 4],
    ])('rejects %j', (code, offset) => {
        expect(failure(code).offset).toBe(offset)
    })

    it('allows a trailing comma only after a non-rest parameter', () => {
        expect(sxOf('(a, b,) => a')).toBe('(=> (a b) a)')
    })
})

describe('function and class expressions', () => {
    it('parses function expressions of every kind', () => {
        expect(expr('(function(){})')).toMatchObject({
            type: 'FunctionExpression',
            id: null,
            params: [],
            generator: false,
            async: false,
            body: { type: 'BlockStatement', body: [] },
        })
        expect(expr('(function* g(a, b = 1, [c], {d}, ...e){})')).toMatchObject({
            type: 'FunctionExpression',
            id: { name: 'g' },
            generator: true,
            params: [
                { type: 'Identifier' },
                { type: 'AssignmentPattern' },
                { type: 'ArrayPattern' },
                { type: 'ObjectPattern' },
                { type: 'RestElement' },
            ],
        })
        expect(expr('(async function f(){})')).toMatchObject({ async: true, generator: false })
        expect(expr('(async function* (){})')).toMatchObject({ async: true, generator: true })
        expect(expr('(function(a,){})')).toMatchObject({ params: [{ name: 'a' }] })
    })

    it('parses expression statements and directives in function bodies', () => {
        const fn = expr("(function(){ 'use strict'; a; 'b'; c })")
        expect(fn).toMatchObject({
            body: {
                body: [
                    { type: 'ExpressionStatement', directive: 'use strict' },
                    { type: 'ExpressionStatement' },
                    { type: 'ExpressionStatement' },
                    { type: 'ExpressionStatement' },
                ],
            },
        })
        const statements = (fn as { body: { body: ExpressionStatement[] } }).body.body
        const third = statements[2]
        expect(third).not.toHaveProperty('directive')
    })

    it('parses class expressions with members', () => {
        const cls = expr(
            '(class A extends B { a = 1; b; static c = 2; #d = 3; static #e; [f] = 4; "g" = 5; m(){} static s(){} get x(){} set x(v){} async am(){} *gm(){} async *agm(){} #p(){} static { a } constructor(){} })',
        )
        expect(cls).toMatchObject({
            type: 'ClassExpression',
            id: { name: 'A' },
            superClass: { name: 'B' },
        })
        const members = (cls as { body: { body: Node[] } }).body.body
        expect(
            members.map((m) => `${m.type}${'static' in m && m.static ? ':static' : ''}`),
        ).toEqual([
            'PropertyDefinition',
            'PropertyDefinition',
            'PropertyDefinition:static',
            'PropertyDefinition',
            'PropertyDefinition:static',
            'PropertyDefinition',
            'PropertyDefinition',
            'MethodDefinition',
            'MethodDefinition:static',
            'MethodDefinition',
            'MethodDefinition',
            'MethodDefinition',
            'MethodDefinition',
            'MethodDefinition',
            'MethodDefinition',
            'StaticBlock',
            'MethodDefinition',
        ])
        expect(members[3]).toMatchObject({
            key: { type: 'PrivateIdentifier', name: 'd' },
            computed: false,
        })
        expect(members[5]).toMatchObject({ computed: true, key: { name: 'f' } })
        expect(members[9]).toMatchObject({ kind: 'get' })
        expect(members[10]).toMatchObject({ kind: 'set' })
        expect(members[16]).toMatchObject({ kind: 'constructor' })
        expect(members[7]).toMatchObject({ kind: 'method', value: { type: 'FunctionExpression' } })
        expect(members[11]).toMatchObject({ value: { async: true } })
        expect(members[12]).toMatchObject({ value: { generator: true } })
    })

    it('treats modifier words as plain keys when followed by ( = ; }', () => {
        const cls = expr(
            '(class { get; set; static; async; get = 1; static = 2; get(){} set(){} static(){} async(){} })',
        )
        const names = (
            cls as { body: { body: { key: { name: string }; static: boolean; kind?: string }[] } }
        ).body.body.map((m) => `${m.key.name}${m.static ? ':static' : ''}${m.kind ?? ''}`)
        expect(names).toEqual([
            'get',
            'set',
            'static',
            'async',
            'get',
            'static',
            'getmethod',
            'setmethod',
            'staticmethod',
            'asyncmethod',
        ])
        const asModifiers = expr(
            '(class { static get a(){} static async *b(){} static static(){} })',
        )
        expect(
            (asModifiers as { body: { body: { static: boolean; kind: string }[] } }).body.body.map(
                (m) => `${String(m.static)}:${m.kind}`,
            ),
        ).toEqual(['true:get', 'true:method', 'true:method'])
    })

    it('parses ASI between class fields', () => {
        const cls = expr('(class { a\nb\nc = 1\nd })')
        expect((cls as { body: { body: unknown[] } }).body.body).toHaveLength(4)
        expect(failure('(class { a = 1 b = 2 })').offset).toBe(15)
    })

    it('parses super in constructors and methods', () => {
        expect(() =>
            parse('(class extends A { constructor(){ super(); super.x; super[y]; super.z() } })'),
        ).not.toThrow()
        expect(() => parse('({ m(){ super.x } })')).not.toThrow()
        expect(sxOf('(class extends A { m(){ super.x } })')).toBe('ClassExpression')
        expect(failure('super.x').offset).toBe(0)
        expect(failure('(class { constructor(){ super() } })').offset).toBe(24)
        expect(failure('(class extends A { m(){ super() } })').offset).toBe(24)
        expect(failure('({ m: function(){ super.x } })').offset).toBe(18)
        expect(failure('({ m(){ super() } })').offset).toBe(8)
        expect(() =>
            parse('(class extends A { constructor(){ (() => super())() } })'),
        ).not.toThrow()
    })

    it('represents super as a Super node', () => {
        const fn = expr('(class extends A { m(){ super.x } })') as unknown as {
            body: { body: { value: { body: { body: ExpressionStatement[] } } }[] }
        }
        const statement = fn.body.body[0]?.value.body.body[0]
        expect(statement?.expression).toMatchObject({
            type: 'MemberExpression',
            object: { type: 'Super' },
            property: { name: 'x' },
        })
    })

    it('validates accessor arity and constructor kinds', () => {
        expect(failure('(class { get a(b){} })').offset).toBe(14)
        expect(failure('(class { set a(){} })').offset).toBe(14)
        expect(failure('(class { set a(...b){} })').offset).toBe(14)
        expect(failure('({ get a(b){} })').offset).toBe(8)
        expect(failure('({ set a(b, c){} })').offset).toBe(8)
        expect(failure('(class { get constructor(){} })').offset).toBe(13)
        expect(failure('(class { *constructor(){} })').offset).toBe(10)
        expect(failure('(class { constructor(){} constructor(){} })').offset).toBe(25)
        expect(failure('(class { #constructor })').offset).toBe(9)
        expect(() =>
            parse('(class { static constructor(){} static constructor(){} })'),
        ).not.toThrow()
    })

    it('parses the heritage as a left-hand-side expression', () => {
        expect(() => parse('(class A extends B.c {})')).not.toThrow()
        expect(() => parse('(class A extends B() {})')).not.toThrow()
        expect(() => parse('(class A extends (a, b) {})')).not.toThrow()
        expect(failure('(class A extends a ? b : c {})').offset).toBe(19)
        expect(failure('(class A extends a + b {})').offset).toBe(19)
    })

    it('supports new.target only inside functions', () => {
        expect(expr('(function(){ new.target })')).toMatchObject({ type: 'FunctionExpression' })
        expect(failure('new.target').offset).toBe(0)
        expect(failure('(() => new.target)').offset).toBe(7)
        expect(failure('(function(){ new.foo })').offset).toBe(17)
    })
})

describe('object and array literals', () => {
    it('parses arrays with holes and spread', () => {
        expect(sxOf('[a, , b]')).toBe('[a _ b]')
        expect(sxOf('[a,]')).toBe('[a]')
        expect(sxOf('[,]')).toBe('[_]')
        expect(sxOf('[,,]')).toBe('[_ _]')
        expect(sxOf('[...a, b, ...c]')).toBe('[...a b ...c]')
        expect(sxOf('[]')).toBe('[]')
    })

    it('parses object literals of every property form', () => {
        const obj = expr(
            "({a, b: 1, 'c': 2, 3: 3, [d]: 4, 0x10: 5, 1n: 6, ...e, m(){}, get g(){}, set s(v){}, async am(){}, *gm(){}, async *agm(){}, [c](){}, if: 1, class: 2})",
        ) as unknown as { properties: Node[] }
        const shapes = obj.properties.map((p) => {
            if (p.type === 'SpreadElement') {
                return 'spread'
            }
            if (p.type !== 'Property') {
                return p.type
            }
            const flags = [
                p.kind,
                p.method ? 'method' : '',
                p.shorthand ? 'short' : '',
                p.computed ? 'computed' : '',
            ]
            return flags.filter((f) => f !== '').join('+')
        })
        expect(shapes).toEqual([
            'init+short',
            'init',
            'init',
            'init',
            'init+computed',
            'init',
            'init',
            'spread',
            'init+method',
            'get',
            'set',
            'init+method',
            'init+method',
            'init+method',
            'init+method+computed',
            'init',
            'init',
        ])
    })

    it('has the ESTree Property shape', () => {
        expect(expr('({a: 1})')).toMatchObject({
            type: 'ObjectExpression',
            properties: [
                {
                    type: 'Property',
                    key: { type: 'Identifier', name: 'a' },
                    value: { type: 'Literal', value: 1 },
                    kind: 'init',
                    method: false,
                    shorthand: false,
                    computed: false,
                },
            ],
        })
        expect(expr('({m(a){}})')).toMatchObject({
            properties: [
                { method: true, value: { type: 'FunctionExpression', params: [{ name: 'a' }] } },
            ],
        })
    })

    it('treats get/set/async as plain keys when followed by , : ( } =', () => {
        expect(sxOf('({get: 1, set: 2, async: 3, static: 4})')).toBe(
            '{get:1 set:2 async:3 static:4}',
        )
        expect(sxOf('({async, get, set})')).toBe('{async get set}')
        expect(expr('({get(){}, set(){}, async(){}})')).toMatchObject({
            properties: [{ method: true }, { method: true }, { method: true }],
        })
        expect(expr('({get get(){}, async get(){}})')).toMatchObject({
            properties: [
                { kind: 'get', key: { name: 'get' } },
                { method: true, value: { async: true } },
            ],
        })
    })

    it('accepts a trailing comma and rejects stray commas', () => {
        expect(sxOf('({a,})')).toBe('{a}')
        expect(failure('({ , })').offset).toBe(3)
        expect(failure('({ a, , b })').offset).toBe(6)
        expect(failure('({ a b })').offset).toBe(5)
        expect(failure('({ if })').offset).toBe(6)
        expect(failure('({ 1 })').offset).toBe(5)
    })
})

describe('templates', () => {
    it('parses template literals', () => {
        expect(expr('`a${b}c${d}e`')).toMatchObject({
            type: 'TemplateLiteral',
            quasis: [
                { type: 'TemplateElement', value: { raw: 'a', cooked: 'a' }, tail: false },
                { value: { raw: 'c', cooked: 'c' }, tail: false },
                { value: { raw: 'e', cooked: 'e' }, tail: true },
            ],
            expressions: [{ name: 'b' }, { name: 'd' }],
        })
        expect(expr('``')).toMatchObject({
            quasis: [{ value: { raw: '', cooked: '' }, tail: true }],
        })
    })

    it('gives template elements acorn-compatible offsets', () => {
        const template = expr('`a${b}c`')
        expect(template).toMatchObject({
            start: 0,
            end: 8,
            quasis: [
                { start: 1, end: 2 },
                { start: 6, end: 7 },
            ],
        })
    })

    it('parses nested templates and substitutions containing braces and backticks', () => {
        expect(sxOf('`${`${a}`}`')).toBe('TemplateLiteral')
        const nested = expr('`a${`b${c}d`}e`') as unknown as {
            expressions: { quasis: { value: { raw: string } }[] }[]
        }
        expect(nested.expressions[0]?.quasis.map((q) => q.value.raw)).toEqual(['b', 'd'])
        expect(expr('`${{a: 1}.a}`')).toMatchObject({ expressions: [{ type: 'MemberExpression' }] })
        expect(expr('`${"}"}`')).toMatchObject({ expressions: [{ value: '}' }] })
        expect(expr("`${'`'}`")).toMatchObject({ expressions: [{ value: '`' }] })
        expect(expr('`${/}/.source}`')).toMatchObject({
            expressions: [{ type: 'MemberExpression' }],
        })
        expect(expr('`${a => `${a}`}`')).toMatchObject({
            expressions: [{ type: 'ArrowFunctionExpression' }],
        })
        expect(expr('`$${a}`')).toMatchObject({
            quasis: [{ value: { raw: '$' } }, { value: { raw: '' } }],
        })
        expect(expr('`\\${a}`')).toMatchObject({
            quasis: [{ value: { raw: '\\${a}', cooked: '${a}' } }],
        })
    })

    it('handles comments and newlines inside templates', () => {
        expect(expr('`a${ /* } */ b }c`')).toMatchObject({ expressions: [{ name: 'b' }] })
        expect(expr('`l1\nl2`')).toMatchObject({
            quasis: [{ value: { raw: 'l1\nl2', cooked: 'l1\nl2' } }],
        })
        expect(expr('`a\r\nb`')).toMatchObject({
            quasis: [{ value: { raw: 'a\nb', cooked: 'a\nb' } }],
        })
    })

    it('parses tagged templates (including nested and chained)', () => {
        expect(expr('a`b`')).toMatchObject({
            type: 'TaggedTemplateExpression',
            tag: { name: 'a' },
            quasi: { type: 'TemplateLiteral' },
        })
        expect(expr('a.b`c${d}`')).toMatchObject({ tag: { type: 'MemberExpression' } })
        expect(expr('a`b``c`')).toMatchObject({
            type: 'TaggedTemplateExpression',
            tag: { type: 'TaggedTemplateExpression' },
        })
        expect(expr('a`${b`c`}`')).toMatchObject({
            quasi: { expressions: [{ type: 'TaggedTemplateExpression' }] },
        })
        expect(sxOf('new a`b`')).toBe('(new TaggedTemplateExpression)')
    })

    it('allows invalid escapes (cooked null) only in tagged templates', () => {
        expect(expr('tag`\\unicode and \\xerror`')).toMatchObject({
            quasi: { quasis: [{ value: { cooked: null, raw: '\\unicode and \\xerror' } }] },
        })
        expect(failure('`\\unicode`').offset).toBe(0)
        expect(failure('`\\xZ`').offset).toBe(0)
        expect(failure('`\\01`').offset).toBe(0)
        expect(expr('`\\0`')).toMatchObject({ quasis: [{ value: { cooked: '\0' } }] })
    })

    it('reports unterminated templates at the chunk start', () => {
        expect(failure('a = `abc').offset).toBe(4)
        expect(failure('a = `abc${b').offset).toBe(11)
        expect(failure('a = `abc${b}').offset).toBe(11)
        expect(failure('`a${b c}`').offset).toBe(6)
    })
})

describe('regular expressions and division', () => {
    it('parses regex literals with flags', () => {
        const node = expr('/a+b/gimsuyd')
        expect(node).toMatchObject({
            type: 'Literal',
            raw: '/a+b/gimsuyd',
            regex: { pattern: 'a+b', flags: 'gimsuyd' },
        })
        expect((node as { value: RegExp }).value).toBeInstanceOf(RegExp)
        expect(expr('/[/]/')).toMatchObject({ regex: { pattern: '[/]', flags: '' } })
        expect(expr('/\\//')).toMatchObject({ regex: { pattern: '\\/' } })
        expect(expr('/(?<n>a)\\k<n>/u')).toMatchObject({ regex: { flags: 'u' } })
    })

    it('rejects patterns the engine reports as syntax errors', () => {
        expect(failure('/?a/').offset).toBe(0)
        expect(failure('x = /(/').offset).toBe(4)
        expect(failure('x = /a/vu').offset).toBe(7)
    })

    it('keeps value null for v-flag patterns, which a host may not support', () => {
        const node = expr('/[\\p{L}--[a-z]]/v')
        expect(node).toMatchObject({ regex: { flags: 'v' } })
        expect(() => parse('/(/v')).not.toThrow()
    })

    it('rejects a pending shorthand initializer once subscripts follow the literal', () => {
        expect(failure('[{a=1}].x = 1').offset).toBe(3)
        expect(failure('({a=1}.x = 1)').offset).toBe(3)
        expect(failure('({a=1}).x = 1').offset).toBe(3)
        expect(sxOf('({a=1} = 1)')).toBe('(= {(= a 1)} 1)')
    })

    it('decides regex vs division from the parser position', () => {
        expect(sxOf('a / b / c')).toBe('(/ (/ a b) c)')
        expect(sxOf('a++ / 2')).toBe('(/ (x++ a) 2)')
        expect(sxOf('(a) / 2 / 3')).toBe('(/ (/ a 2) 3)')
        expect(sxOf('[a] / b')).toBe('(/ [a] b)')
        expect(sxOf('this / 2 / 3')).toBe('(/ (/ this 2) 3)')
        expect(sxOf('1 / 2 / 3')).toBe('(/ (/ 1 2) 3)')
        expect(sxOf('a.b / c / d')).toBe('(/ (/ (. a b) c) d)')
        expect(sxOf('a() / c / d')).toBe('(/ (/ (call a) c) d)')
        expect(sxOf('a /= 2')).toBe('(/= a 2)')
        expect(sxOf('a = /=/')).toBe('(= a /=/)')
        expect(sxOf('a = /=/g')).toBe('(= a /=/g)')
        expect(sxOf('x = a /= 1 / 2')).toBe('(= x (/= a (/ 1 2)))')
        expect(sxOf('`${a}` / 2 / 3')).toBe('(/ (/ TemplateLiteral 2) 3)')
        expect(sxOf('/a/ / 2')).toBe('(/ /a/ 2)')
        expect(sxOf('/a/.source / 2')).toBe('(/ (. /a/ source) 2)')
    })

    it('treats / as a regex start in every operand position', () => {
        for (const code of [
            'x = /re/',
            'x = (1, /re/)',
            'x = [/re/g]',
            'x = a ? /re/ : 1 / 2',
            'x = !/re/.test(a)',
            'x = typeof /re/',
            'x = void /re/',
            'x = +/1/',
            'x = a || /re/',
            'x = a ?? /re/',
            'x = a in /re/',
            'x = a instanceof /re/',
            'f(a, /re/)',
            'x = {a: /re/, [/re/]: 1}',
            'x = a => /re/',
            'x = async a => /re/',
            'x = (function*(){ yield /re/ })',
            '/re/.test(x)',
        ]) {
            const node = parse(code).body[0]
            expect(node?.type, code).toBe('ExpressionStatement')
            expect(
                JSON.stringify(node, (_k, v: unknown) => (typeof v === 'bigint' ? 0 : v)),
                code,
            ).toContain('"regex"')
        }
    })

    it('treats a newline before / as division, not ASI', () => {
        expect(parse('x = a\n/b/g').body).toHaveLength(1)
        expect(sxOf('x = a\n/b/g')).toBe('(= x (/ (/ a b) g))')
    })

    it('reports invalid regex literals', () => {
        expect(failure('a = /abc').offset).toBe(4)
        expect(failure('a = /[/').offset).toBe(4)
        expect(failure('a = /a\\\n/').offset).toBe(4)
        expect(failure('/abc/gg').offset).toBe(5)
        expect(failure('/abc/x').offset).toBe(5)
    })
})

describe('numeric literals', () => {
    it.each<[string, number]>([
        ['0', 0],
        ['1', 1],
        ['.5', 0.5],
        ['5.', 5],
        ['0.0', 0],
        ['1.5e10', 1.5e10],
        ['1E-5', 1e-5],
        ['1e+3', 1000],
        ['.5e1', 5],
        ['0x1F', 31],
        ['0XaB', 171],
        ['0o17', 15],
        ['0O17', 15],
        ['0b101', 5],
        ['0B11', 3],
        ['017', 15],
        ['08', 8],
        ['089', 89],
        ['08.5', 8.5],
        ['1_000_000', 1000000],
        ['0xf', 15],
        ['0xA_B', 171],
        ['0b1_0', 2],
        ['1_0.0_1e1_0', 10.01e10],
        ['9007199254740993', 9007199254740992],
        ['1e400', Infinity],
    ])('%s', (raw, value) => {
        expect(expr(raw)).toMatchObject({ type: 'Literal', raw, value })
    })

    it.each<[string, bigint, string]>([
        ['123n', 123n, '123'],
        ['0xFFn', 255n, '255'],
        ['0b11n', 3n, '3'],
        ['0o7n', 7n, '7'],
        ['1_0n', 10n, '10'],
        ['9007199254740993n', 9007199254740993n, '9007199254740993'],
    ])('bigint %s', (raw, value, bigint) => {
        expect(expr(raw)).toMatchObject({ type: 'Literal', raw, value, bigint })
    })

    it('parses member access on numbers', () => {
        expect(sxOf('5..toString()')).toBe('(call (. 5. toString))')
        expect(sxOf('5 .toString()')).toBe('(call (. 5 toString))')
        expect(sxOf('.5.toFixed(1)')).toBe('(call (. .5 toFixed) 1)')
        expect(sxOf('0x10.toString()')).toBe('(call (. 0x10 toString))')
    })

    it.each([
        ['1_', 1],
        ['1__2', 2],
        ['1_.5', 1],
        ['1._5', 2],
        ['0_1', 1],
        ['1e', 1],
        ['1e+', 1],
        ['0x', 2],
        ['0b2', 2],
        ['0o8', 2],
        ['0b1_', 3],
        ['1.5n', 3],
        ['1e3n', 3],
        ['01n', 2],
        ['3in a', 1],
        ['3a', 1],
        ['0x1g', 3],
        ['1.toString()', 2],
    ])('rejects %j at %i', (code, offset) => {
        expect(failure(code).offset).toBe(offset)
    })
})

describe('string literals', () => {
    it.each<[string, string]>([
        ["'a'", 'a'],
        ['"b"', 'b'],
        ["'\\n\\t\\r\\b\\f\\v\\0'", '\n\t\r\b\f\v\0'],
        ["'\\x41\\u0041\\u{41}\\u{1F600}'", 'AAA\u{1F600}'],
        ["'\\ud83d\\ude00'", '\u{1F600}'],
        ["'a\\\nb'", 'ab'],
        ["'a\\\r\nb'", 'ab'],
        ["'a\\ b'", 'ab'],
        ["'\\a\\z\\'\\\"\\\\'", 'az\'"\\'],
        ["'\\101\\7\\377\\08'", 'A\x07\xff\x008'],
        ["'\\12'", '\n'],
        ["'\\400'", ' 0'],
        ["'\\78'", '\x078'],
        ["'\\8\\9'", '89'],
        ['" "', ' '],
        ["'\\u2028'", ' '],
        ["'\"'", '"'],
        ['"\'"', "'"],
    ])('%j', (raw, value) => {
        expect(expr(raw)).toMatchObject({ type: 'Literal', raw, value })
    })

    it('reports bad strings', () => {
        expect(failure("a = 'abc").offset).toBe(4)
        expect(failure('a = "abc\ndef"').offset).toBe(4)
        expect(failure("a = 'abc\\").offset).toBe(4)
        expect(failure("'\\u{110000}'").offset).toBe(1)
        expect(failure("'\\xZZ'").offset).toBe(1)
        expect(failure("'\\u12'").offset).toBe(1)
        expect(failure("'\\u{}'").offset).toBe(1)
    })
})

describe('member access, calls, new and optional chaining', () => {
    it.each<[string, string]>([
        ['a.b.c', '(. (. a b) c)'],
        ['a[b][c]', '(.[] (.[] a b) c)'],
        ['a(b)(c)', '(call (call a b) c)'],
        ['a.b(c).d[e](f)', '(call (.[] (. (call (. a b) c) d) e) f)'],
        ['a.if.class.new', '(. (. (. a if) class) new)'],
        ['f(a, b,)', '(call f a b)'],
        ['f(...a, b, ...c)', '(call f ...a b ...c)'],
        ['new a', '(new a)'],
        ['new a()', '(new a)'],
        ['new a.b()', '(new (. a b))'],
        ['new a.b.c(d)', '(new (. (. a b) c) d)'],
        ['new (a())()', '(new (call a))'],
        ['new (a.b())', '(new (call (. a b)))'],
        ['new new a()()', '(new (new a))'],
        ['new new a', '(new (new a))'],
        ['new a().b', '(. (new a) b)'],
        ['new a()()', '(call (new a))'],
        ['new a.b`c`', '(new TaggedTemplateExpression)'],
        ['new a[b]()', '(new (.[] a b))'],
        ['new F(...a)', '(new F ...a)'],
        ['new a.b().c()', '(call (. (new (. a b)) c))'],
        ['a?.b', '(chain (?. a b))'],
        ['a?.[b]', '(chain (?.[] a b))'],
        ['a?.()', '(chain (call? a))'],
        ['a?.b.c', '(chain (. (?. a b) c))'],
        ['a?.b()', '(chain (call (?. a b)))'],
        ['a?.b?.c', '(chain (?. (?. a b) c))'],
        ['a?.b.c(d)?.[e]', '(chain (?.[] (call (. (?. a b) c) d) e))'],
        ['(a?.b).c', '(. (chain (?. a b)) c)'],
        ['(a?.b)()', '(call (chain (?. a b)))'],
        ['a ?.5 : 1', '(? a .5 1)'],
        ['a?.5:1', '(? a .5 1)'],
        ['a?.b ?? c', '(?? (chain (?. a b)) c)'],
        ['delete a?.b', '(delete (chain (?. a b)))'],
        ['a?.b.#c', '(chain (. (?. a b) #c))'],
    ])('%s', (code, expected) => {
        expect(sxOf(code)).toBe(expected)
    })

    it('marks optional members and calls like ESTree', () => {
        expect(expr('a?.b')).toMatchObject({
            type: 'ChainExpression',
            expression: { type: 'MemberExpression', optional: true, computed: false },
        })
        expect(expr('a?.()')).toMatchObject({
            type: 'ChainExpression',
            expression: { type: 'CallExpression', optional: true },
        })
        expect(expr('a?.b.c')).toMatchObject({
            expression: { optional: false, object: { optional: true } },
        })
    })

    it('rejects invalid optional chains', () => {
        expect(failure('new a?.b').offset).toBe(5)
        expect(failure('new a?.()').offset).toBe(5)
        expect(failure('a?.`x`').offset).toBe(3)
        expect(failure('a?.b`x`').offset).toBe(4)
        expect(failure('a?.').offset).toBe(3)
    })

    it('parses private member access', () => {
        expect(expr('a.#b')).toMatchObject({
            type: 'MemberExpression',
            property: { type: 'PrivateIdentifier', name: 'b' },
        })
    })

    it('parses import(), import.meta and new.target', () => {
        expect(expr("import('x')")).toMatchObject({
            type: 'ImportExpression',
            source: { value: 'x' },
            options: null,
        })
        expect(expr('import(a, b,)')).toMatchObject({ options: { name: 'b' } })
        expect(expr('import(a, b)')).toMatchObject({ options: { name: 'b' } })
        expect(sxOf("import('a').then(b => b)")).toBe('(call (. ImportExpression then) (=> (b) b))')
        expect(expr('import.meta')).toMatchObject({
            type: 'MetaProperty',
            meta: { name: 'import' },
            property: { name: 'meta' },
        })
        expect(sxOf('import.meta.url')).toBe('(. MetaProperty url)')
    })

    it('rejects malformed import and new', () => {
        expect(failure('import()').offset).toBe(7)
        expect(failure('import(...a)').offset).toBe(7)
        expect(failure('import.foo').offset).toBe(7)
        expect(failure('new import(a)').offset).toBe(4)
        expect(() => parse('new (import(a))')).not.toThrow()
    })
})

describe('yield and await', () => {
    it.each<[string, string]>([
        ['(function*(){ yield })', 'FunctionExpression'],
        ['(function*(){ yield a })', 'FunctionExpression'],
    ])('%s', (code, expected) => {
        expect(sxOf(code)).toBe(expected)
    })

    function bodyExpr(code: string): Expression {
        const fn = expr(code) as unknown as { body: { body: ExpressionStatement[] } }
        const statement = fn.body.body[0]
        if (statement === undefined) {
            throw new Error('empty body')
        }
        return statement.expression
    }

    it('parses yield forms', () => {
        expect(sx(bodyExpr('(function*(){ yield })'))).toBe('(yield _)')
        expect(sx(bodyExpr('(function*(){ yield a })'))).toBe('(yield a)')
        expect(sx(bodyExpr('(function*(){ yield* a })'))).toBe('(yield* a)')
        expect(sx(bodyExpr('(function*(){ yield a, b })'))).toBe('(, (yield a) b)')
        expect(sx(bodyExpr('(function*(){ a = yield b })'))).toBe('(= a (yield b))')
        expect(sx(bodyExpr('(function*(){ yield /re/ })'))).toBe('(yield /re/)')
        expect(sx(bodyExpr('(function*(){ yield a ? b : c })'))).toBe('(yield (? a b c))')
        expect(sx(bodyExpr('(function*(){ yield yield a })'))).toBe('(yield (yield a))')
        expect(parse('(function*(){ yield\na })').body).toHaveLength(1)
        expect(sx(bodyExpr('(function*(){ yield\na })'))).toBe('(yield _)')
        expect(expr('(function*(){ yield a })')).toMatchObject({
            body: { body: [{ expression: { type: 'YieldExpression', delegate: false } }] },
        })
    })

    it('treats yield as an identifier outside generators', () => {
        expect(sxOf('yield')).toBe('yield')
        expect(sxOf('yield + 1')).toBe('(+ yield 1)')
        expect(failure('(function*(){ var yield })').offset).toBe(18)
        expect(failure('(function*(){ yield = 1 })').offset).toBe(20)
    })

    it('parses await forms', () => {
        expect(sx(bodyExpr('(async function(){ await a })'))).toBe('(await a)')
        expect(sx(bodyExpr('(async function(){ await a + await b })'))).toBe(
            '(+ (await a) (await b))',
        )
        expect(sx(bodyExpr('(async function(){ (await a) ** 2 })'))).toBe('(** (await a) 2)')
        expect(sx(bodyExpr('(async function(){ await await a })'))).toBe('(await (await a))')
        expect(sxOf('async () => await a')).toBe('(async => () (await a))')
        expect(sxOf('async x => await /re/')).toBe('(async => (x) (await /re/))')
    })

    it('rejects an unparenthesized await operand of **', () => {
        expect(failure('(async function(){ await a ** 2 })').offset).toBe(19)
    })

    it('treats await as an identifier outside async functions', () => {
        expect(sxOf('await')).toBe('await')
        expect(sxOf('(function(){ await + 1 })')).toBe('FunctionExpression')
        expect(sxOf('(function(){ await })')).toBe('FunctionExpression')
        expect(failure('(async function(){ await })').offset).toBe(25)
        expect(failure('(async function(){ var await })').offset).toBe(23)
    })

    it('does not leak async/generator context into nested functions', () => {
        expect(sxOf('(async function(){ (function(){ await }) })')).toBe('FunctionExpression')
        expect(sxOf('(function*(){ (function(){ yield }) })')).toBe('FunctionExpression')
    })
})

describe('parentheses and positions', () => {
    it('drops parentheses but keeps inner offsets for single expressions', () => {
        expect(expr('(a)')).toMatchObject({ type: 'Identifier', start: 1, end: 2 })
        expect(expr('((a))')).toMatchObject({ type: 'Identifier', start: 2, end: 3 })
        expect(expr('(a, b)')).toMatchObject({ type: 'SequenceExpression', start: 1, end: 5 })
        expect(expr('((a, b), c)')).toMatchObject({ type: 'SequenceExpression', start: 1, end: 10 })
    })

    it('uses the whole source range, including parentheses, for enclosing nodes', () => {
        expect(expr('(a) + b')).toMatchObject({ type: 'BinaryExpression', start: 0, end: 7 })
        expect(expr('(a).b')).toMatchObject({ type: 'MemberExpression', start: 0, end: 5 })
        expect(expr('(a)(b)')).toMatchObject({ type: 'CallExpression', start: 0, end: 6 })
        expect(expr('a ? b : c')).toMatchObject({ type: 'ConditionalExpression', start: 0, end: 9 })
        expect(expr('(a) = 1')).toMatchObject({ type: 'AssignmentExpression', start: 0, end: 7 })
        expect(expr('x => (y)')).toMatchObject({
            type: 'ArrowFunctionExpression',
            start: 0,
            end: 8,
        })
        expect(expr('(a, b) => c')).toMatchObject({ start: 0, end: 11 })
        expect(expr('async (a) => b')).toMatchObject({ start: 0, end: 14 })
        expect(expr('async x => b')).toMatchObject({ start: 0, end: 12 })
        expect(expr('a?.b.c')).toMatchObject({ type: 'ChainExpression', start: 0, end: 6 })
        expect(expr('new a(b)')).toMatchObject({ type: 'NewExpression', start: 0, end: 8 })
        expect(expr('a`b`')).toMatchObject({
            type: 'TaggedTemplateExpression',
            start: 0,
            end: 4,
            quasi: { start: 1, end: 4 },
        })
    })

    it('records Program and statement ranges', () => {
        const program = parse('  a ;  b  ')
        expect(program).toMatchObject({ type: 'Program', sourceType: 'script', start: 0, end: 10 })
        expect(program.body[0]).toMatchObject({ start: 2, end: 5 })
        expect(program.body[1]).toMatchObject({ start: 7, end: 8 })
    })

    it('records function and method ranges', () => {
        expect(expr('(function f(a){})')).toMatchObject({ start: 1, end: 16 })
        expect(expr('(async function(){})')).toMatchObject({ start: 1, end: 19 })
        const obj = expr('({m(){}})') as unknown as {
            properties: { start: number; end: number; value: { start: number; end: number } }[]
        }
        expect(obj.properties[0]).toMatchObject({ start: 2, end: 7, value: { start: 3, end: 7 } })
    })
})

describe('comments and whitespace', () => {
    it('ignores comments between every token', () => {
        expect(sxOf('a /* c1 */ ? /* c2 */ b /* c3 */ : // c4\n c')).toBe('(? a b c)')
        expect(sxOf('f /* a */ ( /* b */ x /* c */ , /* d */ y /* e */ )')).toBe('(call f x y)')
        expect(sxOf('[ /* a */ 1 /* b */ , /* c */ 2 ]')).toBe('[1 2]')
        expect(sxOf('({ /* a */ k /* b */ : /* c */ v /* d */ , /* e */ })')).toBe('{k:v}')
        expect(sxOf('( /* a */ x /* b */ ) /* c */ => /* d */ x')).toBe('(=> (x) x)')
        expect(sxOf('`a${ /* c */ b /* d */ }c`')).toBe('TemplateLiteral')
        expect(sxOf('/* start */ a /* mid */ + /* more */ b // end')).toBe('(+ a b)')
    })

    it('counts a newline inside a block comment as a line terminator for ASI', () => {
        expect(parse('a /* x\ny */ b').body).toHaveLength(2)
        expect(failure('a /* x y */ b').offset).toBe(12)
        expect(parse('a // c\nb').body).toHaveLength(2)
    })

    it('skips a hashbang line and unicode whitespace', () => {
        expect(parse('#!/usr/bin/env node\na').body).toHaveLength(1)
        expect(sxOf('a + b﻿')).toBe('(+ a b)')
        expect(sxOf('a ')).toBe('a')
    })

    it('reports unterminated comments', () => {
        expect(failure('a /* x').offset).toBe(2)
    })
})

describe('identifiers', () => {
    it('reads unicode and escaped identifiers', () => {
        expect(expr('ünï')).toMatchObject({ name: 'ünï' })
        expect(expr('a\\u0062c')).toMatchObject({ name: 'abc' })
        expect(expr('\\u{61}bc')).toMatchObject({ name: 'abc' })
        expect(expr('𠮷')).toMatchObject({ name: '𠮷' })
        expect(expr('$_x1')).toMatchObject({ name: '$_x1' })
        expect(sxOf('({ünï: 1})')).toBe('{ünï:1}')
    })

    it('does not treat escaped keywords as keywords', () => {
        expect(failure('n\\u0065w a').offset).toBe(0)
        expect(failure('a = \\u0066unction(){}').offset).toBe(4)
        expect(sxOf('({ g\\u0065t: 1 })')).toBe('{get:1}')
        expect(failure('({ g\\u0065t a(){} })').offset).toBe(12)
    })

    it('rejects reserved words as identifiers', () => {
        for (const word of [
            'if',
            'class',
            'function',
            'new',
            'null',
            'true',
            'typeof',
            'enum',
            'this',
        ]) {
            if (
                word === 'null' ||
                word === 'true' ||
                word === 'this' ||
                word === 'typeof' ||
                word === 'new'
            ) {
                continue
            }
            expect(failure(`a = ${word}`).offset, word).toBe(
                word === 'class' || word === 'function' ? 4 + word.length : 4,
            )
        }
        expect(failure('({ if })').offset).toBe(6)
        expect(failure('(a, if) => 1').offset).toBe(4)
    })

    it('rejects stray characters with an offset', () => {
        expect(failure('a @ b').offset).toBe(2)
        expect(failure('a #').offset).toBe(2)
        expect(failure('a = \\u0020').offset).toBe(4)
    })
})

describe('statement basics', () => {
    it('parses empty statements and statement lists with ASI', () => {
        expect(parse(';;a;;').body.map((s) => s.type)).toEqual([
            'EmptyStatement',
            'EmptyStatement',
            'ExpressionStatement',
            'EmptyStatement',
        ])
        expect(parse('a\nb\nc').body).toHaveLength(3)
        expect(parse('a;b;c').body).toHaveLength(3)
        expect(parse('').body).toEqual([])
    })

    it('applies ASI rules for expression statements', () => {
        expect(parse('a\n(b)').body).toHaveLength(1)
        expect(parse('a\n[b]').body).toHaveLength(1)
        expect(parse('a\n`b`').body).toHaveLength(1)
        expect(parse('a\n+b').body).toHaveLength(1)
        expect(parse('a\n++b').body).toHaveLength(2)
        expect(parse('a\n--b').body).toHaveLength(2)
        expect(failure('a b').offset).toBe(2)
        expect(failure('a ? b').offset).toBe(5)
    })

    it('marks directive prologues only on leading string statements', () => {
        const body = parse("'use strict'; \"x\"; a; 'late'").body
        const directives = body.map((s) =>
            s.type === 'ExpressionStatement' ? s.directive : undefined,
        )
        expect(directives).toEqual(['use strict', 'x', undefined, undefined])
        expect(parse("('paren')").body[0]).not.toHaveProperty('directive')
        expect(parse("'a' + b").body[0]).not.toHaveProperty('directive')
    })

    it('still treats let/async/import as expressions when used as identifiers or calls', () => {
        expect(sxOf('let')).toBe('let')
        expect(sxOf('let = 1')).toBe('(= let 1)')
        expect(sxOf('let in a')).toBe('(in let a)')
        expect(sxOf("import('a')")).toBe('ImportExpression')
        expect(sxOf('import.meta')).toBe('MetaProperty')
    })
})

describe('ParseError', () => {
    it('carries a message, name and offset', () => {
        const error = failure('a = )')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('ParseError')
        expect(error.offset).toBe(4)
        expect(error.message).toContain('unexpected')
    })

    it.each<[string, number]>([
        ['a = ', 4],
        ['a +', 3],
        ['(a', 2],
        ['a)', 1],
        [']', 0],
        ['}', 0],
        ['a.', 2],
        ['a.1', 1],
        ['a[]', 2],
        ['a[b', 3],
        ['f(a b)', 4],
        ['f(,)', 2],
        ['[a b]', 3],
        ['({a: })', 5],
        ['x = {a = 1}', 7],
        ['a ? b', 5],
        ['function', 8],
        ['(class A B {})', 9],
    ])('points %j at offset %i', (code, offset) => {
        expect(failure(code).offset).toBe(offset)
    })
})

describe('Lexer', () => {
    it('lexes / as a punctuator unless a regex is allowed', () => {
        expect(new Lexer('/a/g').next(false)).toMatchObject({ type: 'punct', value: '/' })
        expect(new Lexer('/a/g').next(true)).toMatchObject({
            type: 'regex',
            value: 'a',
            flags: 'g',
            start: 0,
            end: 4,
        })
        expect(new Lexer('/=a/').next(false)).toMatchObject({ type: 'punct', value: '/=' })
        expect(new Lexer('/=a/').next(true)).toMatchObject({ type: 'regex', value: '=a' })
    })

    it('rescans a division token as a regex', () => {
        const lexer = new Lexer('\n/[/]/i x')
        const slash = lexer.next(false)
        expect(slash).toMatchObject({ type: 'punct', value: '/', nlBefore: true })
        const regex = lexer.rescanRegex(slash)
        expect(regex).toMatchObject({ type: 'regex', value: '[/]', flags: 'i', nlBefore: true })
        expect(lexer.next(false)).toMatchObject({ type: 'name', value: 'x' })
    })

    it('peeks without consuming', () => {
        const lexer = new Lexer('a b')
        expect(lexer.next(false).value).toBe('a')
        expect(lexer.peek(false).value).toBe('b')
        expect(lexer.next(false).value).toBe('b')
        expect(lexer.next(false).type).toBe('eof')
    })

    it('reads template chunks and parser-requested continuations', () => {
        const lexer = new Lexer('`a${b}c`')
        const head = lexer.next(false)
        expect(head).toMatchObject({
            type: 'template',
            value: 'a',
            cooked: 'a',
            tail: false,
            start: 0,
            end: 4,
        })
        expect(lexer.next(false)).toMatchObject({ type: 'name', value: 'b' })
        const close = lexer.next(false)
        expect(close).toMatchObject({ type: 'punct', value: '}' })
        expect(lexer.readTemplateContinuation(close.start)).toMatchObject({
            type: 'template',
            value: 'c',
            tail: true,
            start: 5,
            end: 8,
        })
    })

    it('tracks newlines before tokens', () => {
        const lexer = new Lexer('a\nb /*\n*/ c d')
        expect(lexer.next(false).nlBefore).toBe(false)
        expect(lexer.next(false).nlBefore).toBe(true)
        expect(lexer.next(false).nlBefore).toBe(true)
        expect(lexer.next(false).nlBefore).toBe(false)
    })

    it('lexes the longest punctuator', () => {
        const values: string[] = []
        const lexer = new Lexer('>>>= >>> >> => ... ?? ??= ?. ** **= &&= ||=')
        for (let token = lexer.next(false); token.type !== 'eof'; token = lexer.next(false)) {
            values.push(token.value)
        }
        expect(values).toEqual([
            '>>>=',
            '>>>',
            '>>',
            '=>',
            '...',
            '??',
            '??=',
            '?.',
            '**',
            '**=',
            '&&=',
            '||=',
        ])
        expect(new Lexer('?.5').next(false)).toMatchObject({ type: 'punct', value: '?' })
    })

    it('reads private names, escaped names and flags', () => {
        expect(new Lexer('#priv').next(false)).toMatchObject({ type: 'private', value: 'priv' })
        expect(new Lexer('\\u0061b').next(false)).toMatchObject({
            type: 'name',
            value: 'ab',
            escaped: true,
        })
        expect(new Lexer('ab').next(false)).toMatchObject({ escaped: false })
    })
})

describe('node coverage', () => {
    function collect(node: unknown, seen: Set<string>): void {
        if (Array.isArray(node)) {
            for (const item of node) {
                collect(item, seen)
            }
        } else if (typeof node === 'object' && node !== null) {
            const type = (node as { type?: unknown }).type
            if (typeof type === 'string') {
                seen.add(type)
            }
            for (const value of Object.values(node)) {
                collect(value, seen)
            }
        }
    }

    it('produces every expression-level node type', () => {
        const seen = new Set<string>()
        const samples = [
            ';',
            'a, b',
            '(function(){})',
            '(function*(){ yield a })',
            '(async function(){ await a })',
            'x => x',
            '(class extends A { #a = 1; static { } m(){ super.x } get g(){} })',
            '[a, ...b]',
            '({a, ...b, c(){}, get d(){}})',
            '`a${b}`',
            'a`b`',
            'a?.b()',
            'a ? b : c',
            'a = b',
            '[a, {b}, c = 1, ...d] = e',
            'a && b',
            'a + b',
            '!a',
            'a++',
            'new a(b)',
            "import('a')",
            'import.meta',
            '#x in a',
            '/a/g',
            '1n',
            'this',
        ]
        for (const code of samples) {
            collect(parse(code), seen)
        }
        for (const type of [
            'Program',
            'ExpressionStatement',
            'EmptyStatement',
            'BlockStatement',
            'Identifier',
            'PrivateIdentifier',
            'Literal',
            'ThisExpression',
            'Super',
            'ArrayExpression',
            'ObjectExpression',
            'Property',
            'SpreadElement',
            'FunctionExpression',
            'ArrowFunctionExpression',
            'ClassExpression',
            'ClassBody',
            'MethodDefinition',
            'PropertyDefinition',
            'StaticBlock',
            'TemplateLiteral',
            'TemplateElement',
            'TaggedTemplateExpression',
            'MemberExpression',
            'CallExpression',
            'NewExpression',
            'ChainExpression',
            'ImportExpression',
            'MetaProperty',
            'UnaryExpression',
            'UpdateExpression',
            'BinaryExpression',
            'LogicalExpression',
            'ConditionalExpression',
            'AssignmentExpression',
            'SequenceExpression',
            'YieldExpression',
            'AwaitExpression',
            'ObjectPattern',
            'ArrayPattern',
            'RestElement',
            'AssignmentPattern',
        ]) {
            expect(seen.has(type), type).toBe(true)
        }
    })
})
