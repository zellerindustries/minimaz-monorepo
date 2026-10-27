import type {
    ArrowFunctionExpression,
    AssignmentOperator,
    BinaryOperator,
    BlockStatement,
    CatchClause,
    ClassBody,
    ClassDeclaration,
    ClassExpression,
    Expression,
    ExportSpecifier,
    FunctionDeclaration,
    FunctionExpression,
    Identifier,
    ImportAttribute,
    ImportDeclaration,
    Literal,
    LogicalOperator,
    MethodDefinition,
    Node,
    Pattern,
    PrivateIdentifier,
    Program,
    Property,
    PropertyDefinition,
    SpreadElement,
    StaticBlock,
    Statement,
    Super,
    SwitchCase,
    TemplateElement,
    TemplateLiteral,
    UnaryOperator,
    VariableDeclaration,
    VariableDeclarator,
} from './ast.js'
import { Lexer, ParseError, type LexToken } from './lexer.js'
import { reservedWords, strictReservedWords } from './lexicon.js'

export { ParseError } from './lexer.js'

/**
 * Tracks a `{a = 1}` shorthand-with-initializer, legal only if the literal is later reinterpreted
 * as a pattern.
 */
interface Cover {
    shorthandAssign: number
}

/** Per-function parse context. */
interface FnContext {
    inGenerator: boolean
    inAsync: boolean
    allowNewTarget: boolean
    allowSuperProperty: boolean
    allowSuperCall: boolean
    /** Inside a function/arrow/method body (where `return` is legal). */
    inFunction: boolean
    labels: Label[]
    loops: number
    switches: number
}

/**
 * An enclosing label; `kind` is `'loop'` when it labels an iteration statement (valid `continue`
 * target).
 */
interface Label {
    name: string
    kind: 'loop' | null
    statementStart: number
}

/** Where a statement sits, which decides whether declarations and module items are legal. */
type StatementPlace = 'top' | 'list' | 'single' | 'loose'

type PropertyKey = Expression | PrivateIdentifier

const binaryPrecedence: ReadonlyMap<string, number> = new Map([
    ['??', 1],
    ['||', 1],
    ['&&', 2],
    ['|', 3],
    ['^', 4],
    ['&', 5],
    ['==', 6],
    ['!=', 6],
    ['===', 6],
    ['!==', 6],
    ['<', 7],
    ['>', 7],
    ['<=', 7],
    ['>=', 7],
    ['instanceof', 7],
    ['in', 7],
    ['<<', 8],
    ['>>', 8],
    ['>>>', 8],
    ['+', 9],
    ['-', 9],
    ['*', 10],
    ['/', 10],
    ['%', 10],
    ['**', 11],
])

const assignmentOperators: ReadonlySet<string> = new Set([
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
])

const unaryPunctuators: ReadonlySet<string> = new Set(['!', '~', '+', '-'])
const unaryKeywords: ReadonlySet<string> = new Set(['typeof', 'void', 'delete'])

function isLogicalOperator(op: string): op is LogicalOperator {
    return op === '&&' || op === '||' || op === '??'
}

function isBinaryOperator(op: string): op is BinaryOperator {
    return binaryPrecedence.has(op) && !isLogicalOperator(op)
}

function isAssignmentOperator(op: string): op is AssignmentOperator {
    return assignmentOperators.has(op)
}

function isUnaryOperator(op: string): op is UnaryOperator {
    return unaryPunctuators.has(op) || unaryKeywords.has(op)
}

/**
 * Parser state and grammar. `module` parses as an ES module (strict, top-level `await`,
 * import/export).
 */
class Parser {
    private readonly code: string
    private readonly lexer: Lexer
    private tok: LexToken
    private prevEnd = 0
    private ctx: FnContext
    private readonly module: boolean
    private strict: boolean
    /** Set when import/export/import.meta is seen (the caller then re-parses as a module). */
    sawModule = false
    /** Set when `await` is used as an identifier at the top level (it may be a top-level await). */
    sawTopLevelAwait = false
    /**
     * Start offset at which an arrow function may begin (set by every assignment-expression parse).
     */
    private arrowStart = -1
    /**
     * Start offset of the latest assignment-expression parse that excluded `in` (a for-loop head):
     * an arrow function starting there must exclude it from a concise body too.
     */
    private noInStart = -1
    private readonly parenthesized = new Set<Node>()
    /** Spread elements followed by a comma, which can never be rest elements. */
    private readonly spreadWithComma = new Set<Node>()

    constructor(code: string, module: boolean) {
        this.code = code
        this.module = module
        this.strict = module
        this.ctx = {
            inGenerator: false,
            inAsync: module,
            allowNewTarget: false,
            allowSuperProperty: false,
            allowSuperCall: false,
            inFunction: false,
            labels: [],
            loops: 0,
            switches: 0,
        }
        this.lexer = new Lexer(code, !module)
        this.tok = this.lexer.next(false)
    }

    // ---- Token helpers ----

    private advance(): void {
        this.prevEnd = this.tok.end
        this.tok = this.lexer.next(false)
    }

    private isPunct(value: string): boolean {
        const t = this.tok
        return t.type === 'punct' && t.value === value
    }

    private isName(value: string): boolean {
        const t = this.tok
        return t.type === 'name' && t.value === value && !t.escaped
    }

    private isEof(): boolean {
        return this.tok.type === 'eof'
    }

    private eatPunct(value: string): boolean {
        if (this.isPunct(value)) {
            this.advance()
            return true
        }
        return false
    }

    private eatName(value: string): boolean {
        if (this.isName(value)) {
            this.advance()
            return true
        }
        return false
    }

    private expectPunct(value: string): void {
        if (!this.eatPunct(value)) {
            this.unexpected(`expected "${value}"`)
        }
    }

    private expectName(value: string): void {
        if (!this.eatName(value)) {
            this.unexpected(`expected "${value}"`)
        }
    }

    private describeToken(t: LexToken): string {
        switch (t.type) {
            case 'eof':
                return 'end of input'
            case 'string':
                return 'string'
            case 'template':
                return 'template'
            case 'regex':
                return 'regular expression'
            case 'num':
            case 'bigint':
                return `number ${this.code.slice(t.start, t.end)}`
            case 'private':
                return `#${t.value}`
            case 'name':
            case 'punct':
                return `"${t.value}"`
        }
    }

    private unexpected(detail?: string): never {
        const t = this.tok
        const base = `unexpected ${this.describeToken(t)}`
        throw new ParseError(detail === undefined ? base : `${base} (${detail})`, t.start)
    }

    private peek(): LexToken {
        return this.lexer.peek(false)
    }

    private isReserved(name: string): boolean {
        return (
            reservedWords.has(name) ||
            (name === 'yield' && this.ctx.inGenerator) ||
            (name === 'await' && (this.ctx.inAsync || this.module)) ||
            (this.strict && strictReservedWords.has(name))
        )
    }

    // ---- Program and statements ----

    parseProgram(): Program {
        const body = this.parseStatementList(() => this.isEof(), true, 'top')
        return {
            type: 'Program',
            body,
            sourceType: this.module ? 'module' : 'script',
            start: 0,
            end: this.code.length,
        }
    }

    /**
     * Parses statements until `atEnd` reports the terminator; function and program bodies get a
     * directive prologue.
     */
    private parseStatementList(
        atEnd: () => boolean,
        directives: boolean,
        place: StatementPlace,
    ): Statement[] {
        const body: Statement[] = []
        let inPrologue = directives
        while (!atEnd()) {
            const statement = this.parseStatement(place)
            if (inPrologue) {
                if (
                    statement.type === 'ExpressionStatement' &&
                    statement.expression.type === 'Literal' &&
                    typeof statement.expression.value === 'string' &&
                    statement.expression.start === statement.start
                ) {
                    statement.directive = this.code.slice(
                        statement.expression.start + 1,
                        statement.expression.end - 1,
                    )
                    if (statement.directive === 'use strict') {
                        this.strict = true
                    }
                } else {
                    inPrologue = false
                }
            }
            body.push(statement)
        }
        return body
    }

    private parseStatement(place: StatementPlace): Statement {
        const t = this.tok
        if (t.type === 'punct') {
            if (t.value === ';') {
                this.advance()
                return { type: 'EmptyStatement', start: t.start, end: this.prevEnd }
            }
            if (t.value === '{') {
                return this.parseBlockBody(false)
            }
        } else if (t.type === 'name' && !t.escaped) {
            const statement = this.parseKeywordStatement(t.value, t.start, place)
            if (statement !== null) {
                return statement
            }
        }
        const expression = this.parseExpression(false)
        this.semicolon()
        return { type: 'ExpressionStatement', expression, start: t.start, end: this.prevEnd }
    }

    /**
     * Parses a statement introduced by a name token, or returns `null` when it starts an expression
     * statement.
     */
    private parseKeywordStatement(
        name: string,
        start: number,
        place: StatementPlace,
    ): Statement | null {
        const next = this.peek()
        if (next.type === 'punct' && next.value === ':' && !this.isReserved(name)) {
            return this.parseLabeled(place)
        }
        const single = place === 'single' || place === 'loose'
        switch (name) {
            case 'var':
                return this.parseVarStatement()
            case 'const':
                if (single) {
                    return this.unexpected('lexical declaration in single-statement context')
                }
                return this.parseVarStatement()
            case 'let':
                if (!this.letStartsDeclaration(next)) {
                    return null
                }
                if (single) {
                    if (next.type === 'punct' && next.value === '[') {
                        return this.unexpected('lexical declaration in single-statement context')
                    }
                    return null
                }
                return this.parseVarStatement()
            case 'function':
                this.checkFunctionPlace(place, start)
                return this.parseFunction(start, true, false)
            case 'async':
                if (next.type === 'name' && next.value === 'function' && !next.nlBefore) {
                    if (single) {
                        return this.unexpected('async function in single-statement context')
                    }
                    this.advance()
                    return this.parseFunction(start, true, true)
                }
                return null
            case 'class':
                if (single) {
                    return this.unexpected('class declaration in single-statement context')
                }
                return this.parseClass(start, true)
            case 'if':
                return this.parseIf()
            case 'for':
                return this.parseFor()
            case 'while':
                return this.parseWhile()
            case 'do':
                return this.parseDoWhile()
            case 'return':
                return this.parseReturn()
            case 'break':
            case 'continue':
                return this.parseBreakContinue(name === 'break')
            case 'switch':
                return this.parseSwitch()
            case 'throw':
                return this.parseThrow()
            case 'try':
                return this.parseTry()
            case 'with':
                return this.parseWith()
            case 'debugger':
                this.advance()
                this.semicolon()
                return { type: 'DebuggerStatement', start, end: this.prevEnd }
            case 'import':
                if (next.type === 'punct' && (next.value === '(' || next.value === '.')) {
                    return null
                }
                if (place !== 'top') {
                    return this.unexpected('import declarations may only appear at top level')
                }
                return this.parseImport()
            case 'export':
                if (place !== 'top') {
                    return this.unexpected('export declarations may only appear at top level')
                }
                return this.parseExport()
            default:
                return null
        }
    }

