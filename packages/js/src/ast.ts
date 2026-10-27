/**
 * ESTree node types (acorn-compatible names and fields) for the parser-based minifier.
 * Every node carries `start`/`end` source offsets. `Statement` here also covers declarations and module
 * declarations, so `Program.body` is a plain `Statement[]`.
 */

export interface BaseNode {
    start: number
    end: number
}

export type UnaryOperator = '-' | '+' | '!' | '~' | 'typeof' | 'void' | 'delete'
export type UpdateOperator = '++' | '--'
export type LogicalOperator = '&&' | '||' | '??'
export type BinaryOperator =
    | '=='
    | '!='
    | '==='
    | '!=='
    | '<'
    | '<='
    | '>'
    | '>='
    | '<<'
    | '>>'
    | '>>>'
    | '+'
    | '-'
    | '*'
    | '/'
    | '%'
    | '**'
    | '|'
    | '^'
    | '&'
    | 'in'
    | 'instanceof'
export type AssignmentOperator =
    | '='
    | '+='
    | '-='
    | '*='
    | '/='
    | '%='
    | '**='
    | '<<='
    | '>>='
    | '>>>='
    | '|='
    | '^='
    | '&='
    | '&&='
    | '||='
    | '??='

// ---- Program ----

export interface Program extends BaseNode {
    type: 'Program'
    body: Statement[]
    sourceType: 'module' | 'script'
    /** The leading `#!` line without its line terminator, set only when the source has one. */
    hashbang?: string
}

// ---- Leaves ----

export interface Identifier extends BaseNode {
    type: 'Identifier'
    name: string
}

export interface PrivateIdentifier extends BaseNode {
    type: 'PrivateIdentifier'
    name: string
}

export interface SimpleLiteral extends BaseNode {
    type: 'Literal'
    value: string | number | boolean | null
    raw: string
}

export interface RegExpLiteral extends BaseNode {
    type: 'Literal'
    /** `null` when the host engine rejects the pattern or flags. */
    value: RegExp | null
    raw: string
    regex: { pattern: string; flags: string }
}

export interface BigIntLiteral extends BaseNode {
    type: 'Literal'
    value: bigint
    raw: string
    /** The value in decimal digits (e.g. `255` for `0xFFn`). */
    bigint: string
}

export type Literal = SimpleLiteral | RegExpLiteral | BigIntLiteral

export interface ThisExpression extends BaseNode {
    type: 'ThisExpression'
}

export interface Super extends BaseNode {
    type: 'Super'
}

// ---- Expressions ----

export interface ArrayExpression extends BaseNode {
    type: 'ArrayExpression'
    elements: (Expression | SpreadElement | null)[]
}

export interface ObjectExpression extends BaseNode {
    type: 'ObjectExpression'
    properties: (Property | SpreadElement)[]
}

export interface Property extends BaseNode {
    type: 'Property'
    key: Expression
    value: Expression | Pattern
    kind: 'init' | 'get' | 'set'
    method: boolean
    shorthand: boolean
    computed: boolean
}

export interface SpreadElement extends BaseNode {
    type: 'SpreadElement'
    argument: Expression
}

export interface FunctionExpression extends BaseNode {
    type: 'FunctionExpression'
    id: Identifier | null
    params: Pattern[]
    body: BlockStatement
    generator: boolean
    async: boolean
}

export interface ArrowFunctionExpression extends BaseNode {
    type: 'ArrowFunctionExpression'
    id: null
    params: Pattern[]
    body: BlockStatement | Expression
    expression: boolean
    generator: false
    async: boolean
}

export interface ClassExpression extends BaseNode {
    type: 'ClassExpression'
    id: Identifier | null
    superClass: Expression | null
    body: ClassBody
}

export interface TemplateLiteral extends BaseNode {
    type: 'TemplateLiteral'
    quasis: TemplateElement[]
    expressions: Expression[]
}

export interface TemplateElement extends BaseNode {
    type: 'TemplateElement'
    value: { raw: string; cooked: string | null }
    tail: boolean
}

export interface TaggedTemplateExpression extends BaseNode {
    type: 'TaggedTemplateExpression'
    tag: Expression
    quasi: TemplateLiteral
}

export interface MemberExpression extends BaseNode {
    type: 'MemberExpression'
    object: Expression | Super
    property: Expression | PrivateIdentifier
    computed: boolean
    optional: boolean
}

export interface CallExpression extends BaseNode {
    type: 'CallExpression'
    callee: Expression | Super
    arguments: (Expression | SpreadElement)[]
    optional: boolean
}

export interface NewExpression extends BaseNode {
    type: 'NewExpression'
    callee: Expression
    arguments: (Expression | SpreadElement)[]
}

export interface ChainExpression extends BaseNode {
    type: 'ChainExpression'
    expression: CallExpression | MemberExpression
}

export interface ImportExpression extends BaseNode {
    type: 'ImportExpression'
    source: Expression
    options: Expression | null
}

