import type {
    ArrayExpression,
    ArrayPattern,
    ArrowFunctionExpression,
    BinaryExpression,
    BinaryOperator,
    CallExpression,
    ClassBody,
    ClassDeclaration,
    ClassExpression,
    Expression,
    ExportAllDeclaration,
    ExportDefaultDeclaration,
    ExportNamedDeclaration,
    ForInStatement,
    ForOfStatement,
    ForStatement,
    FunctionDeclaration,
    FunctionExpression,
    Identifier,
    ImportAttribute,
    ImportDeclaration,
    ImportSpecifier,
    Literal,
    LogicalExpression,
    LogicalOperator,
    MemberExpression,
    NewExpression,
    ObjectExpression,
    ObjectPattern,
    Pattern,
    PrivateIdentifier,
    Program,
    Property,
    RestElement,
    SpreadElement,
    Statement,
    Super,
    SwitchStatement,
    TemplateLiteral,
    TryStatement,
    VariableDeclaration,
} from './ast.js'

/*
 * Prints an ESTree program as the shortest text that parses back to the same tree: no optional
 * whitespace, `;` only where the next statement or a following `else`/`while` needs it (never
 * before `}` or at the end), and parentheses only where precedence, associativity or a
 * statement-start ambiguity requires them. Statement structure is kept as is (no braces are added
 * or dropped, except braces around an `if` consequent that would otherwise capture the `else`).
 *
 * Safe literal shortening only: shortest equivalent number and string literals, `true`/`false` as
 * `!0`/`!1`, string keys and `a["b"]` member names that are plain ASCII identifier names written
 * as identifiers, and (when the caller says `undefined` is free) the global `undefined` as
 * `void 0`. Template text, regular expressions and directives are printed verbatim.
 */

/** Options for {@link print}. */
export interface PrintOptions {
    /**
     * The program's free names (`analyze(program).unresolved`). When it contains `undefined`,
     * references to the global `undefined` are printed as `void 0`, unless the program declares,
     * assigns or deletes something named `undefined`, or contains `with` or a direct `eval`.
     */
    unresolved?: Set<string>
}

// Precedence levels, loosest first. A child printed where a tighter level is required gets
// parentheses.
const precSequence = 0
const precAssign = 1 // assignment, arrow function, yield, spread argument
const precConditional = 2
const precCoalesce = 3 // `??` and `||` (they can never be mixed without parentheses)
const precLogicalAnd = 4
const precBitwiseOr = 5
const precUnary = 14 // prefix unary operators and `await`
const precUpdate = 15
const precNew = 16 // `new X` without an argument list
const precCall = 17 // member access, call, `new X()`, tagged template, `import()`
const precPrimary = 18

const binaryPrecedence: Record<BinaryOperator | LogicalOperator, number> = {
    '??': precCoalesce,
    '||': precCoalesce,
    '&&': precLogicalAnd,
    '|': precBitwiseOr,
    '^': 6,
    '&': 7,
    '==': 8,
    '!=': 8,
    '===': 8,
    '!==': 8,
    '<': 9,
    '>': 9,
    '<=': 9,
    '>=': 9,
    in: 9,
    instanceof: 9,
    '<<': 10,
    '>>': 10,
    '>>>': 10,
    '+': 11,
    '-': 11,
    '*': 12,
    '/': 12,
    '%': 12,
    '**': 13,
}

// What may not appear as the first token at a marked position (bit flags).
const forbidBrace = 1 // `{` (statement start, arrow concise body)
const forbidFunction = 2 // `function`, `async function`, `class`
const forbidLet = 4 // the identifier `let` (`let [` would start a declaration)
const forbidAsync = 8 // the identifier `async` (`for (async of` is not allowed)
const forbidStatement = forbidBrace | forbidFunction | forbidLet

const asciiIdentifierName = /^[A-Za-z_$][\w$]*$/

/**
 * Prints a program as minimal JavaScript text.
 * @param program - The program to print (not modified).
 * @param options - See {@link PrintOptions}.
 * @returns JavaScript source that parses back to an equivalent program.
 */
export function print(program: Program, options: PrintOptions = {}): string {
    const printer = new Printer(false)
    const text = printer.printProgram(program)
    if (
        options.unresolved?.has('undefined') !== true ||
        printer.undefinedReferences === 0 ||
        printer.undefinedBlocked
    ) {
        return text
    }
    return new Printer(true).printProgram(program)
}

/** True for characters that would merge with an adjacent identifier, keyword or number. */
function isWordChar(code: number): boolean {
    return (
        (code >= 48 && code <= 57) ||
        (code >= 65 && code <= 90) ||
        (code >= 97 && code <= 122) ||
        code === 36 ||
        code === 95 ||
        code === 92 ||
        code >= 128
    )
}

/**
 * Formats a non-negative number literal value as the shortest literal that reads back as exactly
 * the same value.
 * @param value - The literal's value.
 * @returns The literal text.
 */