    /**
     * Plain function declarations are legal in lists, and (sloppy mode only) as `if`/label bodies.
     */
    private checkFunctionPlace(place: StatementPlace, offset: number): void {
        if (place === 'single' || (place === 'loose' && this.strict)) {
            throw new ParseError('function declaration in single-statement context', offset)
        }
        if (place === 'loose') {
            const next = this.peek()
            if (next.type === 'punct' && next.value === '*') {
                throw new ParseError('generator declaration in single-statement context', offset)
            }
        }
    }

    private letStartsDeclaration(next: LexToken): boolean {
        if (next.type === 'name') {
            return next.value !== 'in' && next.value !== 'instanceof'
        }
        return next.type === 'punct' && (next.value === '[' || next.value === '{')
    }

    /**
     * Consumes a statement terminator: `;`, or nothing when ASI applies (newline, `}` or end of
     * input).
     */
    private semicolon(): void {
        if (this.eatPunct(';')) {
            return
        }
        if (this.isEof() || this.isPunct('}') || this.tok.nlBefore) {
            return
        }
        this.unexpected('expected ";"')
    }

    /** Whether a restricted production ends here: `;`, `}`, end of input or a line break. */
    private endsRestricted(): boolean {
        return this.isPunct(';') || this.isPunct('}') || this.isEof() || this.tok.nlBefore
    }

    /**
     * Parses `{ statements }`.
     * @param directives - Whether a directive prologue is recognised (function bodies only).
     */
    private parseBlockBody(directives = false): BlockStatement {
        const start = this.tok.start
        this.expectPunct('{')
        const body = this.parseStatementList(
            () => this.isPunct('}') || this.isEof(),
            directives,
            'list',
        )
        this.expectPunct('}')
        return { type: 'BlockStatement', body, start, end: this.prevEnd }
    }

    private parseParenExpression(): Expression {
        this.expectPunct('(')
        const expression = this.parseExpression(false)
        this.expectPunct(')')
        return expression
    }

    private parseIf(): Statement {
        const start = this.tok.start
        this.advance()
        const test = this.parseParenExpression()
        const consequent = this.parseStatement('loose')
        const alternate = this.eatName('else') ? this.parseStatement('loose') : null
        return { type: 'IfStatement', test, consequent, alternate, start, end: this.prevEnd }
    }

    /** Parses a loop body with `break`/`continue` allowed. */
    private parseLoopBody(): Statement {
        this.ctx.loops++
        const body = this.parseStatement('single')
        this.ctx.loops--
        return body
    }

    private parseWhile(): Statement {
        const start = this.tok.start
        this.advance()
        const test = this.parseParenExpression()
        const body = this.parseLoopBody()
        return { type: 'WhileStatement', test, body, start, end: this.prevEnd }
    }

    private parseDoWhile(): Statement {
        const start = this.tok.start
        this.advance()
        const body = this.parseLoopBody()
        this.expectName('while')
        const test = this.parseParenExpression()
        // ASI always applies after `do ... while (...)`, even on the same line.
        this.eatPunct(';')
        return { type: 'DoWhileStatement', body, test, start, end: this.prevEnd }
    }

    private parseReturn(): Statement {
        const start = this.tok.start
        if (!this.ctx.inFunction) {
            this.unexpected('return outside of a function')
        }
        this.advance()
        const argument = this.endsRestricted() ? null : this.parseExpression(false)
        this.semicolon()
        return { type: 'ReturnStatement', argument, start, end: this.prevEnd }
    }

    private parseBreakContinue(isBreak: boolean): Statement {
        const start = this.tok.start
        this.advance()
        let label: Identifier | null = null
        const t = this.tok
        if (t.type === 'name' && !t.nlBefore && !this.isReserved(t.value)) {
            label = this.parseIdentifier()
            const found = this.ctx.labels.find((l) => l.name === t.value)
            if (found === undefined || (!isBreak && found.kind !== 'loop')) {
                throw new ParseError(`undefined label "${t.value}"`, t.start)
            }
        } else if (isBreak ? this.ctx.loops + this.ctx.switches === 0 : this.ctx.loops === 0) {
            throw new ParseError(`illegal ${isBreak ? 'break' : 'continue'} statement`, start)
        }
        this.semicolon()
        return isBreak
            ? { type: 'BreakStatement', label, start, end: this.prevEnd }
            : { type: 'ContinueStatement', label, start, end: this.prevEnd }
    }

    private parseThrow(): Statement {
        const start = this.tok.start
        this.advance()
        if (this.tok.nlBefore) {
            throw new ParseError('illegal newline after throw', this.tok.start)
        }
        const argument = this.parseExpression(false)
        this.semicolon()
        return { type: 'ThrowStatement', argument, start, end: this.prevEnd }
    }

    private parseWith(): Statement {
        const start = this.tok.start
        if (this.strict) {
            this.unexpected('"with" is not allowed in strict mode')
        }
        this.advance()
        const object = this.parseParenExpression()
        const body = this.parseStatement('single')
        return { type: 'WithStatement', object, body, start, end: this.prevEnd }
    }

    private parseSwitch(): Statement {
        const start = this.tok.start
        this.advance()
        const discriminant = this.parseParenExpression()
        this.expectPunct('{')
        this.ctx.switches++
        const cases: SwitchCase[] = []
        let sawDefault = false
        while (!this.isPunct('}')) {
            const caseStart = this.tok.start
            let test: Expression | null = null
            if (this.eatName('case')) {
                test = this.parseExpression(false)
            } else if (this.isName('default')) {
                if (sawDefault) {
                    this.unexpected('multiple default clauses')
                }
                sawDefault = true
                this.advance()
            } else {
                this.unexpected('expected "case" or "default"')
            }
            this.expectPunct(':')
            const consequent: Statement[] = []
            while (!this.isPunct('}') && !this.isName('case') && !this.isName('default')) {
                consequent.push(this.parseStatement('list'))
            }
            cases.push({
                type: 'SwitchCase',
                test,
                consequent,
                start: caseStart,
                end: this.prevEnd,
            })
        }
        this.ctx.switches--
        this.expectPunct('}')
        return { type: 'SwitchStatement', discriminant, cases, start, end: this.prevEnd }
    }

    private parseTry(): Statement {
        const start = this.tok.start
        this.advance()
        const block = this.parseBlockBody()
        let handler: CatchClause | null = null
        let finalizer: BlockStatement | null = null
        if (this.isName('catch')) {
            const catchStart = this.tok.start
            this.advance()
            let param: Pattern | null = null
            if (this.eatPunct('(')) {
                param = this.parseBindingAtom()
                this.expectPunct(')')
            }
            const body = this.parseBlockBody()
            handler = { type: 'CatchClause', param, body, start: catchStart, end: this.prevEnd }
        }
        if (this.eatName('finally')) {
            finalizer = this.parseBlockBody()
        }
        if (handler === null && finalizer === null) {
            this.unexpected('missing catch or finally after try')
        }
        return { type: 'TryStatement', block, handler, finalizer, start, end: this.prevEnd }
    }

    private parseLabeled(place: StatementPlace): Statement {
        const start = this.tok.start
        const label = this.parseIdentifier()
        this.expectPunct(':')
        if (this.ctx.labels.some((l) => l.name === label.name)) {
            throw new ParseError(`label "${label.name}" is already declared`, start)
        }
        const t = this.tok
        const kind =
            t.type === 'name' && (t.value === 'for' || t.value === 'while' || t.value === 'do')
                ? 'loop'
                : null
        // `a: b: while (x) continue a` - every label stacked on this statement labels the loop.
        for (let i = this.ctx.labels.length - 1; i >= 0; i--) {
            const earlier = this.ctx.labels[i]
            if (earlier?.statementStart !== start) {
                break
            }
            earlier.statementStart = t.start
            earlier.kind = kind
        }
        this.ctx.labels.push({ name: label.name, kind, statementStart: t.start })
        const body = this.parseStatement(place === 'single' ? 'single' : 'loose')
        this.ctx.labels.pop()
        return { type: 'LabeledStatement', label, body, start, end: this.prevEnd }
    }

    private parseVarStatement(): VariableDeclaration {
        const declaration = this.parseVar(false, false)
        this.semicolon()
        declaration.end = this.prevEnd
        return declaration
    }

    /**
     * Parses `var|let|const a = 1, b`. In a `for` head (`forHead`), a declarator may omit its
     * initializer when `in`/`of` follows; the caller validates the rest.
     */
    private parseVar(noIn: boolean, forHead: boolean): VariableDeclaration {
        const start = this.tok.start
        const kind = this.tok.value === 'var' ? 'var' : this.tok.value === 'let' ? 'let' : 'const'
        this.advance()
        const declarations: VariableDeclarator[] = []
        do {
            const declStart = this.tok.start
            const id = this.parseBindingAtom()
            if (kind !== 'var' && id.type === 'Identifier' && id.name === 'let') {
                throw new ParseError('"let" is disallowed as a lexically bound name', id.start)
            }
            let init: Expression | null = null
            if (this.eatPunct('=')) {
                init = this.parseMaybeAssign(noIn, null)
            } else if (!(forHead && (this.isName('in') || this.isName('of')))) {
                if (kind === 'const') {
                    this.unexpected('missing initializer in const declaration')
                }
                if (id.type !== 'Identifier') {
                    this.unexpected('missing initializer in destructuring declaration')
                }
            }
            declarations.push({
                type: 'VariableDeclarator',
                id,
                init,
                start: declStart,
                end: this.prevEnd,
            })
        } while (this.eatPunct(','))
        return { type: 'VariableDeclaration', kind, declarations, start, end: this.prevEnd }
    }