export interface MetaProperty extends BaseNode {
    type: 'MetaProperty'
    meta: Identifier
    property: Identifier
}

export interface UnaryExpression extends BaseNode {
    type: 'UnaryExpression'
    operator: UnaryOperator
    prefix: true
    argument: Expression
}

export interface UpdateExpression extends BaseNode {
    type: 'UpdateExpression'
    operator: UpdateOperator
    prefix: boolean
    argument: Expression
}

export interface BinaryExpression extends BaseNode {
    type: 'BinaryExpression'
    operator: BinaryOperator
    /** A `PrivateIdentifier` only as the left side of `in` (`#x in obj`). */
    left: Expression | PrivateIdentifier
    right: Expression
}

export interface LogicalExpression extends BaseNode {
    type: 'LogicalExpression'
    operator: LogicalOperator
    left: Expression
    right: Expression
}

export interface ConditionalExpression extends BaseNode {
    type: 'ConditionalExpression'
    test: Expression
    consequent: Expression
    alternate: Expression
}

export interface AssignmentExpression extends BaseNode {
    type: 'AssignmentExpression'
    operator: AssignmentOperator
    left: Pattern
    right: Expression
}

export interface SequenceExpression extends BaseNode {
    type: 'SequenceExpression'
    expressions: Expression[]
}

export interface YieldExpression extends BaseNode {
    type: 'YieldExpression'
    argument: Expression | null
    delegate: boolean
}

export interface AwaitExpression extends BaseNode {
    type: 'AwaitExpression'
    argument: Expression
}

export type Expression =
    | Identifier
    | Literal
    | ThisExpression
    | ArrayExpression
    | ObjectExpression
    | FunctionExpression
    | ArrowFunctionExpression
    | ClassExpression
    | TemplateLiteral
    | TaggedTemplateExpression
    | MemberExpression
    | CallExpression
    | NewExpression
    | ChainExpression
    | ImportExpression
    | MetaProperty
    | UnaryExpression
    | UpdateExpression
    | BinaryExpression
    | LogicalExpression
    | ConditionalExpression
    | AssignmentExpression
    | SequenceExpression
    | YieldExpression
    | AwaitExpression

// ---- Patterns ----

export interface ObjectPattern extends BaseNode {
    type: 'ObjectPattern'
    properties: (Property | RestElement)[]
}

export interface ArrayPattern extends BaseNode {
    type: 'ArrayPattern'
    elements: (Pattern | null)[]
}

export interface RestElement extends BaseNode {
    type: 'RestElement'
    argument: Pattern
}

export interface AssignmentPattern extends BaseNode {
    type: 'AssignmentPattern'
    left: Pattern
    right: Expression
}

export type Pattern =
    Identifier | MemberExpression | ObjectPattern | ArrayPattern | RestElement | AssignmentPattern

// ---- Classes ----

export interface ClassBody extends BaseNode {
    type: 'ClassBody'
    body: (MethodDefinition | PropertyDefinition | StaticBlock)[]
}

export interface MethodDefinition extends BaseNode {
    type: 'MethodDefinition'
    key: Expression | PrivateIdentifier
    value: FunctionExpression
    kind: 'constructor' | 'method' | 'get' | 'set'
    computed: boolean
    static: boolean
}

export interface PropertyDefinition extends BaseNode {
    type: 'PropertyDefinition'
    key: Expression | PrivateIdentifier
    value: Expression | null
    computed: boolean
    static: boolean
}

export interface StaticBlock extends BaseNode {
    type: 'StaticBlock'
    body: Statement[]
}

// ---- Statements and declarations ----

export interface ExpressionStatement extends BaseNode {
    type: 'ExpressionStatement'
    expression: Expression
    /** Raw text between the quotes, set on directive-prologue statements only. */
    directive?: string
}

export interface BlockStatement extends BaseNode {
    type: 'BlockStatement'
    body: Statement[]
}

export interface EmptyStatement extends BaseNode {
    type: 'EmptyStatement'
}

export interface DebuggerStatement extends BaseNode {
    type: 'DebuggerStatement'
}

export interface WithStatement extends BaseNode {
    type: 'WithStatement'
    object: Expression
    body: Statement
}

export interface ReturnStatement extends BaseNode {
    type: 'ReturnStatement'
    argument: Expression | null
}

export interface LabeledStatement extends BaseNode {
    type: 'LabeledStatement'
    label: Identifier
    body: Statement
}

export interface BreakStatement extends BaseNode {
    type: 'BreakStatement'
    label: Identifier | null
}

export interface ContinueStatement extends BaseNode {
    type: 'ContinueStatement'
    label: Identifier | null
}

export interface IfStatement extends BaseNode {
    type: 'IfStatement'
    test: Expression
    consequent: Statement
    alternate: Statement | null
}

export interface SwitchCase extends BaseNode {
    type: 'SwitchCase'
    test: Expression | null
    consequent: Statement[]
}