export function formatNumber(value: number): string {
    if (value === Infinity) {
        return '2e308'
    }
    const text = String(value)
    const candidates = [text.replace('e+', 'e')]
    const parts = /^(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(text)
    if (parts !== null) {
        const fraction = parts[2] ?? ''
        let digits = `${parts[1] ?? ''}${fraction}`.replace(/^0+/, '')
        let exponent = Number(parts[3] ?? '0') - fraction.length
        while (digits.endsWith('0')) {
            digits = digits.slice(0, -1)
            exponent++
        }
        if (digits === '') {
            return '0'
        }
        if (exponent !== 0) {
            candidates.push(`${digits}e${String(exponent)}`)
        }
        if (exponent >= 0) {
            candidates.push(digits + '0'.repeat(exponent))
        } else {
            const point = digits.length + exponent
            candidates.push(
                point > 0
                    ? `${digits.slice(0, point)}.${digits.slice(point)}`
                    : `.${'0'.repeat(-point)}${digits}`,
            )
        }
    }
    if (Number.isInteger(value)) {
        candidates.push(`0x${value.toString(16)}`)
    }
    let best = String(value)
    for (const candidate of candidates) {
        if (candidate.length < best.length && Number(candidate) === value) {
            best = candidate
        }
    }
    return best
}

/**
 * Quotes a string value with the quote character needing fewer escapes, escaping only what a
 * string literal cannot hold verbatim (plus line separators, lone surrogates and `</script`/`<!--`,
 * which are unsafe in some embeddings).
 * @param value - The string value.
 * @returns The string literal text.
 */
export function quoteString(value: string): string {
    let singles = 0
    let doubles = 0
    for (const char of value) {
        if (char === "'") {
            singles++
        } else if (char === '"') {
            doubles++
        }
    }
    const quote = doubles > singles ? "'" : '"'
    let out = quote
    for (let i = 0; i < value.length; i++) {
        const code = value.charCodeAt(i)
        const char = value.charAt(i)
        if (char === quote || char === '\\') {
            out += `\\${char}`
        } else if (code < 0x20 || code === 0x7f) {
            out += escapeControl(code, value.charCodeAt(i + 1))
        } else if (code === 0x2028 || code === 0x2029) {
            out += `\\u${code.toString(16)}`
        } else if (code >= 0xd800 && code <= 0xdfff) {
            const next = value.charCodeAt(i + 1)
            if (code <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
                out += value.slice(i, i + 2)
                i++
            } else {
                out += `\\u${code.toString(16)}`
            }
        } else if (char === '<' && /^<(?:\/script|!--)/i.test(value.slice(i, i + 8))) {
            out += '\\x3c'
        } else {
            out += char
        }
    }
    return out + quote
}

function escapeControl(code: number, next: number): string {
    switch (code) {
        case 0:
            // `\0` followed by a digit would read as a legacy octal escape.
            return next >= 48 && next <= 57 ? '\\x00' : '\\0'
        case 8:
            return '\\b'
        case 9:
            return '\\t'
        case 10:
            return '\\n'
        case 11:
            return '\\v'
        case 12:
            return '\\f'
        case 13:
            return '\\r'
        default:
            return `\\x${code.toString(16).padStart(2, '0')}`
    }
}

/** Formats a BigInt literal (its decimal digits) as decimal or hex, whichever is shorter. */
function formatBigInt(digits: string): string {
    const hex = `0x${BigInt(digits).toString(16)}`
    return `${hex.length < digits.length ? hex : digits}n`
}

/** True when an `if` consequent would capture a following `else` (it ends in an `if` without one). */
function endsWithOpenIf(statement: Statement): boolean {
    switch (statement.type) {
        case 'IfStatement':
            return statement.alternate === null || endsWithOpenIf(statement.alternate)
        case 'ForStatement':
        case 'ForInStatement':
        case 'ForOfStatement':
        case 'WhileStatement':
        case 'WithStatement':
        case 'LabeledStatement':
            return endsWithOpenIf(statement.body)
        default:
            return false
    }
}

/** The string value of a literal when it is a plain ASCII identifier name, else `null`. */
function identifierNameOf(node: Expression | PrivateIdentifier): string | null {
    if (
        node.type === 'Literal' &&
        typeof node.value === 'string' &&
        asciiIdentifierName.test(node.value)
    ) {
        return node.value
    }
    return null
}

class Printer {
    /** References to `undefined` printed in an rvalue position. */
    undefinedReferences = 0
    /** Set when rewriting `undefined` would be unsafe anywhere in the program. */
    undefinedBlocked = false

    private out = ''
    private last = 0
    private beforeLast = 0
    /** A statement that needs a `;` before anything but `}` or the end has just been printed. */
    private pending = false
    /** Output offset where the `startForbid` restrictions apply (a statement start, ...). */
    private startPos = -1
    private startForbid = 0
    /** Inside a `for` head initializer, where a bare `in` operator would end the initializer. */
    private noIn = false
    /** Output offset right after a regex literal (flags would absorb a following word). */
    private regexEnd = -1
    /** Output offset right after an integer printed with digits only (`1.x` reads `1.` first). */
    private bareIntEnd = -1
    private readonly rewriteUndefined: boolean

    constructor(rewriteUndefined: boolean) {
        this.rewriteUndefined = rewriteUndefined
    }

    printProgram(program: Program): string {
        this.statements(program.body, true)
        this.pending = false
        if (program.hashbang === undefined) {
            return this.out
        }
        return this.out === '' ? program.hashbang : `${program.hashbang}\n${this.out}`
    }

    // ---- Output ----

    private emit(text: string): void {
        if (this.pending) {
            throw new Error('print: a statement terminator was not flushed')
        }
        const first = text.charCodeAt(0)
        const length = this.out.length
        if (
            (isWordChar(this.last) && isWordChar(first)) ||
            (this.regexEnd === length && isWordChar(first)) ||
            (this.last === 43 && first === 43) ||
            (this.last === 45 && first === 45) ||
            (this.last === 47 && (first === 47 || first === 42)) ||
            (this.last === 33 && this.beforeLast === 60 && text.startsWith('--'))
        ) {
            this.out += ' '
            this.last = 32
        }
        this.emitRaw(text)
    }

    /** Appends text with no separator check (template text, the space before `.`). */
    private emitRaw(text: string): void {
        if (text === '') {
            return
        }
        this.out += text
        this.beforeLast = text.length > 1 ? text.charCodeAt(text.length - 2) : this.last
        this.last = text.charCodeAt(text.length - 1)
    }

    private flush(): void {
        if (this.pending) {
            this.pending = false
            this.emit(';')
        }
    }

    private markStart(forbid: number): void {
        this.startPos = this.out.length
        this.startForbid = forbid
    }

    private atStart(forbid: number): boolean {
        return this.out.length === this.startPos && (this.startForbid & forbid) !== 0
    }

    private paren(inner: () => void): void {
        this.emit('(')
        const noIn = this.noIn
        this.noIn = false
        inner()
        this.noIn = noIn
        this.emit(')')
    }

    /** Prints in a context where `in` is allowed again (brackets, braces, arguments). */
    private allowIn(inner: () => void): void {
        const noIn = this.noIn
        this.noIn = false
        inner()
        this.noIn = noIn
    }

    private list<T>(items: readonly T[], each: (item: T) => void): void {
        let first = true
        for (const item of items) {
            if (!first) {
                this.emit(',')
            }
            first = false
            each(item)
        }
    }

    /** Prints a non-reference name (binding, key, label, property); guards the `undefined` rewrite. */
    private name(name: string): void {
        if (name === 'undefined') {
            this.undefinedBlocked = true
        }
        this.emit(name)
    }

    // ---- Statements ----

    private statements(body: readonly Statement[], prologue: boolean): void {
        let inPrologue = prologue
        for (const statement of body) {
            this.flush()
            if (inPrologue && statement.type === 'ExpressionStatement') {
                const expression = statement.expression
                if (statement.directive !== undefined && expression.type === 'Literal') {
                    this.emit(expression.raw)
                    this.pending = true
                    continue
                }
                if (expression.type === 'Literal' && typeof expression.value === 'string') {
                    // Unparenthesized, this string statement would become a directive.
                    this.paren(() => {
                        this.literal(expression)
                    })
                    this.pending = true
                    continue
                }
            }
            inPrologue = false
            this.statement(statement)
        }
    }

    private block(body: readonly Statement[], prologue: boolean): void {
        this.emit('{')
        this.allowIn(() => {
            this.statements(body, prologue)
        })
        this.pending = false
        this.emit('}')
    }

    private statement(node: Statement): void {
        switch (node.type) {
            case 'ExpressionStatement':
                if (node.directive !== undefined && node.expression.type === 'Literal') {
                    this.emit(node.expression.raw)
                } else {
                    this.markStart(forbidStatement)
                    this.expr(node.expression, precSequence)
                }
                this.pending = true
                return
            case 'BlockStatement':
                this.block(node.body, false)
                return
            case 'EmptyStatement':
                this.emit(';')
                return
            case 'DebuggerStatement':
                this.emit('debugger')
                this.pending = true
                return
            case 'WithStatement':
                this.undefinedBlocked = true
                this.emit('with')
                this.parenExpression(node.object)
                this.statement(node.body)
                return
            case 'ReturnStatement':
            case 'ThrowStatement':
                this.emit(node.type === 'ReturnStatement' ? 'return' : 'throw')
                if (node.argument !== null) {
                    this.expr(node.argument, precSequence)
                }
                this.pending = true
                return
            case 'LabeledStatement':
                this.name(node.label.name)
                this.emit(':')
                this.statement(node.body)
                return
            case 'BreakStatement':
            case 'ContinueStatement':
                this.emit(node.type === 'BreakStatement' ? 'break' : 'continue')
                if (node.label !== null) {
                    this.name(node.label.name)
                }
                this.pending = true
                return
            case 'IfStatement': {
                this.emit('if')
                this.parenExpression(node.test)
                const alternate = node.alternate
                if (alternate !== null && endsWithOpenIf(node.consequent)) {
                    this.block([node.consequent], false)
                } else {
                    this.statement(node.consequent)
                }
                if (alternate !== null) {
                    this.flush()
                    this.emit('else')
                    this.statement(alternate)
                }
                return
            }
            case 'SwitchStatement':
                this.switchStatement(node)
                return
            case 'TryStatement':
                this.tryStatement(node)
                return
            case 'WhileStatement':
                this.emit('while')
                this.parenExpression(node.test)
                this.statement(node.body)
                return
            case 'DoWhileStatement':
                this.emit('do')
                this.statement(node.body)
                this.flush()
                this.emit('while')
                this.parenExpression(node.test)
                this.pending = true
                return
            case 'ForStatement':
                this.forStatement(node)
                return
            case 'ForInStatement':
            case 'ForOfStatement':
                this.forInOfStatement(node)
                return
            case 'VariableDeclaration':
                this.variableDeclaration(node)
                this.pending = true
                return
            case 'FunctionDeclaration':
                this.functionNode(node)
                return
            case 'ClassDeclaration':
                this.classNode(node)
                return
            case 'ImportDeclaration':
                this.importDeclaration(node)
                return
            case 'ExportNamedDeclaration':
                this.exportNamedDeclaration(node)
                return
            case 'ExportDefaultDeclaration':
                this.exportDefaultDeclaration(node)
                return
            case 'ExportAllDeclaration':
                this.exportAllDeclaration(node)
                return
        }
    }

    private parenExpression(node: Expression): void {
        this.paren(() => {
            this.expr(node, precSequence)
        })
    }

    private switchStatement(node: SwitchStatement): void {
        this.emit('switch')
        this.parenExpression(node.discriminant)
        this.emit('{')
        this.allowIn(() => {
            for (const switchCase of node.cases) {
                this.flush()
                if (switchCase.test === null) {
                    this.emit('default')
                } else {
                    this.emit('case')
                    this.expr(switchCase.test, precSequence)
                }
                this.emit(':')
                this.statements(switchCase.consequent, false)
            }
        })
        this.pending = false
        this.emit('}')
    }

    private tryStatement(node: TryStatement): void {
        this.emit('try')
        this.block(node.block.body, false)
        if (node.handler !== null) {
            this.emit('catch')
            const param = node.handler.param
            if (param !== null) {
                this.paren(() => {
                    this.pattern(param, true)
                })
            }
            this.block(node.handler.body.body, false)
        }
        if (node.finalizer !== null) {
            this.emit('finally')
            this.block(node.finalizer.body, false)
        }
    }

    private forStatement(node: ForStatement): void {
        this.emit('for')
        this.emit('(')
        const noIn = this.noIn
        const init = node.init
        if (init !== null) {
            this.noIn = true
            if (init.type === 'VariableDeclaration') {
                this.variableDeclaration(init)
            } else {
                this.markStart(forbidLet)
                this.expr(init, precSequence)
            }
        }
        this.noIn = false
        this.emit(';')
        if (node.test !== null) {
            this.expr(node.test, precSequence)
        }
        this.emit(';')
        if (node.update !== null) {
            this.expr(node.update, precSequence)
        }
        this.emit(')')
        this.noIn = noIn
        this.statement(node.body)
    }

    private forInOfStatement(node: ForInStatement | ForOfStatement): void {
        const isOf = node.type === 'ForOfStatement'
        this.emit('for')
        if (isOf && node.await) {
            this.emit('await')
        }
        this.emit('(')
        const noIn = this.noIn
        const left = node.left
        if (left.type === 'VariableDeclaration') {
            // A legacy `for (var a = b in c)` initializer may not contain a bare `in`.
            this.noIn = true
            this.variableDeclaration(left)
        } else {
            this.markStart(isOf ? forbidLet | forbidAsync : forbidLet)
            this.pattern(left, false)
        }
        this.noIn = false
        this.emit(isOf ? 'of' : 'in')
        this.expr(node.right, isOf ? precAssign : precSequence)
        this.emit(')')
        this.noIn = noIn
        this.statement(node.body)
    }

    private variableDeclaration(node: VariableDeclaration): void {
        this.emit(node.kind)
        this.list(node.declarations, (declarator) => {
            this.pattern(declarator.id, true)
            if (declarator.init !== null) {
                this.emit('=')
                this.expr(declarator.init, precAssign)
            }
        })
    }

    // ---- Modules ----

    private moduleName(node: Identifier | Literal): void {
        if (node.type === 'Identifier') {
            this.name(node.name)
        } else {
            this.literal(node)
        }
    }

    private attributes(attributes: readonly ImportAttribute[]): void {
        if (attributes.length === 0) {
            return
        }
        this.emit('with')
        this.emit('{')
        this.list(attributes, (attribute) => {
            this.moduleName(attribute.key)
            this.emit(':')
            this.literal(attribute.value)
        })
        this.emit('}')
    }

    private importDeclaration(node: ImportDeclaration): void {
        this.emit('import')
        let printed = false
        const named: ImportSpecifier[] = []
        for (const specifier of node.specifiers) {
            if (specifier.type === 'ImportSpecifier') {
                named.push(specifier)
                continue
            }
            if (printed) {
                this.emit(',')
            }
            printed = true
            if (specifier.type === 'ImportNamespaceSpecifier') {
                this.emit('*')
                this.emit('as')
            }
            this.name(specifier.local.name)
        }
        if (named.length > 0) {
            if (printed) {
                this.emit(',')
            }
            printed = true
            this.emit('{')
            this.list(named, (specifier) => {
                const imported = specifier.imported
                if (imported.type !== 'Identifier' || imported.name !== specifier.local.name) {
                    this.moduleName(imported)
                    this.emit('as')
                }
                this.name(specifier.local.name)
            })
            this.emit('}')
        }
        if (printed) {
            this.emit('from')
        }
        this.literal(node.source)
        this.attributes(node.attributes)
        this.pending = true
    }

    private exportNamedDeclaration(node: ExportNamedDeclaration): void {
        this.emit('export')
        if (node.declaration !== null) {
            this.statement(node.declaration)
            return
        }
        this.emit('{')
        this.list(node.specifiers, (specifier) => {
            const { local, exported } = specifier
            this.moduleName(local)
            if (
                local.type !== 'Identifier' ||
                exported.type !== 'Identifier' ||
                local.name !== exported.name
            ) {
                this.emit('as')
                this.moduleName(exported)
            }
        })
        this.emit('}')
        if (node.source !== null) {
            this.emit('from')
            this.literal(node.source)
            this.attributes(node.attributes)
        }
        this.pending = true
    }

    private exportDefaultDeclaration(node: ExportDefaultDeclaration): void {
        this.emit('export')
        this.emit('default')
        const declaration = node.declaration
        if (declaration.type === 'FunctionDeclaration') {
            this.functionNode(declaration)
        } else if (declaration.type === 'ClassDeclaration') {
            this.classNode(declaration)
        } else {
            this.markStart(forbidFunction)
            this.expr(declaration, precAssign)
            this.pending = true
        }
    }

    private exportAllDeclaration(node: ExportAllDeclaration): void {
        this.emit('export')
        this.emit('*')
        if (node.exported !== null) {
            this.emit('as')
            this.moduleName(node.exported)
        }
        this.emit('from')
        this.literal(node.source)
        this.attributes(node.attributes)
        this.pending = true
    }

    // ---- Functions and classes ----

    private functionNode(node: FunctionDeclaration | FunctionExpression): void {
        if (node.async) {
            this.emit('async')
        }
        this.emit('function')
        if (node.generator) {
            this.emit('*')
        }
        if (node.id !== null) {
            this.name(node.id.name)
        }
        this.functionRest(node)
    }

    /** Prints a function's parameter list and body. */
    private functionRest(node: FunctionDeclaration | FunctionExpression): void {
        this.params(node.params)
        this.block(node.body.body, true)
    }

    private params(params: readonly Pattern[]): void {
        this.paren(() => {
            this.list(params, (param) => {
                this.pattern(param, true)
            })
        })
    }

    private arrow(node: ArrowFunctionExpression): void {
        if (node.async) {
            this.emit('async')
        }
        const only = node.params[0]
        if (node.params.length === 1 && only?.type === 'Identifier') {
            this.name(only.name)
        } else {
            this.params(node.params)
        }
        this.emit('=>')
        if (node.body.type === 'BlockStatement') {
            this.block(node.body.body, true)
        } else {
            this.markStart(forbidBrace)
            this.expr(node.body, precAssign)
        }
    }

    private classNode(node: ClassDeclaration | ClassExpression): void {
        this.emit('class')
        if (node.id !== null) {
            this.name(node.id.name)
        }
        if (node.superClass !== null) {
            this.emit('extends')
            this.expr(node.superClass, precCall)
        }
        this.classBody(node.body)
    }

    private classBody(body: ClassBody): void {
        this.emit('{')
        this.allowIn(() => {
            for (const member of body.body) {
                this.flush()
                if (member.type === 'StaticBlock') {
                    this.emit('static')
                    this.block(member.body, false)
                    continue
                }
                if (member.static) {
                    this.emit('static')
                }
                if (member.type === 'MethodDefinition') {
                    const value = member.value
                    if (member.kind === 'get' || member.kind === 'set') {
                        this.emit(member.kind)
                    } else {
                        this.methodPrefix(value)
                    }
                    this.propertyKey(member.key, member.computed)
                    this.functionRest(value)
                } else {
                    this.propertyKey(member.key, member.computed)
                    if (member.value !== null) {
                        this.emit('=')
                        this.expr(member.value, precAssign)
                    }
                    this.pending = true
                }
            }
        })
        this.pending = false
        this.emit('}')
    }

    private methodPrefix(value: FunctionExpression): void {
        if (value.async) {
            this.emit('async')
        }
        if (value.generator) {
            this.emit('*')
        }
    }

    private propertyKey(key: Expression | PrivateIdentifier, computed: boolean): void {
        if (computed) {
            this.emit('[')
            this.allowIn(() => {
                this.expr(key as Expression, precAssign)
            })
            this.emit(']')
            return
        }
        switch (key.type) {
            case 'PrivateIdentifier':
                this.emit(`#${key.name}`)
                return
            case 'Identifier':
                this.name(key.name)
                return
            case 'Literal': {
                const name = identifierNameOf(key)
                if (name === null) {
                    this.literal(key)
                } else {
                    this.name(name)
                }
                return
            }
            default:
                this.expr(key, precAssign)
        }
    }

    // ---- Patterns ----

    /**
     * Prints a binding (`binding`: declarations, parameters, catch) or assignment target pattern.
     */
    private pattern(node: Pattern, binding: boolean): void {
        switch (node.type) {
            case 'Identifier':
                if (binding) {
                    this.name(node.name)
                } else {
                    this.identifier(node, true)
                }
                return
            case 'MemberExpression':
                this.expr(node, precCall)
                return
            case 'ObjectPattern':
                this.objectPattern(node, binding)
                return
            case 'ArrayPattern':
                this.arrayPattern(node, binding)
                return
            case 'RestElement':
                this.restElement(node, binding)
                return
            case 'AssignmentPattern':
                this.pattern(node.left, binding)
                this.emit('=')
                this.allowIn(() => {
                    this.expr(node.right, precAssign)
                })
        }
    }

    private restElement(node: RestElement, binding: boolean): void {
        this.emit('...')
        this.pattern(node.argument, binding)
    }

    private objectPattern(node: ObjectPattern, binding: boolean): void {
        this.emit('{')
        this.allowIn(() => {
            this.list(node.properties, (property) => {
                if (property.type === 'RestElement') {
                    this.restElement(property, binding)
                    return
                }
                const value = property.value as Pattern
                if (property.shorthand && property.key.type === 'Identifier') {
                    const target = value.type === 'AssignmentPattern' ? value.left : value
                    if (target.type === 'Identifier' && target.name === property.key.name) {
                        // The shorthand name is also the key, so it is never parenthesized.
                        this.name(target.name)
                        if (value.type === 'AssignmentPattern') {
                            this.emit('=')
                            this.allowIn(() => {
                                this.expr(value.right, precAssign)
                            })
                        }
                        return
                    }
                }
                this.propertyKey(property.key, property.computed)
                this.emit(':')
                this.pattern(value, binding)
            })
        })
        this.emit('}')
    }

    private arrayPattern(node: ArrayPattern, binding: boolean): void {
        this.emit('[')
        this.allowIn(() => {
            this.list(node.elements, (element) => {
                if (element !== null) {
                    this.pattern(element, binding)
                }
            })
            if (node.elements.at(-1) === null) {
                this.emit(',')
            }
        })
        this.emit(']')
    }

    // ---- Expressions ----

    private levelOf(node: Expression): number {
        switch (node.type) {
            case 'SequenceExpression':
                return precSequence
            case 'AssignmentExpression':
            case 'ArrowFunctionExpression':
            case 'YieldExpression':
                return precAssign
            case 'ConditionalExpression':
                return precConditional
            case 'LogicalExpression':
            case 'BinaryExpression':
                return binaryPrecedence[node.operator]
            case 'UnaryExpression':
            case 'AwaitExpression':
                return precUnary
            case 'UpdateExpression':
                return precUpdate
            case 'NewExpression':
                return node.arguments.length === 0 ? precNew : precCall
            case 'CallExpression':
            case 'MemberExpression':
            case 'TaggedTemplateExpression':
            case 'ChainExpression':
            case 'ImportExpression':
                return precCall
            case 'Literal':
                return typeof node.value === 'boolean' ? precUnary : precPrimary
            case 'Identifier':
                return this.rewriteUndefined && node.name === 'undefined' ? precUnary : precPrimary
            default:
                return precPrimary
        }
    }

    /**
     * Prints an expression where at least precedence `min` is required, adding parentheses when
     * the node binds looser. `noCall` marks the callee spine of a `new` expression, where an
     * unparenthesized call (or optional chain) would be taken as the `new` argument list.
     */
    private expr(node: Expression, min: number, noCall = false): void {
        const forceArgs = node.type === 'NewExpression' && min > precNew
        const level = forceArgs ? precCall : this.levelOf(node)
        if (
            level < min ||
            (noCall &&
                (node.type === 'CallExpression' ||
                    node.type === 'ChainExpression' ||
                    node.type === 'ImportExpression')) ||
            (this.noIn && node.type === 'BinaryExpression' && node.operator === 'in')
        ) {
            this.paren(() => {
                this.exprNode(node, false, false)
            })
            return
        }
        this.exprNode(node, noCall, forceArgs)
    }

    /** Prints the object of a member access, the callee of a call or the tag of a template. */
    private calleeLike(node: Expression | Super, noCall: boolean): void {
        if (node.type === 'Super') {
            this.emit('super')
        } else if (node.type === 'ChainExpression') {
            // `(a?.b).c` ends the optional chain; `a?.b.c` would continue it.
            this.paren(() => {
                this.exprNode(node, false, false)
            })
        } else {
            this.expr(node, precCall, noCall)
        }
    }

    private exprNode(node: Expression, noCall: boolean, forceArgs: boolean): void {
        switch (node.type) {
            case 'Identifier':
                this.identifier(node, false)
                return
            case 'Literal':
                this.literal(node)
                return
            case 'ThisExpression':
                this.emit('this')
                return
            case 'ArrayExpression':
                this.arrayExpression(node)
                return
            case 'ObjectExpression':
                this.objectExpression(node)
                return
            case 'FunctionExpression':
                if (this.atStart(forbidFunction)) {
                    this.paren(() => {
                        this.functionNode(node)
                    })
                } else {
                    this.functionNode(node)
                }
                return
            case 'ArrowFunctionExpression':
                this.arrow(node)
                return
            case 'ClassExpression':
                if (this.atStart(forbidFunction)) {
                    this.paren(() => {
                        this.classNode(node)
                    })
                } else {
                    this.classNode(node)
                }
                return
            case 'TemplateLiteral':
                this.template(node)
                return
            case 'TaggedTemplateExpression':
                this.calleeLike(node.tag, noCall)
                this.template(node.quasi)
                return
            case 'MemberExpression':
                this.member(node, noCall)
                return
            case 'CallExpression':
                this.call(node)
                return
            case 'NewExpression':
                this.newExpression(node, forceArgs)
                return
            case 'ChainExpression':
                this.exprNode(node.expression, noCall, false)
                return
            case 'ImportExpression':
                this.emit('import')
                this.paren(() => {
                    this.expr(node.source, precAssign)
                    if (node.options !== null) {
                        this.emit(',')
                        this.expr(node.options, precAssign)
                    }
                })
                return
            case 'MetaProperty':
                this.emit(`${node.meta.name}.${node.property.name}`)
                return
            case 'UnaryExpression': {
                this.emit(node.operator)
                const argument = node.argument
                if (node.operator === 'delete' && argument.type === 'Identifier') {
                    this.identifier(argument, true)
                } else {
                    this.expr(argument, precUnary)
                }
                return
            }
            case 'UpdateExpression':
                if (node.prefix) {
                    this.emit(node.operator)
                }
                if (node.argument.type === 'Identifier') {
                    this.identifier(node.argument, true)
                } else {
                    this.expr(node.argument, precCall)
                }
                if (!node.prefix) {
                    this.emit(node.operator)
                }
                return
            case 'BinaryExpression':
                this.binary(node)
                return
            case 'LogicalExpression':
                this.binary(node)
                return
            case 'ConditionalExpression':
                this.expr(node.test, precCoalesce)
                this.emit('?')
                this.allowIn(() => {
                    this.expr(node.consequent, precAssign)
                })
                this.emit(':')
                this.expr(node.alternate, precAssign)
                return
            case 'AssignmentExpression':
                if (node.left.type === 'ObjectPattern' && this.atStart(forbidBrace)) {
                    // `({a} = b)`: a parenthesized pattern would not be a valid target.
                    this.paren(() => {
                        this.exprNode(node, false, false)
                    })
                    return
                }
                this.pattern(node.left, false)
                this.emit(node.operator)
                this.expr(node.right, precAssign)
                return
            case 'SequenceExpression':
                this.list(node.expressions, (expression) => {
                    this.expr(expression, precAssign)
                })
                return
            case 'YieldExpression':
                this.emit('yield')
                if (node.delegate) {
                    this.emit('*')
                }
                if (node.argument !== null) {
                    this.expr(node.argument, precAssign)
                }
                return
            case 'AwaitExpression':
                this.emit('await')
                this.expr(node.argument, precUnary)
                return
        }
    }

    /** Prints an identifier in an expression or assignment-target (`target`) position. */
    private identifier(node: Identifier, target: boolean): void {
        const name = node.name
        if (name === 'undefined') {
            if (target) {
                this.undefinedBlocked = true
            } else {
                this.undefinedReferences++
                if (this.rewriteUndefined) {
                    this.emit('void 0')
                    return
                }
            }
        }
        // A script's `await` identifier stays parenthesized: bare, `await(b)` or `await = 1` would
        // make `parse()` read the output as a module using top-level `await`.
        if (
            name === 'await' ||
            (name === 'let' && this.atStart(forbidLet)) ||
            (name === 'async' && this.atStart(forbidAsync))
        ) {
            this.paren(() => {
                this.emit(name)
            })
            return
        }
        this.emit(name)
    }

    private literal(node: Literal): void {
        const value = node.value
        if ('regex' in node) {
            this.emit(node.raw)
            this.regexEnd = this.out.length
        } else if ('bigint' in node) {
            this.emit(formatBigInt(node.bigint))
        } else if (typeof value === 'string') {
            this.emit(quoteString(value))
        } else if (typeof value === 'number') {
            const text = formatNumber(value)
            this.emit(text)
            if (/^\d+$/.test(text)) {
                this.bareIntEnd = this.out.length
            }
        } else if (typeof value === 'boolean') {
            this.emit(value ? '!0' : '!1')
        } else {
            this.emit('null')
        }
    }

    private template(node: TemplateLiteral): void {
        this.emit('`')
        this.allowIn(() => {
            for (const [i, quasi] of node.quasis.entries()) {
                this.emitRaw(quasi.value.raw)
                const expression = node.expressions[i]
                if (expression !== undefined) {
                    this.emitRaw('${')
                    this.expr(expression, precSequence)
                    this.emitRaw('}')
                }
            }
        })
        this.emitRaw('`')
    }

    private arrayExpression(node: ArrayExpression): void {
        this.emit('[')
        this.allowIn(() => {
            this.list(node.elements, (element) => {
                if (element !== null) {
                    this.argument(element)
                }
            })
            if (node.elements.at(-1) === null) {
                this.emit(',')
            }
        })
        this.emit(']')
    }

    private argument(node: Expression | SpreadElement): void {
        if (node.type === 'SpreadElement') {
            this.emit('...')
            this.expr(node.argument, precAssign)
        } else {
            this.expr(node, precAssign)
        }
    }

    private objectExpression(node: ObjectExpression): void {
        if (this.atStart(forbidBrace)) {
            this.paren(() => {
                this.objectExpression(node)
            })
            return
        }
        this.emit('{')
        this.allowIn(() => {
            this.list(node.properties, (property) => {
                if (property.type === 'SpreadElement') {
                    this.argument(property)
                } else {
                    this.property(property)
                }
            })
        })
        this.emit('}')
    }

    private property(node: Property): void {
        const value = node.value as Expression
        if (node.kind !== 'init' || node.method) {
            const fn = value as FunctionExpression
            if (node.kind === 'init') {
                this.methodPrefix(fn)
            } else {
                this.emit(node.kind)
            }
            this.propertyKey(node.key, node.computed)
            this.functionRest(fn)
            return
        }
        if (
            node.shorthand &&
            node.key.type === 'Identifier' &&
            value.type === 'Identifier' &&
            value.name === node.key.name
        ) {
            this.name(value.name)
            return
        }
        this.propertyKey(node.key, node.computed)
        this.emit(':')
        this.expr(value, precAssign)
    }

    private member(node: MemberExpression, noCall: boolean): void {
        this.calleeLike(node.object, noCall)
        const property = node.property
        const name = node.computed ? identifierNameOf(property) : null
        if (node.computed && name === null) {
            if (node.optional) {
                this.emit('?.')
            }
            this.emit('[')
            this.allowIn(() => {
                this.expr(property as Expression, precSequence)
            })
            this.emit(']')
            return
        }
        if (node.optional) {
            this.emit('?.')
        } else if (this.bareIntEnd === this.out.length) {
            this.emitRaw(' .')
        } else {
            this.emit('.')
        }
        if (property.type === 'PrivateIdentifier') {
            this.emit(`#${property.name}`)
        } else {
            this.name(name ?? (property as Identifier).name)
        }
    }

    private call(node: CallExpression): void {
        const callee = node.callee
        if (callee.type === 'Identifier' && callee.name === 'eval') {
            this.undefinedBlocked = true
        }
        this.calleeLike(callee, false)
        if (node.optional) {
            this.emit('?.')
        }
        this.args(node.arguments)
    }

    private args(args: readonly (Expression | SpreadElement)[]): void {
        this.paren(() => {
            this.list(args, (arg) => {
                this.argument(arg)
            })
        })
    }

    private newExpression(node: NewExpression, forceArgs: boolean): void {
        this.emit('new')
        this.expr(node.callee, precCall, true)
        if (node.arguments.length > 0 || forceArgs) {
            this.args(node.arguments)
        }
    }

    private binary(node: BinaryExpression | LogicalExpression): void {
        const operator = node.operator
        const level = binaryPrecedence[operator]
        const isCoalesce = operator === '??'
        // `??` cannot be mixed with `||`/`&&` without parentheses, in either direction.
        const mixed = (child: Expression | PrivateIdentifier): boolean =>
            node.type === 'LogicalExpression' &&
            child.type === 'LogicalExpression' &&
            (child.operator === '??') !== isCoalesce
        const left = node.left
        if (left.type === 'PrivateIdentifier') {
            this.emit(`#${left.name}`)
        } else if (mixed(left)) {
            this.paren(() => {
                this.exprNode(left, false, false)
            })
        } else {
            // `**` is right-associative and its left side may not be a unary expression.
            this.expr(left, operator === '**' ? precUpdate : level)
        }
        this.emit(operator)
        if (mixed(node.right)) {
            this.paren(() => {
                this.exprNode(node.right, false, false)
            })
        } else {
            this.expr(node.right, operator === '**' ? level : level + 1)
        }
    }
}