    private parseFor(): Statement {
        const start = this.tok.start
        this.advance()
        let isAwait = false
        if (this.isName('await')) {
            if (!this.ctx.inAsync) {
                this.unexpected('"for await" is only valid in async functions')
            }
            this.advance()
            isAwait = true
        }
        this.expectPunct('(')
        if (this.isPunct(';')) {
            if (isAwait) {
                this.unexpected('expected "of"')
            }
            return this.parseForRest(start, null)
        }
        const t = this.tok
        if (
            t.type === 'name' &&
            !t.escaped &&
            (t.value === 'var' ||
                t.value === 'const' ||
                (t.value === 'let' && this.letStartsDeclaration(this.peek())))
        ) {
            return this.parseForWithDeclaration(start, isAwait)
        }
        const startsWithLet = t.type === 'name' && t.value === 'let' && !t.escaped
        const cover: Cover = { shorthandAssign: -1 }
        let init = this.parseMaybeAssign(true, cover)
        if (this.isName('of') || this.isName('in')) {
            if (this.isName('of') && startsWithLet) {
                this.unexpected('the left-hand side of a for-of loop may not be "let"')
            }
            if (init.type === 'AssignmentExpression') {
                throw new ParseError('invalid left-hand side in for-loop head', init.start)
            }
            return this.parseForInOf(start, this.toAssignable(init, false), isAwait)
        }
        if (cover.shorthandAssign !== -1) {
            throw new ParseError('invalid shorthand property initializer', cover.shorthandAssign)
        }
        if (isAwait) {
            this.unexpected('expected "of"')
        }
        if (this.isPunct(',')) {
            const expressions = [init]
            while (this.eatPunct(',')) {
                expressions.push(this.parseMaybeAssign(true, null))
            }
            init = { type: 'SequenceExpression', expressions, start: t.start, end: this.prevEnd }
        }
        return this.parseForRest(start, init)
    }

    private parseForWithDeclaration(start: number, isAwait: boolean): Statement {
        const declaration = this.parseVar(true, true)
        if (!this.isName('of') && !this.isName('in')) {
            if (isAwait) {
                this.unexpected('expected "of"')
            }
            return this.parseForRest(start, declaration)
        }
        const single = declaration.declarations[0]
        if (declaration.declarations.length !== 1 || single === undefined) {
            throw new ParseError('invalid left-hand side in for-loop head', declaration.start)
        }
        if (
            single.init !== null &&
            (this.isName('of') ||
                this.strict ||
                declaration.kind !== 'var' ||
                single.id.type !== 'Identifier')
        ) {
            throw new ParseError(
                'for-in/of loop variable may not have an initializer',
                single.init.start,
            )
        }
        return this.parseForInOf(start, declaration, isAwait)
    }

    private parseForRest(start: number, init: VariableDeclaration | Expression | null): Statement {
        this.expectPunct(';')
        const test = this.isPunct(';') ? null : this.parseExpression(false)
        this.expectPunct(';')
        const update = this.isPunct(')') ? null : this.parseExpression(false)
        this.expectPunct(')')
        const body = this.parseLoopBody()
        return { type: 'ForStatement', init, test, update, body, start, end: this.prevEnd }
    }

    private parseForInOf(
        start: number,
        left: VariableDeclaration | Pattern,
        isAwait: boolean,
    ): Statement {
        const isOf = this.isName('of')
        if (isAwait && !isOf) {
            this.unexpected('expected "of"')
        }
        this.advance()
        const right = isOf ? this.parseMaybeAssign(false, null) : this.parseExpression(false)
        this.expectPunct(')')
        const body = this.parseLoopBody()
        return isOf
            ? {
                  type: 'ForOfStatement',
                  left,
                  right,
                  body,
                  await: isAwait,
                  start,
                  end: this.prevEnd,
              }
            : { type: 'ForInStatement', left, right, body, start, end: this.prevEnd }
    }

    // ---- Modules ----

    /** Parses a module export name: any identifier name (keywords included) or a string literal. */
    private parseModuleName(): Identifier | Literal {
        const t = this.tok
        if (t.type === 'string') {
            return this.parseModuleSource()
        }
        if (t.type !== 'name') {
            return this.unexpected('expected a name')
        }
        this.advance()
        return { type: 'Identifier', name: t.value, start: t.start, end: t.end }
    }

    private parseModuleSource(): Literal {
        const t = this.tok
        if (t.type !== 'string') {
            return this.unexpected('expected a string')
        }
        this.advance()
        return {
            type: 'Literal',
            value: t.value,
            raw: this.code.slice(t.start, t.end),
            start: t.start,
            end: t.end,
        }
    }

    /** Parses an optional `with { type: 'json' }` clause. */
    private parseImportAttributes(): ImportAttribute[] {
        const attributes: ImportAttribute[] = []
        if (!this.eatName('with')) {
            return attributes
        }
        this.expectPunct('{')
        const seen = new Set<string>()
        while (!this.isPunct('}')) {
            if (attributes.length > 0) {
                this.expectPunct(',')
                if (this.isPunct('}')) {
                    break
                }
            }
            const start = this.tok.start
            const key = this.parseModuleName()
            const name = key.type === 'Identifier' ? key.name : String(key.value)
            if (seen.has(name)) {
                throw new ParseError(`duplicate import attribute "${name}"`, start)
            }
            seen.add(name)
            this.expectPunct(':')
            const value = this.parseModuleSource()
            attributes.push({ type: 'ImportAttribute', key, value, start, end: this.prevEnd })
        }
        this.expectPunct('}')
        return attributes
    }

    private parseImport(): ImportDeclaration {
        const start = this.tok.start
        this.sawModule = true
        this.advance()
        const specifiers: ImportDeclaration['specifiers'] = []
        if (this.tok.type !== 'string') {
            let more = true
            if (this.tok.type === 'name') {
                const local = this.parseIdentifier()
                specifiers.push({
                    type: 'ImportDefaultSpecifier',
                    local,
                    start: local.start,
                    end: local.end,
                })
                more = this.eatPunct(',')
            }
            if (more) {
                this.parseImportBraces(specifiers)
            }
            this.expectName('from')
        }
        const source = this.parseModuleSource()
        const attributes = this.parseImportAttributes()
        this.semicolon()
        return {
            type: 'ImportDeclaration',
            specifiers,
            source,
            attributes,
            start,
            end: this.prevEnd,
        }
    }

    /** Parses `* as ns` or `{ a, b as c }` into import specifiers. */
    private parseImportBraces(specifiers: ImportDeclaration['specifiers']): void {
        if (this.isPunct('*')) {
            const start = this.tok.start
            this.advance()
            this.expectName('as')
            const local = this.parseIdentifier()
            specifiers.push({ type: 'ImportNamespaceSpecifier', local, start, end: this.prevEnd })
            return
        }
        if (!this.isPunct('{')) {
            this.unexpected('expected "*" or "{"')
        }
        this.advance()
        while (!this.isPunct('}')) {
            const start = this.tok.start
            const imported = this.parseModuleName()
            let local: Identifier
            if (this.eatName('as')) {
                local = this.parseIdentifier()
            } else if (imported.type === 'Identifier' && !this.isReserved(imported.name)) {
                local = { ...imported }
            } else {
                throw new ParseError('expected "as" after this import name', start)
            }
            specifiers.push({ type: 'ImportSpecifier', imported, local, start, end: this.prevEnd })
            if (!this.isPunct('}')) {
                this.expectPunct(',')
            }
        }
        this.expectPunct('}')
    }

    private parseExport(): Statement {
        const start = this.tok.start
        this.sawModule = true
        this.advance()
        if (this.eatPunct('*')) {
            const exported = this.eatName('as') ? this.parseModuleName() : null
            this.expectName('from')
            const source = this.parseModuleSource()
            const attributes = this.parseImportAttributes()
            this.semicolon()
            return {
                type: 'ExportAllDeclaration',
                exported,
                source,
                attributes,
                start,
                end: this.prevEnd,
            }
        }
        if (this.eatName('default')) {
            return this.parseExportDefault(start)
        }
        if (this.isPunct('{')) {
            return this.parseExportSpecifiers(start)
        }
        const t = this.tok
        let declaration: FunctionDeclaration | ClassDeclaration | VariableDeclaration
        if (t.type === 'name' && !t.escaped && t.value === 'function') {
            declaration = this.parseFunction(t.start, true, false)
        } else if (t.type === 'name' && !t.escaped && t.value === 'async') {
            if (!this.peekIsFunctionOnSameLine()) {
                return this.unexpected()
            }
            this.advance()
            declaration = this.parseFunction(t.start, true, true)
        } else if (t.type === 'name' && !t.escaped && t.value === 'class') {
            declaration = this.parseClass(t.start, true)
        } else if (
            t.type === 'name' &&
            !t.escaped &&
            (t.value === 'var' || t.value === 'let' || t.value === 'const')
        ) {
            declaration = this.parseVarStatement()
        } else {
            return this.unexpected()
        }
        return {
            type: 'ExportNamedDeclaration',
            declaration,
            specifiers: [],
            source: null,
            attributes: [],
            start,
            end: this.prevEnd,
        }
    }

    private parseExportDefault(start: number): Statement {
        const t = this.tok
        let declaration: FunctionDeclaration | ClassDeclaration | Expression
        if (t.type === 'name' && !t.escaped && t.value === 'function') {
            declaration = this.parseFunction(t.start, true, false, true)
        } else if (t.type === 'name' && !t.escaped && t.value === 'class') {
            declaration = this.parseClass(t.start, true, true)
        } else if (
            t.type === 'name' &&
            !t.escaped &&
            t.value === 'async' &&
            this.peekIsFunctionOnSameLine()
        ) {
            this.advance()
            declaration = this.parseFunction(t.start, true, true, true)
        } else {
            declaration = this.parseMaybeAssign(false, null)
            this.semicolon()
        }
        return { type: 'ExportDefaultDeclaration', declaration, start, end: this.prevEnd }
    }

    private peekIsFunctionOnSameLine(): boolean {
        const next = this.peek()
        return next.type === 'name' && next.value === 'function' && !next.nlBefore
    }

    private parseExportSpecifiers(start: number): Statement {
        this.advance()
        const specifiers: ExportSpecifier[] = []
        while (!this.isPunct('}')) {
            const specStart = this.tok.start
            const local = this.parseModuleName()
            const exported = this.eatName('as') ? this.parseModuleName() : { ...local }
            specifiers.push({
                type: 'ExportSpecifier',
                local,
                exported,
                start: specStart,
                end: this.prevEnd,
            })
            if (!this.isPunct('}')) {
                this.expectPunct(',')
            }
        }
        this.expectPunct('}')
        let source: Literal | null = null
        let attributes: ImportAttribute[] = []
        if (this.eatName('from')) {
            source = this.parseModuleSource()
            attributes = this.parseImportAttributes()
        } else {
            for (const specifier of specifiers) {
                const { local } = specifier
                if (local.type !== 'Identifier' || this.isReserved(local.name)) {
                    throw new ParseError('invalid local export name', local.start)
                }
            }
        }
        this.semicolon()
        return {
            type: 'ExportNamedDeclaration',
            declaration: null,
            specifiers,
            source,
            attributes,
            start,
            end: this.prevEnd,
        }
    }