export interface SwitchStatement extends BaseNode {
    type: 'SwitchStatement'
    discriminant: Expression
    cases: SwitchCase[]
}

export interface ThrowStatement extends BaseNode {
    type: 'ThrowStatement'
    argument: Expression
}

export interface CatchClause extends BaseNode {
    type: 'CatchClause'
    param: Pattern | null
    body: BlockStatement
}

export interface TryStatement extends BaseNode {
    type: 'TryStatement'
    block: BlockStatement
    handler: CatchClause | null
    finalizer: BlockStatement | null
}

export interface WhileStatement extends BaseNode {
    type: 'WhileStatement'
    test: Expression
    body: Statement
}

export interface DoWhileStatement extends BaseNode {
    type: 'DoWhileStatement'
    body: Statement
    test: Expression
}

export interface ForStatement extends BaseNode {
    type: 'ForStatement'
    init: VariableDeclaration | Expression | null
    test: Expression | null
    update: Expression | null
    body: Statement
}

export interface ForInStatement extends BaseNode {
    type: 'ForInStatement'
    left: VariableDeclaration | Pattern
    right: Expression
    body: Statement
}

export interface ForOfStatement extends BaseNode {
    type: 'ForOfStatement'
    left: VariableDeclaration | Pattern
    right: Expression
    body: Statement
    await: boolean
}

export interface VariableDeclarator extends BaseNode {
    type: 'VariableDeclarator'
    id: Pattern
    init: Expression | null
}

export interface VariableDeclaration extends BaseNode {
    type: 'VariableDeclaration'
    kind: 'var' | 'let' | 'const'
    declarations: VariableDeclarator[]
}

export interface FunctionDeclaration extends BaseNode {
    type: 'FunctionDeclaration'
    /** `null` only for `export default function () {}`. */
    id: Identifier | null
    params: Pattern[]
    body: BlockStatement
    generator: boolean
    async: boolean
}

export interface ClassDeclaration extends BaseNode {
    type: 'ClassDeclaration'
    /** `null` only for `export default class {}`. */
    id: Identifier | null
    superClass: Expression | null
    body: ClassBody
}

// ---- Modules ----

export interface ImportAttribute extends BaseNode {
    type: 'ImportAttribute'
    key: Identifier | Literal
    value: Literal
}

export interface ImportSpecifier extends BaseNode {
    type: 'ImportSpecifier'
    imported: Identifier | Literal
    local: Identifier
}

export interface ImportDefaultSpecifier extends BaseNode {
    type: 'ImportDefaultSpecifier'
    local: Identifier
}

export interface ImportNamespaceSpecifier extends BaseNode {
    type: 'ImportNamespaceSpecifier'
    local: Identifier
}

export interface ImportDeclaration extends BaseNode {
    type: 'ImportDeclaration'
    specifiers: (ImportSpecifier | ImportDefaultSpecifier | ImportNamespaceSpecifier)[]
    source: Literal
    attributes: ImportAttribute[]
}

export interface ExportSpecifier extends BaseNode {
    type: 'ExportSpecifier'
    local: Identifier | Literal
    exported: Identifier | Literal
}

export interface ExportNamedDeclaration extends BaseNode {
    type: 'ExportNamedDeclaration'
    declaration: FunctionDeclaration | ClassDeclaration | VariableDeclaration | null
    specifiers: ExportSpecifier[]
    source: Literal | null
    attributes: ImportAttribute[]
}

export interface ExportDefaultDeclaration extends BaseNode {
    type: 'ExportDefaultDeclaration'
    declaration: FunctionDeclaration | ClassDeclaration | Expression
}

export interface ExportAllDeclaration extends BaseNode {
    type: 'ExportAllDeclaration'
    exported: Identifier | Literal | null
    source: Literal
    attributes: ImportAttribute[]
}

export type Statement =
    | ExpressionStatement
    | BlockStatement
    | EmptyStatement
    | DebuggerStatement
    | WithStatement
    | ReturnStatement
    | LabeledStatement
    | BreakStatement
    | ContinueStatement
    | IfStatement
    | SwitchStatement
    | ThrowStatement
    | TryStatement
    | WhileStatement
    | DoWhileStatement
    | ForStatement
    | ForInStatement
    | ForOfStatement
    | VariableDeclaration
    | FunctionDeclaration
    | ClassDeclaration
    | ImportDeclaration
    | ExportNamedDeclaration
    | ExportDefaultDeclaration
    | ExportAllDeclaration

export type Node =
    | Program
    | Statement
    | Expression
    | Pattern
    | PrivateIdentifier
    | Super
    | SpreadElement
    | Property
    | TemplateElement
    | ClassBody
    | MethodDefinition
    | PropertyDefinition
    | StaticBlock
    | SwitchCase
    | CatchClause
    | VariableDeclarator
    | ImportAttribute
    | ImportSpecifier
    | ImportDefaultSpecifier
    | ImportNamespaceSpecifier
    | ExportSpecifier
