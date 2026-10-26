import type {
    ArrowFunctionExpression,
    AssignmentOperator,
    BinaryOperator,
    BlockStatement,
    ClassBody,
    ClassDeclaration,
    ClassExpression,
    Expression,
    FunctionDeclaration,
    FunctionExpression,
    Identifier,
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
    TemplateElement,
    TemplateLiteral,
    UnaryOperator,
} from './ast.js'
import { Lexer, ParseError, type LexToken } from './lexer.js'

export { ParseError } from './lexer.js'

/** Tracks a `{a = 1}` shorthand-with-initializer, legal only if the literal is later reinterpreted as a pattern. */
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
}

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

const reservedWords: ReadonlySet<string> = new Set([
    'break',
    'case',
    'catch',
    'class',
    'const',
    'continue',
    'debugger',
    'default',
    'delete',
    'do',
    'else',
    'enum',
    'export',
    'extends',
    'false',
    'finally',
    'for',
    'function',
    'if',
    'import',
    'in',
    'instanceof',
    'new',
    'null',
    'return',
    'super',
    'switch',
    'this',
    'throw',
    'true',
    'try',
    'typeof',
    'var',
    'void',
    'while',
    'with',
])

/** Words that start a statement the expression-only parser cannot handle yet. */
const statementKeywords: ReadonlySet<string> = new Set([
    'var',
    'const',
    'if',
    'for',
    'while',
    'do',
    'return',
    'break',
    'continue',
    'switch',
    'throw',
    'try',
    'function',
    'class',
    'with',
    'debugger',
    'export',
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

/** Parser state and grammar. Task 2 extends this with statements, classes' bodies, modules and ASI. */
class Parser {
    private readonly code: string
    private readonly lexer: Lexer
    private tok: LexToken
    private prevEnd = 0
    private ctx: FnContext = {
        inGenerator: false,
        inAsync: false,
        allowNewTarget: false,
        allowSuperProperty: false,
        allowSuperCall: false,
    }
    /** Start offset at which an arrow function may begin (set by every assignment-expression parse). */
    private arrowStart = -1
    private readonly parenthesized = new Set<Node>()
    /** Spread elements followed by a comma, which can never be rest elements. */
    private readonly spreadWithComma = new Set<Node>()

    constructor(code: string) {
        this.code = code
        this.lexer = new Lexer(code)
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
            (name === 'await' && this.ctx.inAsync)
        )
    }

    // ---- Program and statements ----

    parseProgram(): Program {
        const body = this.parseStatementList(() => this.isEof())
        return { type: 'Program', body, sourceType: 'script', start: 0, end: this.code.length }
    }

    /** Parses statements (with a directive prologue) until `atEnd` reports the terminator. */
    private parseStatementList(atEnd: () => boolean): Statement[] {
        const body: Statement[] = []
        let inPrologue = true
        while (!atEnd()) {
            const statement = this.parseStatement()
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
                } else {
                    inPrologue = false
                }
            }
            body.push(statement)
        }
        return body
    }

    /**
     * Statement hook. Task 1 supports expression statements and `;`; every other statement form throws
     * `ParseError('unsupported', offset)` until the statement parser lands.
     */
    private parseStatement(): Statement {
        const t = this.tok
        if (t.type === 'punct') {
            if (t.value === ';') {
                this.advance()
                return { type: 'EmptyStatement', start: t.start, end: this.prevEnd }
            }
            if (t.value === '{') {
                throw new ParseError('unsupported', t.start)
            }
        } else if (t.type === 'name' && !t.escaped) {
            if (statementKeywords.has(t.value)) {
                throw new ParseError('unsupported', t.start)
            }
            const next = this.peek()
            if (
                t.value === 'async' &&
                next.type === 'name' &&
                next.value === 'function' &&
                !next.nlBefore
            ) {
                throw new ParseError('unsupported', t.start)
            }
            if (t.value === 'let' && this.letStartsDeclaration(next)) {
                throw new ParseError('unsupported', t.start)
            }
            if (
                t.value === 'import' &&
                !(next.type === 'punct' && (next.value === '(' || next.value === '.'))
            ) {
                throw new ParseError('unsupported', t.start)
            }
            if (next.type === 'punct' && next.value === ':' && !this.isReserved(t.value)) {
                throw new ParseError('unsupported', t.start)
            }
        }
        const expression = this.parseExpression(false)
        this.semicolon()
        return { type: 'ExpressionStatement', expression, start: t.start, end: this.prevEnd }
    }

    private letStartsDeclaration(next: LexToken): boolean {
        if (next.type === 'name') {
            return next.value !== 'in' && next.value !== 'instanceof'
        }
        return next.type === 'punct' && (next.value === '[' || next.value === '{')
    }

    /** Consumes a statement terminator: `;`, or nothing when ASI applies (newline, `}` or end of input). */
    private semicolon(): void {
        if (this.eatPunct(';')) {
            return
        }
        if (this.isEof() || this.isPunct('}') || this.tok.nlBefore) {
            return
        }
        this.unexpected('expected ";"')
    }

    private parseBlockBody(): BlockStatement {
        const start = this.tok.start
        this.expectPunct('{')
        const body = this.parseStatementList(() => this.isPunct('}') || this.isEof())
        this.expectPunct('}')
        return { type: 'BlockStatement', body, start, end: this.prevEnd }
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
        return this.parseSubscripts(expr, start, false)
    }

    /** Like {@link Parser.parseExprAtom} but also yields a `Super` node (always followed by a subscript). */
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
        if (node.type === 'Identifier' || node.type === 'MemberExpression') {
            return node
        }
        throw new ParseError('invalid assignment target', node.start)
    }

    /**
     * Reinterprets an expression as an assignment target (`binding` false) or a binding pattern (arrow
     * parameters, `binding` true). Already-converted patterns pass through (verified when `binding`).
     * Throws `ParseError('invalid assignment target')` when impossible.
     */
    private toAssignable(node: Expression | SpreadElement | Pattern, binding: boolean): Pattern {
        const parenthesized = this.parenthesized.has(node)
        switch (node.type) {
            case 'Identifier':
                if (binding && parenthesized) {
                    break
                }
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

    /** Throws if an already-converted pattern contains a member expression or a parenthesized target. */
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
        let value: RegExp | null
        try {
            value = new RegExp(t.value, t.flags)
        } catch {
            value = null
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
        this.advance()
        return { type: 'Identifier', name: t.value, start: t.start, end: t.end }
    }

    private parseImportAtom(): Expression {
        const start = this.tok.start
        this.advance()
        if (this.eatPunct('.')) {
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
        this.expectPunct('=>')
        const saved = this.ctx
        this.ctx = { ...saved, inGenerator: false, inAsync: isAsync }
        let body: BlockStatement | Expression
        let expression: boolean
        if (this.isPunct('{')) {
            body = this.parseBlockBody()
            expression = false
        } else {
            body = this.parseMaybeAssign(false, null)
            expression = true
        }
        this.ctx = saved
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
    private parseFunction(start: number, statement: true, isAsync: boolean): FunctionDeclaration
    private parseFunction(
        start: number,
        statement: boolean,
        isAsync: boolean,
    ): FunctionExpression | FunctionDeclaration {
        this.expectName('function')
        const generator = this.eatPunct('*')
        let id: Identifier | null = null
        if (!this.isPunct('(')) {
            id = this.parseIdentifier()
        } else if (statement) {
            this.unexpected('function name required')
        }
        const saved = this.ctx
        this.ctx = {
            inGenerator: generator,
            inAsync: isAsync,
            allowNewTarget: true,
            allowSuperProperty: false,
            allowSuperCall: false,
        }
        const params = this.parseParams()
        const body = this.parseBlockBody()
        this.ctx = saved
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
        this.ctx = {
            inGenerator: isGenerator,
            inAsync: isAsync,
            allowNewTarget: true,
            allowSuperProperty: true,
            allowSuperCall,
        }
        const params = this.parseParams()
        const body = this.parseBlockBody()
        this.ctx = saved
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
        return this.parseIdentifier()
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
    private parseClass(start: number, statement: true): ClassDeclaration
    private parseClass(start: number, statement: boolean): ClassExpression | ClassDeclaration {
        this.expectName('class')
        let id: Identifier | null = null
        if (this.tok.type === 'name' && !this.isName('extends')) {
            id = this.parseIdentifier()
        } else if (statement) {
            this.unexpected('class name required')
        }
        let superClass: Expression | null = null
        if (this.eatName('extends')) {
            const superStart = this.tok.start
            superClass = this.parseSubscripts(this.parseExprAtom(null), superStart, false)
        }
        const body = this.parseClassBody(superClass !== null)
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
        }
        const body: Statement[] = []
        while (!this.isPunct('}')) {
            if (this.isEof()) {
                this.unexpected()
            }
            body.push(this.parseStatement())
        }
        this.ctx = saved
        this.expectPunct('}')
        return { type: 'StaticBlock', body, start, end: this.prevEnd }
    }
}

/**
 * Parses JavaScript source into an ESTree `Program`.
 * Task 1 scope: expression statements only; any other statement throws `ParseError('unsupported', offset)`.
 * @param code - Source text.
 * @returns The program AST (`sourceType: 'script'`).
 * @throws {ParseError} On a syntax error, with the offending source offset.
 */
export function parse(code: string): Program {
    return new Parser(code).parseProgram()
}