    // ---- Expressions ----

    private parseExpression(noIn: boolean): Expression {
        const start = this.tok.start
        const first = this.parseMaybeAssign(noIn, null)
        if (!this.isPunct(',')) {
            return first
        }
        const expressions = [first]
        while (this.eatPunct(',')) {
            expressions.push(this.parseMaybeAssign(noIn, null))
        }
        return { type: 'SequenceExpression', expressions, start, end: this.prevEnd }
    }

    private parseMaybeAssign(noIn: boolean, outer: Cover | null): Expression {
        if (this.isName('yield') && this.ctx.inGenerator) {
            return this.parseYield(noIn)
        }
        const start = this.tok.start
        const cover = outer ?? { shorthandAssign: -1 }
        const outerShorthand = cover.shorthandAssign
        cover.shorthandAssign = -1
        this.arrowStart = start
        if (noIn) {
            this.noInStart = start
        } else if (this.noInStart === start) {
            this.noInStart = -1
        }
        const left = this.parseMaybeConditional(noIn, cover)
        const t = this.tok
        if (t.type === 'punct' && isAssignmentOperator(t.value)) {
            const operator = t.value
            const target =
                operator === '=' ? this.toAssignable(left, false) : this.checkSimpleTarget(left)
            cover.shorthandAssign = outerShorthand
            this.advance()
            const right = this.parseMaybeAssign(noIn, null)
            return {
                type: 'AssignmentExpression',
                operator,
                left: target,
                right,
                start,
                end: this.prevEnd,
            }
        }
        if (outer === null && cover.shorthandAssign !== -1) {
            throw new ParseError('invalid shorthand property initializer', cover.shorthandAssign)
        }
        if (cover.shorthandAssign === -1) {
            cover.shorthandAssign = outerShorthand
        }
        return left
    }

    private parseYield(noIn: boolean): Expression {
        const start = this.tok.start
        this.advance()
        const t = this.tok
        if (t.nlBefore || !this.startsExpression(t)) {
            return {
                type: 'YieldExpression',
                argument: null,
                delegate: false,
                start,
                end: this.prevEnd,
            }
        }
        const delegate = this.eatPunct('*')
        const argument = this.parseMaybeAssign(noIn, null)
        return { type: 'YieldExpression', argument, delegate, start, end: this.prevEnd }
    }

    private startsExpression(t: LexToken): boolean {
        switch (t.type) {
            case 'eof':
                return false
            case 'name':
                return t.escaped || (t.value !== 'in' && t.value !== 'instanceof')
            case 'punct':
                return (
                    t.value === '*' ||
                    t.value === '(' ||
                    t.value === '[' ||
                    t.value === '{' ||
                    t.value === '/' ||
                    t.value === '/=' ||
                    t.value === '++' ||
                    t.value === '--' ||
                    unaryPunctuators.has(t.value)
                )
            case 'private':
            case 'num':
            case 'bigint':
            case 'string':
            case 'regex':
            case 'template':
                return true
        }
    }

    private isPlainArrow(expr: Expression): boolean {
        return expr.type === 'ArrowFunctionExpression' && !this.parenthesized.has(expr)
    }

    private parseMaybeConditional(noIn: boolean, cover: Cover): Expression {
        const start = this.tok.start
        const test = this.parseExprOps(noIn, cover)
        if (cover.shorthandAssign !== -1 || this.isPlainArrow(test) || !this.isPunct('?')) {
            return test
        }
        this.advance()
        const consequent = this.parseMaybeAssign(false, null)
        this.expectPunct(':')
        const alternate = this.parseMaybeAssign(noIn, null)
        return {
            type: 'ConditionalExpression',
            test,
            consequent,
            alternate,
            start,
            end: this.prevEnd,
        }
    }

    private parseExprOps(noIn: boolean, cover: Cover): Expression {
        const start = this.tok.start
        const expr = this.parseOperand(noIn, -1, cover)
        if (cover.shorthandAssign !== -1 || this.isPlainArrow(expr)) {
            return expr
        }
        return this.parseExprOp(expr, start, -1, noIn)
    }

    private binaryOperatorAt(noIn: boolean): string | null {
        const t = this.tok
        if (t.type === 'punct') {
            return binaryPrecedence.has(t.value) ? t.value : null
        }
        if (t.type === 'name' && !t.escaped) {
            if (t.value === 'instanceof' || (t.value === 'in' && !noIn)) {
                return t.value
            }
        }
        return null
    }

    private parseExprOp(
        left: Expression,
        leftStart: number,
        minPrec: number,
        noIn: boolean,
    ): Expression {
        let result = left
        for (;;) {
            const operator = this.binaryOperatorAt(noIn)
            const precedence = operator === null ? undefined : binaryPrecedence.get(operator)
            if (operator === null || precedence === undefined || precedence <= minPrec) {
                return result
            }
            if (
                operator === '**' &&
                (result.type === 'UnaryExpression' || result.type === 'AwaitExpression') &&
                !this.parenthesized.has(result)
            ) {
                throw new ParseError(
                    'unary operator before "**" must be parenthesized',
                    result.start,
                )
            }
            this.advance()
            const rightStart = this.tok.start
            const rightPrec = operator === '**' ? precedence - 1 : precedence
            const right = this.parseExprOp(
                this.parseOperand(noIn, precedence, null),
                rightStart,
                rightPrec,
                noIn,
            )
            result = this.buildBinary(result, leftStart, operator, right)
        }
    }

    private isUnparenthesized(node: Expression, operators: readonly string[]): boolean {
        return (
            node.type === 'LogicalExpression' &&
            operators.includes(node.operator) &&
            !this.parenthesized.has(node)
        )
    }

    private buildBinary(
        left: Expression,
        start: number,
        operator: string,
        right: Expression,
    ): Expression {
        const end = this.prevEnd
        if (isLogicalOperator(operator)) {
            const mixed = operator === '??' ? ['||', '&&'] : ['??']
            if (this.isUnparenthesized(left, mixed) || this.isUnparenthesized(right, mixed)) {
                throw new ParseError('cannot mix "??" with "||" or "&&" without parentheses', start)
            }
            return { type: 'LogicalExpression', operator, left, right, start, end }
        }
        if (!isBinaryOperator(operator)) {
            throw new ParseError(`unknown operator ${operator}`, start)
        }
        return { type: 'BinaryExpression', operator, left, right, start, end }
    }

    /**
     * Parses a binary-operator operand: a unary expression, or `#x in rhs` when the operator's
     * precedence (`minPrec`) allows a relational expression there.
     */
    private parseOperand(noIn: boolean, minPrec: number, cover: Cover | null): Expression {
        const t = this.tok
        if (t.type !== 'private') {
            return this.parseMaybeUnary(cover)
        }
        if (minPrec >= 7 || noIn) {
            return this.unexpected('private name is only valid as the left side of "in"')
        }
        this.advance()
        if (!this.isName('in')) {
            throw new ParseError('private name is only valid as the left side of "in"', t.start)
        }
        this.advance()
        const rightStart = this.tok.start
        const right = this.parseExprOp(this.parseMaybeUnary(null), rightStart, 7, noIn)
        return {
            type: 'BinaryExpression',
            operator: 'in',
            left: { type: 'PrivateIdentifier', name: t.value, start: t.start, end: t.end },
            right,
            start: t.start,
            end: this.prevEnd,
        }
    }

    private parseMaybeUnary(cover: Cover | null): Expression {
        const t = this.tok
        const start = t.start
        if (t.type === 'name' && !t.escaped) {
            if (t.value === 'await' && this.ctx.inAsync) {
                this.advance()
                const argument = this.parseMaybeUnary(null)
                return { type: 'AwaitExpression', argument, start, end: this.prevEnd }
            }
            if (unaryKeywords.has(t.value) && isUnaryOperator(t.value)) {
                this.advance()
                const argument = this.parseMaybeUnary(null)
                if (t.value === 'delete' && this.strict && argument.type === 'Identifier') {
                    throw new ParseError('cannot delete an unqualified name in strict mode', start)
                }
                return {
                    type: 'UnaryExpression',
                    operator: t.value,
                    prefix: true,
                    argument,
                    start,
                    end: this.prevEnd,
                }
            }
        } else if (t.type === 'punct') {
            if (unaryPunctuators.has(t.value) && isUnaryOperator(t.value)) {
                this.advance()
                const argument = this.parseMaybeUnary(null)
                return {
                    type: 'UnaryExpression',
                    operator: t.value,
                    prefix: true,
                    argument,
                    start,
                    end: this.prevEnd,
                }
            }
            if (t.value === '++' || t.value === '--') {
                this.advance()
                const argument = this.parseMaybeUnary(null)
                this.checkSimpleTarget(argument)
                return {
                    type: 'UpdateExpression',
                    operator: t.value,
                    prefix: true,
                    argument,
                    start,
                    end: this.prevEnd,
                }
            }
        }
        let expr = this.parseExprSubscripts(cover)
        if (cover !== null && cover.shorthandAssign !== -1) {
            return expr
        }
        while (!this.isPlainArrow(expr)) {
            const post = this.tok
            if (
                post.type === 'punct' &&
                (post.value === '++' || post.value === '--') &&
                !post.nlBefore
            ) {
                this.checkSimpleTarget(expr)
                this.advance()
                expr = {
                    type: 'UpdateExpression',
                    operator: post.value,
                    prefix: false,
                    argument: expr,
                    start,
                    end: this.prevEnd,
                }
            } else {
                break
            }
        }
        return expr
    }

    private parseExprSubscripts(cover: Cover | null): Expression {
        const start = this.tok.start
        const expr = this.parseAtomOrSuper(cover)
        if (expr.type !== 'Super' && this.isPlainArrow(expr)) {
            return expr
        }
        const result = this.parseSubscripts(expr, start, false)
        if (result !== expr && cover !== null && cover.shorthandAssign !== -1) {
            throw new ParseError('invalid shorthand property initializer', cover.shorthandAssign)
        }
        return result
    }

    /**
     * Like {@link Parser.parseExprAtom} but also yields a `Super` node (always followed by a
     * subscript).
     */
    private parseAtomOrSuper(cover: Cover | null): Expression | Super {
        const t = this.tok
        if (t.type !== 'name' || t.escaped || t.value !== 'super') {
            return this.parseExprAtom(cover)
        }
        this.advance()
        const next = this.tok
        if (next.type === 'punct' && next.value === '(') {
            if (!this.ctx.allowSuperCall) {
                throw new ParseError("'super' call is only valid in a derived constructor", t.start)
            }
        } else if (next.type === 'punct' && (next.value === '.' || next.value === '[')) {
            if (!this.ctx.allowSuperProperty) {
                throw new ParseError("'super' property is only valid in methods", t.start)
            }
        } else {
            throw new ParseError("unexpected 'super'", t.start)
        }
        return { type: 'Super', start: t.start, end: t.end }
    }

    // ---- Targets ----

    private checkSimpleTarget(node: Expression): Pattern {
        if (node.type === 'Identifier') {
            this.checkStrictName(node)
            return node
        }
        if (node.type === 'MemberExpression') {
            return node
        }
        throw new ParseError('invalid assignment target', node.start)
    }

    /**
     * Reinterprets an expression as an assignment target (`binding` false) or a binding pattern
     * (arrow parameters, `binding` true). Already-converted patterns pass through (verified when
     * `binding`). Throws `ParseError('invalid assignment target')` when impossible.
     */
    private toAssignable(node: Expression | SpreadElement | Pattern, binding: boolean): Pattern {
        const parenthesized = this.parenthesized.has(node)
        switch (node.type) {
            case 'Identifier':
                if (binding && parenthesized) {
                    break
                }
                this.checkStrictName(node)
                return node
            case 'MemberExpression':
                if (binding) {
                    break
                }
                return node
            case 'ObjectPattern':
            case 'ArrayPattern':
            case 'AssignmentPattern':
            case 'RestElement':
                if (binding) {
                    this.verifyBinding(node)
                }
                return node
            case 'ObjectExpression':
                if (parenthesized) {
                    break
                }
                return this.objectToPattern(node, binding)
            case 'ArrayExpression': {
                if (parenthesized) {
                    break
                }
                const elements: (Pattern | null)[] = []
                const last = node.elements.length - 1
                for (const [index, element] of node.elements.entries()) {
                    if (element === null) {
                        elements.push(null)
                    } else if (element.type === 'SpreadElement') {
                        if (index !== last || this.spreadWithComma.has(element)) {
                            throw new ParseError('rest element must be last', element.start)
                        }
                        elements.push(this.spreadToRest(element, binding))
                    } else {
                        elements.push(this.toAssignable(element, binding))
                    }
                }
                return { type: 'ArrayPattern', elements, start: node.start, end: node.end }
            }
            case 'AssignmentExpression':
                if (node.operator !== '=' || parenthesized) {
                    break
                }
                if (binding) {
                    this.verifyBinding(node.left)
                }
                return {
                    type: 'AssignmentPattern',
                    left: node.left,
                    right: node.right,
                    start: node.start,
                    end: node.end,
                }
            default:
                break
        }
        throw new ParseError('invalid assignment target', node.start)
    }

    private spreadToRest(node: SpreadElement, binding: boolean): Pattern {
        return {
            type: 'RestElement',
            argument: this.toAssignable(node.argument, binding),
            start: node.start,
            end: node.end,
        }
    }

    private objectToPattern(
        node: Extract<Expression, { type: 'ObjectExpression' }>,
        binding: boolean,
    ): Pattern {
        const properties: (Property | Extract<Pattern, { type: 'RestElement' }>)[] = []
        const last = node.properties.length - 1
        for (const [index, property] of node.properties.entries()) {
            if (property.type === 'SpreadElement') {
                if (index !== last || this.spreadWithComma.has(property)) {
                    throw new ParseError('rest element must be last', property.start)
                }
                const argument = property.argument
                if (
                    argument.type !== 'Identifier' &&
                    (binding || argument.type !== 'MemberExpression')
                ) {
                    throw new ParseError('invalid assignment target', argument.start)
                }
                properties.push({
                    type: 'RestElement',
                    argument: this.toAssignable(argument, binding),
                    start: property.start,
                    end: property.end,
                })
            } else {
                if (property.kind !== 'init' || property.method) {
                    throw new ParseError('invalid assignment target', property.start)
                }
                properties.push({ ...property, value: this.toAssignable(property.value, binding) })
            }
        }
        return { type: 'ObjectPattern', properties, start: node.start, end: node.end }
    }

    /**
     * Throws if an already-converted pattern contains a member expression or a parenthesized
     * target.
     */
    private verifyBinding(pattern: Pattern): void {
        switch (pattern.type) {
            case 'Identifier':
                if (this.parenthesized.has(pattern)) {
                    throw new ParseError('invalid binding pattern', pattern.start)
                }
                return
            case 'MemberExpression':
                throw new ParseError('invalid binding pattern', pattern.start)
            case 'AssignmentPattern':
                this.verifyBinding(pattern.left)
                return
            case 'RestElement':
                this.verifyBinding(pattern.argument)
                return
            case 'ArrayPattern':
                for (const element of pattern.elements) {
                    if (element !== null) {
                        this.verifyBinding(element)
                    }
                }
                return
            case 'ObjectPattern':
                for (const property of pattern.properties) {
                    this.toAssignable(
                        property.type === 'RestElement' ? property : property.value,
                        true,
                    )
                }
                return
        }
    }

    // ---- Atoms ----

    private parseExprAtom(cover: Cover | null): Expression {
        const t = this.tok
        const start = t.start
        const canBeArrow = this.arrowStart === start
        switch (t.type) {
            case 'num':
                this.advance()
                return {
                    type: 'Literal',
                    value: t.num,
                    raw: this.code.slice(t.start, t.end),
                    start,
                    end: t.end,
                }
            case 'bigint':
                this.advance()
                return {
                    type: 'Literal',
                    value: t.big,
                    raw: this.code.slice(t.start, t.end),
                    bigint: t.big.toString(),
                    start,
                    end: t.end,
                }
            case 'string':
                this.advance()
                return {
                    type: 'Literal',
                    value: t.value,
                    raw: this.code.slice(t.start, t.end),
                    start,
                    end: t.end,
                }
            case 'template':
                return this.parseTemplate(false)
            case 'regex':
            case 'eof':
            case 'private':
                return this.unexpected()
            case 'punct':
                return this.parsePunctAtom(t, cover, canBeArrow)
            case 'name':
                return this.parseNameAtom(t, canBeArrow)
        }
    }

    private parsePunctAtom(t: LexToken, cover: Cover | null, canBeArrow: boolean): Expression {
        switch (t.value) {
            case '(':
                return this.parseParenAndDistinguish(canBeArrow)
            case '[':
                return this.parseArray(cover)
            case '{':
                return this.parseObject(cover)
            case '/':
            case '/=': {
                this.tok = this.lexer.rescanRegex(t)
                return this.parseRegex()
            }
            default:
                return this.unexpected()
        }
    }

    private parseRegex(): Literal {
        const t = this.tok
        this.advance()
        // A SyntaxError from the engine means the pattern is invalid, except with the `v` flag: its
        // set notation depends on the host's regex support, so there the value stays null instead.
        let value: RegExp | null = null
        try {
            value = new RegExp(t.value, t.flags)
        } catch (error) {
            if (!(error instanceof SyntaxError) || !t.flags.includes('v')) {
                throw new ParseError('invalid regular expression', t.start)
            }
        }
        return {
            type: 'Literal',
            value,
            raw: this.code.slice(t.start, t.end),
            regex: { pattern: t.value, flags: t.flags },
            start: t.start,
            end: t.end,
        }
    }

    private parseNameAtom(t: LexToken, canBeArrow: boolean): Expression {
        const start = t.start
        if (!t.escaped) {
            switch (t.value) {
                case 'this':
                    this.advance()
                    return { type: 'ThisExpression', start, end: t.end }
                case 'null':
                    this.advance()
                    return { type: 'Literal', value: null, raw: 'null', start, end: t.end }
                case 'true':
                case 'false':
                    this.advance()
                    return {
                        type: 'Literal',
                        value: t.value === 'true',
                        raw: t.value,
                        start,
                        end: t.end,
                    }
                case 'function':
                    return this.parseFunction(start, false, false)
                case 'class':
                    return this.parseClass(start, false)
                case 'new':
                    return this.parseNew()
                case 'import':
                    return this.parseImportAtom()
                case 'async':
                    return this.parseAsyncAtom(canBeArrow)
                default:
                    break
            }
        }
        const id = this.parseIdentifier()
        if (canBeArrow && this.isPunct('=>') && !this.tok.nlBefore) {
            return this.parseArrowExpression(start, [id], false)
        }
        return id
    }

    private parseAsyncAtom(canBeArrow: boolean): Expression {
        const start = this.tok.start
        const id = this.parseIdentifier()
        const t = this.tok
        if (t.type === 'name' && !t.escaped && t.value === 'function' && !t.nlBefore) {
            return this.parseFunction(start, false, true)
        }
        if (canBeArrow && t.type === 'punct' && t.value === '=>' && !t.nlBefore) {
            return this.parseArrowExpression(start, [id], false)
        }
        if (canBeArrow && t.type === 'name' && !t.nlBefore) {
            const next = this.peek()
            if (next.type === 'punct' && next.value === '=>' && !next.nlBefore) {
                const param = this.parseIdentifier()
                return this.parseArrowExpression(start, [param], true)
            }
        }
        return id
    }

    private parseIdentifier(): Identifier {
        const t = this.tok
        if (t.type !== 'name' || this.isReserved(t.value)) {
            return this.unexpected()
        }
        if (t.value === 'await' && !this.ctx.inFunction && !this.module) {
            this.sawTopLevelAwait = true
        }
        this.advance()
        return { type: 'Identifier', name: t.value, start: t.start, end: t.end }
    }

    private parseImportAtom(): Expression {
        const start = this.tok.start
        this.advance()
        if (this.eatPunct('.')) {
            this.sawModule = true
            const property = this.tok
            if (property.type !== 'name' || property.value !== 'meta' || property.escaped) {
                this.unexpected('expected "meta"')
            }
            this.advance()
            return {
                type: 'MetaProperty',
                meta: { type: 'Identifier', name: 'import', start, end: start + 6 },
                property: {
                    type: 'Identifier',
                    name: 'meta',
                    start: property.start,
                    end: property.end,
                },
                start,
                end: this.prevEnd,
            }
        }
        if (!this.isPunct('(')) {
            return this.unexpected()
        }
        this.advance()
        const source = this.parseMaybeAssign(false, null)
        let options: Expression | null = null
        if (this.eatPunct(',') && !this.isPunct(')')) {
            options = this.parseMaybeAssign(false, null)
            this.eatPunct(',')
        }
        this.expectPunct(')')
        return { type: 'ImportExpression', source, options, start, end: this.prevEnd }
    }

    private parseNew(): Expression {
        const start = this.tok.start
        this.advance()
        if (this.isPunct('.')) {
            this.advance()
            const property = this.tok
            if (property.type !== 'name' || property.value !== 'target' || property.escaped) {
                this.unexpected('expected "target"')
            }
            if (!this.ctx.allowNewTarget) {
                throw new ParseError("'new.target' is only valid inside functions", start)
            }
            this.advance()
            return {
                type: 'MetaProperty',
                meta: { type: 'Identifier', name: 'new', start, end: start + 3 },
                property: {
                    type: 'Identifier',
                    name: 'target',
                    start: property.start,
                    end: property.end,
                },
                start,
                end: this.prevEnd,
            }
        }
        const calleeStart = this.tok.start
        const callee = this.parseSubscripts(this.parseAtomOrSuper(null), calleeStart, true)
        if (callee.type === 'ImportExpression' && !this.parenthesized.has(callee)) {
            throw new ParseError("cannot use 'new' with import()", calleeStart)
        }
        const args = this.isPunct('(') ? this.parseArguments(null) : []
        return { type: 'NewExpression', callee, arguments: args, start, end: this.prevEnd }
    }

    private parseArguments(cover: Cover | null): (Expression | SpreadElement)[] {
        this.expectPunct('(')
        const args: (Expression | SpreadElement)[] = []
        while (!this.isPunct(')')) {
            if (args.length > 0) {
                this.expectPunct(',')
                if (this.isPunct(')')) {
                    break
                }
            }
            args.push(this.parseListElement(cover))
        }
        this.expectPunct(')')
        return args
    }

    /** One array element or call argument: a spread or an assignment expression. */
    private parseListElement(cover: Cover | null): Expression | SpreadElement {
        if (this.isPunct('...')) {
            const start = this.tok.start
            this.advance()
            const argument = this.parseMaybeAssign(false, cover)
            const spread: SpreadElement = {
                type: 'SpreadElement',
                argument,
                start,
                end: this.prevEnd,
            }
            if (this.isPunct(',')) {
                this.spreadWithComma.add(spread)
            }
            return spread
        }
        return this.parseMaybeAssign(false, cover)
    }

    // ---- Subscripts ----

    private parseSubscripts(base: Expression | Super, start: number, noCalls: boolean): Expression {
        let expr = base
        let inChain = false
        for (;;) {
            const t = this.tok
            if (t.type === 'template') {
                if (inChain) {
                    throw new ParseError('tagged template in optional chain', t.start)
                }
                if (expr.type === 'Super') {
                    this.unexpected()
                }
                const quasi = this.parseTemplate(true)
                expr = {
                    type: 'TaggedTemplateExpression',
                    tag: expr,
                    quasi,
                    start,
                    end: this.prevEnd,
                }
                continue
            }
            if (t.type !== 'punct') {
                break
            }
            if (t.value === '?.') {
                if (noCalls) {
                    throw new ParseError('optional chain in "new" callee', t.start)
                }
                this.advance()
                inChain = true
                if (this.isPunct('(')) {
                    const args = this.parseArguments(null)
                    expr = {
                        type: 'CallExpression',
                        callee: expr,
                        arguments: args,
                        optional: true,
                        start,
                        end: this.prevEnd,
                    }
                } else if (this.isPunct('[')) {
                    expr = this.parseComputedMember(expr, start, true)
                } else {
                    expr = this.parseDotMember(expr, start, true)
                }
            } else if (t.value === '.') {
                this.advance()
                expr = this.parseDotMember(expr, start, false)
            } else if (t.value === '[') {
                expr = this.parseComputedMember(expr, start, false)
            } else if (t.value === '(' && !noCalls) {
                const maybeAsyncArrow =
                    expr.type === 'Identifier' &&
                    expr.name === 'async' &&
                    expr.start === start &&
                    this.arrowStart === start &&
                    !t.nlBefore &&
                    !inChain &&
                    !this.parenthesized.has(expr)
                if (maybeAsyncArrow) {
                    const cover: Cover = { shorthandAssign: -1 }
                    const args = this.parseArguments(cover)
                    if (this.isPunct('=>') && !this.tok.nlBefore) {
                        const params = this.listToParams(args)
                        return this.parseArrowExpression(start, params, true)
                    }
                    if (cover.shorthandAssign !== -1) {
                        throw new ParseError(
                            'invalid shorthand property initializer',
                            cover.shorthandAssign,
                        )
                    }
                    expr = {
                        type: 'CallExpression',
                        callee: expr,
                        arguments: args,
                        optional: false,
                        start,
                        end: this.prevEnd,
                    }
                } else {
                    const args = this.parseArguments(null)
                    expr = {
                        type: 'CallExpression',
                        callee: expr,
                        arguments: args,
                        optional: false,
                        start,
                        end: this.prevEnd,
                    }
                }
            } else {
                break
            }
        }
        if (inChain && (expr.type === 'CallExpression' || expr.type === 'MemberExpression')) {
            return { type: 'ChainExpression', expression: expr, start, end: this.prevEnd }
        }
        if (expr.type === 'Super') {
            return this.unexpected()
        }
        return expr
    }

    private parseDotMember(
        object: Expression | Super,
        start: number,
        optional: boolean,
    ): Expression {
        const t = this.tok
        let property: Expression | PrivateIdentifier
        if (t.type === 'name') {
            this.advance()
            property = { type: 'Identifier', name: t.value, start: t.start, end: t.end }
        } else if (t.type === 'private') {
            this.advance()
            property = { type: 'PrivateIdentifier', name: t.value, start: t.start, end: t.end }
        } else {
            return this.unexpected('expected property name')
        }
        return {
            type: 'MemberExpression',
            object,
            property,
            computed: false,
            optional,
            start,
            end: this.prevEnd,
        }
    }

    private parseComputedMember(
        object: Expression | Super,
        start: number,
        optional: boolean,
    ): Expression {
        this.expectPunct('[')
        const property = this.parseExpression(false)
        this.expectPunct(']')
        return {
            type: 'MemberExpression',
            object,
            property,
            computed: true,
            optional,
            start,
            end: this.prevEnd,
        }
    }

    private listToParams(items: (Expression | SpreadElement)[]): Pattern[] {
        const params: Pattern[] = []
        const last = items.length - 1
        for (const [index, item] of items.entries()) {
            if (item.type === 'SpreadElement') {
                if (index !== last || this.spreadWithComma.has(item)) {
                    throw new ParseError('rest parameter must be last', item.start)
                }
                params.push(this.spreadToRest(item, true))
            } else {
                const pattern = this.toAssignable(item, true)
                this.verifyBinding(pattern)
                params.push(pattern)
            }
        }
        return params
    }

    // ---- Parentheses and arrows ----

    private parseParenAndDistinguish(canBeArrow: boolean): Expression {
        const start = this.tok.start
        this.advance()
        const innerStart = this.tok.start
        const cover: Cover = { shorthandAssign: -1 }
        const items: (Expression | SpreadElement)[] = []
        let trailingComma = false
        while (!this.isPunct(')')) {
            if (items.length > 0) {
                this.expectPunct(',')
                if (this.isPunct(')')) {
                    trailingComma = true
                    break
                }
            }
            items.push(this.parseListElement(cover))
        }
        const closeStart = this.tok.start
        const innerEnd = this.prevEnd
        this.expectPunct(')')
        if (canBeArrow && this.isPunct('=>') && !this.tok.nlBefore) {
            return this.parseArrowExpression(start, this.listToParams(items), false)
        }
        const expressions: Expression[] = []
        for (const item of items) {
            if (item.type === 'SpreadElement') {
                throw new ParseError('unexpected "..."', item.start)
            }
            expressions.push(item)
        }
        const first = expressions[0]
        const last = expressions[expressions.length - 1]
        if (first === undefined || last === undefined || trailingComma) {
            throw new ParseError('unexpected ")"', closeStart)
        }
        if (cover.shorthandAssign !== -1) {
            throw new ParseError('invalid shorthand property initializer', cover.shorthandAssign)
        }
        const expr: Expression =
            expressions.length > 1
                ? { type: 'SequenceExpression', expressions, start: innerStart, end: innerEnd }
                : first
        this.parenthesized.add(expr)
        return expr
    }

    private parseArrowExpression(
        start: number,
        params: Pattern[],
        isAsync: boolean,
    ): ArrowFunctionExpression {
        // In a for-loop head, `in` ends a concise body: `for (f = () => a in b;;)` is an error.
        const noIn = this.noInStart === start
        this.expectPunct('=>')
        const saved = this.ctx
        const savedStrict = this.strict
        this.ctx = {
            ...saved,
            inGenerator: false,
            inAsync: isAsync,
            inFunction: true,
            labels: [],
            loops: 0,
            switches: 0,
        }
        let body: BlockStatement | Expression
        let expression: boolean
        if (this.isPunct('{')) {
            body = this.parseBlockBody(true)
            expression = false
        } else {
            body = this.parseMaybeAssign(noIn, null)
            expression = true
        }
        this.ctx = saved
        this.strict = savedStrict
        return {
            type: 'ArrowFunctionExpression',
            id: null,
            params,
            body,
            expression,
            generator: false,
            async: isAsync,
            start,
            end: this.prevEnd,
        }
    }

    // ---- Functions ----

    /**
     * Parses `function [*] [name] (params) { body }` with the current token at `function`.
     * @param start - Start offset of the whole function (the `async` keyword when async).
     * @param statement - Declaration (name required) vs expression.
     * @param isAsync - Whether an `async` prefix was consumed.
     */
    private parseFunction(start: number, statement: boolean, isAsync: boolean): FunctionExpression
    private parseFunction(
        start: number,
        statement: true,
        isAsync: boolean,
        nameOptional?: boolean,
    ): FunctionDeclaration
    private parseFunction(
        start: number,
        statement: boolean,
        isAsync: boolean,
        nameOptional = false,
    ): FunctionExpression | FunctionDeclaration {
        this.expectName('function')
        const generator = this.eatPunct('*')
        let id: Identifier | null = null
        if (!this.isPunct('(')) {
            id = this.parseIdentifier()
            this.checkStrictName(id)
        } else if (statement && !nameOptional) {
            this.unexpected('function name required')
        }
        const saved = this.ctx
        const savedStrict = this.strict
        this.ctx = {
            inGenerator: generator,
            inAsync: isAsync,
            allowNewTarget: true,
            allowSuperProperty: false,
            allowSuperCall: false,
            inFunction: true,
            labels: [],
            loops: 0,
            switches: 0,
        }
        const params = this.parseParams()
        const body = this.parseBlockBody(true)
        this.ctx = saved
        this.strict = savedStrict
        const common = { id, params, body, generator, async: isAsync, start, end: this.prevEnd }
        return statement
            ? { type: 'FunctionDeclaration', ...common }
            : { type: 'FunctionExpression', ...common }
    }

    /** Parses a method's `(params) { body }`; the current token is `(`. */
    private parseMethod(
        isGenerator: boolean,
        isAsync: boolean,
        allowSuperCall: boolean,
    ): FunctionExpression {
        const start = this.tok.start
        const saved = this.ctx
        const savedStrict = this.strict
        this.ctx = {
            inGenerator: isGenerator,
            inAsync: isAsync,
            allowNewTarget: true,
            allowSuperProperty: true,
            allowSuperCall,
            inFunction: true,
            labels: [],
            loops: 0,
            switches: 0,
        }
        const params = this.parseParams()
        const body = this.parseBlockBody(true)
        this.ctx = saved
        this.strict = savedStrict
        return {
            type: 'FunctionExpression',
            id: null,
            params,
            body,
            generator: isGenerator,
            async: isAsync,
            start,
            end: this.prevEnd,
        }
    }

    private parseParams(): Pattern[] {
        this.expectPunct('(')
        const params: Pattern[] = []
        while (!this.isPunct(')')) {
            if (params.length > 0) {
                this.expectPunct(',')
                if (this.isPunct(')')) {
                    break
                }
            }
            if (this.isPunct('...')) {
                const start = this.tok.start
                this.advance()
                const argument = this.parseBindingAtom()
                params.push({ type: 'RestElement', argument, start, end: this.prevEnd })
                if (!this.isPunct(')')) {
                    this.unexpected('rest parameter must be last')
                }
                break
            }
            params.push(this.parseBindingElement())
        }
        this.expectPunct(')')
        return params
    }

    // ---- Binding patterns ----

    private parseBindingElement(): Pattern {
        const start = this.tok.start
        const left = this.parseBindingAtom()
        if (this.eatPunct('=')) {
            const right = this.parseMaybeAssign(false, null)
            return { type: 'AssignmentPattern', left, right, start, end: this.prevEnd }
        }
        return left
    }

    private parseBindingAtom(): Pattern {
        const t = this.tok
        if (t.type === 'punct' && t.value === '[') {
            this.advance()
            const elements: (Pattern | null)[] = []
            while (!this.isPunct(']')) {
                if (this.eatPunct(',')) {
                    elements.push(null)
                    continue
                }
                if (this.isPunct('...')) {
                    const start = this.tok.start
                    this.advance()
                    const argument = this.parseBindingAtom()
                    elements.push({ type: 'RestElement', argument, start, end: this.prevEnd })
                    if (!this.isPunct(']')) {
                        this.unexpected('rest element must be last')
                    }
                    break
                }
                elements.push(this.parseBindingElement())
                if (!this.isPunct(']')) {
                    this.expectPunct(',')
                }
            }
            this.expectPunct(']')
            return { type: 'ArrayPattern', elements, start: t.start, end: this.prevEnd }
        }
        if (t.type === 'punct' && t.value === '{') {
            this.advance()
            const properties: (Property | Extract<Pattern, { type: 'RestElement' }>)[] = []
            while (!this.isPunct('}')) {
                if (properties.length > 0) {
                    this.expectPunct(',')
                    if (this.isPunct('}')) {
                        break
                    }
                }
                if (this.isPunct('...')) {
                    const start = this.tok.start
                    this.advance()
                    const argument = this.parseIdentifier()
                    properties.push({ type: 'RestElement', argument, start, end: this.prevEnd })
                    if (!this.isPunct('}')) {
                        this.unexpected('rest element must be last')
                    }
                    break
                }
                properties.push(this.parseBindingProperty())
            }
            this.expectPunct('}')
            return { type: 'ObjectPattern', properties, start: t.start, end: this.prevEnd }
        }
        const id = this.parseIdentifier()
        this.checkStrictName(id)
        return id
    }

    /** In strict mode code `eval` and `arguments` can be neither bound nor assigned. */
    private checkStrictName(id: Identifier): void {
        if (this.strict && (id.name === 'eval' || id.name === 'arguments')) {
            throw new ParseError(`cannot bind or assign "${id.name}" in strict mode`, id.start)
        }
    }

    private parseBindingProperty(): Property {
        const start = this.tok.start
        const keyToken = this.tok
        const { key, computed } = this.parsePropertyName(false)
        if (this.eatPunct(':')) {
            const value = this.parseBindingElement()
            return {
                type: 'Property',
                key,
                value,
                kind: 'init',
                method: false,
                shorthand: false,
                computed,
                start,
                end: this.prevEnd,
            }
        }
        if (
            computed ||
            key.type !== 'Identifier' ||
            keyToken.type !== 'name' ||
            this.isReserved(key.name)
        ) {
            return this.unexpected('expected ":"')
        }
        const local: Identifier = { ...key }
        let value: Pattern = local
        if (this.eatPunct('=')) {
            const right = this.parseMaybeAssign(false, null)
            value = { type: 'AssignmentPattern', left: local, right, start, end: this.prevEnd }
        }
        return {
            type: 'Property',
            key,
            value,
            kind: 'init',
            method: false,
            shorthand: true,
            computed: false,
            start,
            end: this.prevEnd,
        }
    }

    // ---- Array and object literals ----

    private parseArray(cover: Cover | null): Expression {
        const start = this.tok.start
        this.advance()
        const elements: (Expression | SpreadElement | null)[] = []
        while (!this.isPunct(']')) {
            if (this.eatPunct(',')) {
                elements.push(null)
                continue
            }
            elements.push(this.parseListElement(cover))
            if (!this.isPunct(']')) {
                this.expectPunct(',')
            }
        }
        this.expectPunct(']')
        return { type: 'ArrayExpression', elements, start, end: this.prevEnd }
    }

    private parsePropertyName(allowPrivate: false): { key: Expression; computed: boolean }
    private parsePropertyName(allowPrivate: boolean): { key: PropertyKey; computed: boolean }
    private parsePropertyName(allowPrivate: boolean): { key: PropertyKey; computed: boolean } {
        const t = this.tok
        switch (t.type) {
            case 'punct':
                if (t.value === '[') {
                    this.advance()
                    const key = this.parseMaybeAssign(false, null)
                    this.expectPunct(']')
                    return { key, computed: true }
                }
                break
            case 'string':
                this.advance()
                return {
                    key: {
                        type: 'Literal',
                        value: t.value,
                        raw: this.code.slice(t.start, t.end),
                        start: t.start,
                        end: t.end,
                    },
                    computed: false,
                }
            case 'num':
                this.advance()
                return {
                    key: {
                        type: 'Literal',
                        value: t.num,
                        raw: this.code.slice(t.start, t.end),
                        start: t.start,
                        end: t.end,
                    },
                    computed: false,
                }
            case 'bigint':
                this.advance()
                return {
                    key: {
                        type: 'Literal',
                        value: t.big,
                        raw: this.code.slice(t.start, t.end),
                        bigint: t.big.toString(),
                        start: t.start,
                        end: t.end,
                    },
                    computed: false,
                }
            case 'name':
                this.advance()
                return {
                    key: { type: 'Identifier', name: t.value, start: t.start, end: t.end },
                    computed: false,
                }
            case 'private':
                if (allowPrivate) {
                    if (t.value === 'constructor') {
                        throw new ParseError(
                            "classes may not have a private field named '#constructor'",
                            t.start,
                        )
                    }
                    this.advance()
                    return {
                        key: {
                            type: 'PrivateIdentifier',
                            name: t.value,
                            start: t.start,
                            end: t.end,
                        },
                        computed: false,
                    }
                }
                break
            case 'regex':
            case 'template':
            case 'eof':
                break
        }
        return this.unexpected('expected property name')
    }

    /** True when the current token ends a property name that was really a modifier-looking key. */
    private isKeyTerminator(): boolean {
        const t = this.tok
        return (
            t.type === 'eof' ||
            (t.type === 'punct' &&
                (t.value === ',' ||
                    t.value === ':' ||
                    t.value === '(' ||
                    t.value === '}' ||
                    t.value === '=' ||
                    t.value === ';'))
        )
    }

    private parseObject(cover: Cover | null): Expression {
        const start = this.tok.start
        this.advance()
        const properties: (Property | SpreadElement)[] = []
        while (!this.isPunct('}')) {
            if (properties.length > 0) {
                this.expectPunct(',')
                if (this.isPunct('}')) {
                    break
                }
            }
            properties.push(this.parseObjectMember(cover))
        }
        this.expectPunct('}')
        return { type: 'ObjectExpression', properties, start, end: this.prevEnd }
    }

    private parseObjectMember(cover: Cover | null): Property | SpreadElement {
        if (this.isPunct('...')) {
            const spreadStart = this.tok.start
            this.advance()
            const argument = this.parseMaybeAssign(false, cover)
            const spread: SpreadElement = {
                type: 'SpreadElement',
                argument,
                start: spreadStart,
                end: this.prevEnd,
            }
            if (this.isPunct(',')) {
                this.spreadWithComma.add(spread)
            }
            return spread
        }
        const start = this.tok.start
        let isAsync = false
        let isGenerator = false
        let kind: 'init' | 'get' | 'set' = 'init'
        if (this.eatPunct('*')) {
            isGenerator = true
        }
        let name = this.parsePropertyName(false)
        const modifier = this.modifierOf(name)
        if (!isGenerator && modifier === 'async' && !this.isKeyTerminator() && !this.tok.nlBefore) {
            isAsync = true
            isGenerator = this.eatPunct('*')
            name = this.parsePropertyName(false)
        } else if (
            !isGenerator &&
            (modifier === 'get' || modifier === 'set') &&
            !this.isKeyTerminator()
        ) {
            kind = modifier
            name = this.parsePropertyName(false)
        }
        const { key, computed } = name
        if (this.isPunct('(')) {
            const value = this.parseMethod(isGenerator, isAsync, false)
            if (kind === 'get' && value.params.length !== 0) {
                throw new ParseError('getter must not have parameters', value.start)
            }
            if (
                kind === 'set' &&
                (value.params.length !== 1 || value.params[0]?.type === 'RestElement')
            ) {
                throw new ParseError('setter must have exactly one parameter', value.start)
            }
            return {
                type: 'Property',
                key,
                value,
                kind,
                method: kind === 'init',
                shorthand: false,
                computed,
                start,
                end: this.prevEnd,
            }
        }
        if (isAsync || isGenerator || kind !== 'init') {
            return this.unexpected('expected "("')
        }
        if (this.eatPunct(':')) {
            const value = this.parseMaybeAssign(false, cover)
            return {
                type: 'Property',
                key,
                value,
                kind: 'init',
                method: false,
                shorthand: false,
                computed,
                start,
                end: this.prevEnd,
            }
        }
        if (computed || key.type !== 'Identifier' || this.isReserved(key.name)) {
            return this.unexpected('expected ":"')
        }
        const local: Identifier = { ...key }
        if (this.isPunct('=')) {
            if (cover !== null && cover.shorthandAssign === -1) {
                cover.shorthandAssign = this.tok.start
            } else if (cover === null) {
                throw new ParseError('invalid shorthand property initializer', this.tok.start)
            }
            this.advance()
            const right = this.parseMaybeAssign(false, null)
            const value: Pattern = {
                type: 'AssignmentPattern',
                left: local,
                right,
                start,
                end: this.prevEnd,
            }
            return {
                type: 'Property',
                key,
                value,
                kind: 'init',
                method: false,
                shorthand: true,
                computed: false,
                start,
                end: this.prevEnd,
            }
        }
        return {
            type: 'Property',
            key,
            value: local,
            kind: 'init',
            method: false,
            shorthand: true,
            computed: false,
            start,
            end: this.prevEnd,
        }
    }

    /** The `async`/`get`/`set` word a plain (unescaped, non-computed) key may be acting as. */
    private modifierOf(name: {
        key: PropertyKey
        computed: boolean
    }): 'async' | 'get' | 'set' | null {
        const key = name.key
        if (name.computed || key.type !== 'Identifier') {
            return null
        }
        if (key.name !== 'async' && key.name !== 'get' && key.name !== 'set') {
            return null
        }
        return this.code.slice(key.start, key.end) === key.name ? key.name : null
    }

    // ---- Templates ----

    private parseTemplate(tagged: boolean): TemplateLiteral {
        const quasis: TemplateElement[] = []
        const expressions: Expression[] = []
        const start = this.tok.start
        let t = this.tok
        for (;;) {
            if (t.cooked === null && !tagged) {
                throw new ParseError('invalid escape sequence in template', t.start)
            }
            quasis.push({
                type: 'TemplateElement',
                value: { raw: t.value, cooked: t.cooked },
                tail: t.tail,
                start: t.start + 1,
                end: t.end - (t.tail ? 1 : 2),
            })
            if (t.tail) {
                this.advance()
                break
            }
            this.advance()
            expressions.push(this.parseExpression(false))
            const close = this.tok
            if (close.type !== 'punct' || close.value !== '}') {
                this.unexpected('expected "}" to end template substitution')
            }
            t = this.lexer.readTemplateContinuation(close.start)
            this.tok = t
        }
        return { type: 'TemplateLiteral', quasis, expressions, start, end: this.prevEnd }
    }

    // ---- Classes ----

    /**
     * Parses a class with the current token at `class`.
     * @param start - Start offset of the class.
     * @param statement - Declaration (name required) vs expression.
     */
    private parseClass(start: number, statement: boolean): ClassExpression
    private parseClass(start: number, statement: true, nameOptional?: boolean): ClassDeclaration
    private parseClass(
        start: number,
        statement: boolean,
        nameOptional = false,
    ): ClassExpression | ClassDeclaration {
        this.expectName('class')
        // All parts of a class, its name and heritage included, are strict mode code.
        const savedStrict = this.strict
        this.strict = true
        let id: Identifier | null = null
        if (this.tok.type === 'name' && !this.isName('extends')) {
            id = this.parseIdentifier()
        } else if (statement && !nameOptional) {
            this.unexpected('class name required')
        }
        let superClass: Expression | null = null
        if (this.eatName('extends')) {
            const superStart = this.tok.start
            superClass = this.parseSubscripts(this.parseExprAtom(null), superStart, false)
        }
        const body = this.parseClassBody(superClass !== null)
        this.strict = savedStrict
        return statement
            ? { type: 'ClassDeclaration', id, superClass, body, start, end: this.prevEnd }
            : { type: 'ClassExpression', id, superClass, body, start, end: this.prevEnd }
    }

    private parseClassBody(hasSuper: boolean): ClassBody {
        const start = this.tok.start
        this.expectPunct('{')
        const body: ClassBody['body'] = []
        let hasConstructor = false
        while (!this.isPunct('}')) {
            if (this.eatPunct(';')) {
                continue
            }
            const element = this.parseClassElement(hasSuper)
            if (element.type === 'MethodDefinition' && element.kind === 'constructor') {
                if (hasConstructor) {
                    throw new ParseError(
                        'duplicate constructor in the same class',
                        element.key.start,
                    )
                }
                hasConstructor = true
            }
            body.push(element)
        }
        this.expectPunct('}')
        return { type: 'ClassBody', body, start, end: this.prevEnd }
    }

    private parseClassElement(
        hasSuper: boolean,
    ): MethodDefinition | PropertyDefinition | StaticBlock {
        const start = this.tok.start
        let isStatic = false
        let isAsync = false
        let isGenerator = false
        let kind: 'method' | 'get' | 'set' = 'method'
        if (this.isName('static')) {
            const next = this.peek()
            if (next.type === 'punct' && next.value === '{') {
                return this.parseStaticBlock(start)
            }
            const isKey =
                next.type === 'eof' ||
                (next.type === 'punct' &&
                    (next.value === '(' ||
                        next.value === '=' ||
                        next.value === ';' ||
                        next.value === '}'))
            if (!isKey) {
                isStatic = true
                this.advance()
            }
        }
        if (this.isName('async')) {
            const next = this.peek()
            const isKey =
                next.type === 'eof' ||
                next.nlBefore ||
                (next.type === 'punct' &&
                    (next.value === '(' ||
                        next.value === '=' ||
                        next.value === ';' ||
                        next.value === '}'))
            if (!isKey) {
                isAsync = true
                this.advance()
            }
        }
        if (this.eatPunct('*')) {
            isGenerator = true
        }
        let name = this.parsePropertyName(true)
        const modifier = this.modifierOf(name)
        if (
            !isAsync &&
            !isGenerator &&
            (modifier === 'get' || modifier === 'set') &&
            !this.isKeyTerminator()
        ) {
            kind = modifier
            name = this.parsePropertyName(true)
        }
        const { key, computed } = name
        if (this.isPunct('(')) {
            const isConstructor =
                !isStatic &&
                !computed &&
                ((key.type === 'Identifier' && key.name === 'constructor') ||
                    (key.type === 'Literal' && key.value === 'constructor'))
            if (isConstructor && (kind !== 'method' || isAsync || isGenerator)) {
                throw new ParseError(
                    'constructor may not be an accessor, generator or async',
                    key.start,
                )
            }
            const value = this.parseMethod(isGenerator, isAsync, isConstructor && hasSuper)
            if (kind === 'get' && value.params.length !== 0) {
                throw new ParseError('getter must not have parameters', value.start)
            }
            if (
                kind === 'set' &&
                (value.params.length !== 1 || value.params[0]?.type === 'RestElement')
            ) {
                throw new ParseError('setter must have exactly one parameter', value.start)
            }
            return {
                type: 'MethodDefinition',
                key,
                value,
                kind: isConstructor ? 'constructor' : kind,
                computed,
                static: isStatic,
                start,
                end: this.prevEnd,
            }
        }
        if (isAsync || isGenerator || kind !== 'method') {
            return this.unexpected('expected "("')
        }
        let value: Expression | null = null
        if (this.eatPunct('=')) {
            const saved = this.ctx
            this.ctx = {
                inGenerator: false,
                inAsync: false,
                allowNewTarget: true,
                allowSuperProperty: true,
                allowSuperCall: false,
                inFunction: false,
                labels: [],
                loops: 0,
                switches: 0,
            }
            value = this.parseMaybeAssign(false, null)
            this.ctx = saved
        }
        this.semicolon()
        return {
            type: 'PropertyDefinition',
            key,
            value,
            computed,
            static: isStatic,
            start,
            end: this.prevEnd,
        }
    }

    private parseStaticBlock(start: number): StaticBlock {
        this.advance()
        this.expectPunct('{')
        const saved = this.ctx
        this.ctx = {
            inGenerator: false,
            inAsync: false,
            allowNewTarget: true,
            allowSuperProperty: true,
            allowSuperCall: false,
            inFunction: false,
            labels: [],
            loops: 0,
            switches: 0,
        }
        const body: Statement[] = []
        while (!this.isPunct('}')) {
            if (this.isEof()) {
                this.unexpected()
            }
            body.push(this.parseStatement('list'))
        }
        this.ctx = saved
        this.expectPunct('}')
        return { type: 'StaticBlock', body, start, end: this.prevEnd }
    }
}

/**
 * Parses JavaScript source into an ESTree `Program`.
 *
 * The source type is detected: a file using `import`/`export`/`import.meta` or a top-level `await`
 * is parsed as a module (strict mode, `sourceType: 'module'`); anything else is a sloppy-mode
 * script. A script that uses `await` as a plain identifier at the top level is read as a module
 * when that parses, since top-level `await` is by far the likelier intent. A leading `#!` line is
 * kept in `Program.hashbang`.
 * @param code - Source text.
 * @returns The program AST.
 * @throws {ParseError} On a syntax error, with the offending source offset.
 */
export function parse(code: string): Program {
    const program = parseSource(code)
    const hashbang = /^#!.*/.exec(code)
    if (hashbang !== null) {
        program.hashbang = hashbang[0]
    }
    return program
}

/** Parses the source as a script, or as a module when it needs to be one (see {@link parse}). */
function parseSource(code: string): Program {
    const script = new Parser(code, false)
    let program: Program
    try {
        program = script.parseProgram()
    } catch (error) {
        if (!(error instanceof ParseError)) {
            throw error
        }
        // Not a valid script: it may be a module (top-level `await`, `for await`, ...).
        try {
            return new Parser(code, true).parseProgram()
        } catch (moduleError) {
            if (
                moduleError instanceof ParseError &&
                (script.sawModule || moduleError.offset >= error.offset)
            ) {
                throw moduleError
            }
            throw error
        }
    }
    if (!script.sawModule && !script.sawTopLevelAwait) {
        return program
    }
    try {
        return new Parser(code, true).parseProgram()
    } catch (error) {
        if (script.sawModule || !(error instanceof ParseError)) {
            throw error
        }
        return program
    }
}
