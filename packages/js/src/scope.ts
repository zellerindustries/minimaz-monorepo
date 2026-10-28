import type {
    ArrowFunctionExpression,
    BlockStatement,
    ClassDeclaration,
    ClassExpression,
    Expression,
    FunctionDeclaration,
    FunctionExpression,
    Identifier,
    Literal,
    Node,
    Pattern,
    PrivateIdentifier,
    Program,
    SpreadElement,
    Statement,
    Super,
    VariableDeclaration,
} from './ast.js'

/*
 * Scope analysis for the renamer: which identifiers name the same variable, and which names are
 * free. The parser reports no early errors, so illegal redeclarations are detected here and thrown
 * as `ScopeError` (the minifier then falls back to the token minifier).
 *
 * Model decisions (each one keeps "same binding ⇒ same name" sufficient for a correct rename):
 * - A function with a non-simple parameter list gets a `params` scope (parameters, default
 *   expressions) and a `function` scope below it (body declarations), so defaults never see body
 *   declarations. A body `var`/function named like a parameter joins the parameter's binding: they
 *   are separate variables at run time but must keep one name to keep their relationship.
 * - A named function expression gets a `block` scope (node: the function) holding only its name.
 * - A class declaration is one binding in the enclosing scope: its inner and outer bindings share a
 *   single `id` node, so they can only ever have one name. A class expression name is bound in the
 *   `class` scope, which also holds the heritage and computed keys.
 * - A catch clause is a `catch` scope for the parameter (and its defaults/computed keys) with a
 *   `block` scope below it for the body, which the parameter's defaults cannot see.
 * - `for (let/const ...)` gets a `block` scope (node: the loop) that also covers the right-hand side
 *   of `for-in`/`for-of` (its TDZ) and the loop body.
 * - Class field initializers and static blocks get their own `function` scope.
 * - `arguments` resolves to an explicit binding when one is in reach before the nearest non-arrow
 *   function; otherwise it is the implicit arguments object, recorded as unresolved up to that
 *   function only. A function that `var`-declares `arguments` (whose value starts as the arguments
 *   object) is marked unsafe.
 * - A plain function declared in a block in sloppy code (Annex B) is a block binding plus, when the
 *   Annex B hoisting applies, a `var` binding in the enclosing var scope; every scope from the block
 *   up to that var scope is marked unsafe, since renaming anything there could add or remove the
 *   hoisting. A `var` that redeclares a catch parameter (also Annex B) likewise marks every scope
 *   from its position up to its var scope unsafe.
 * - A direct `eval(...)` (also `eval?.()`) or a `with` marks its scope, every ancestor and every
 *   descendant unsafe.
 */

export type BindingKind =
    'var' | 'let' | 'const' | 'function' | 'class' | 'param' | 'catch' | 'import'

export type ScopeKind = 'module' | 'script' | 'function' | 'block' | 'catch' | 'class' | 'params'

export interface Binding {
    name: string
    kind: BindingKind
    scope: Scope
    /** Declaration identifiers and every resolved reference; renaming means mutating these. */
    identifiers: Identifier[]
    exported: boolean
}

export interface Scope {
    kind: ScopeKind
    parent: Scope | null
    children: Scope[]
    bindings: Map<string, Binding>
    /**
     * Names referenced in this scope or any descendant that resolve to no binding: globals, plus the
     * implicit `arguments` (recorded only up to the function that owns it).
     */
    unresolved: Set<string>
    /** True when nothing declared here may be renamed (direct eval / with around or inside, Annex B). */
    unsafe: boolean
    /** The node that opens the scope (the Program for the root). */
    node: Node
    strict: boolean
    /** Bindings declared outside this scope with an identifier (reference or `var`) inside it. */
    through: Set<Binding>
}

export interface Analysis {
    root: Scope
    /** Free (global) names of the whole program; the same set as `root.unresolved`. */
    unresolved: Set<string>
    /** True when the program has an `import`/`export` declaration or `import.meta`. */
    hasModuleSyntax: boolean
    /** Every reference identifier (not declarations), mapped to its binding or `null` if free. */
    references: Map<Identifier, Binding | null>
}

/** Thrown for an early error the parser does not report (illegal redeclaration, bad export). */
export class ScopeError extends Error {
    readonly offset: number

    /**
     * @param message - What went wrong.
     * @param offset - Source offset the error points at.
     */
    constructor(message: string, offset: number) {
        super(message)
        this.name = 'ScopeError'
        this.offset = offset
    }
}

type FunctionNode = FunctionDeclaration | FunctionExpression | ArrowFunctionExpression

interface Located {
    id: Identifier
    scope: Scope
}

function hasUseStrict(body: Statement[]): boolean {
    for (const statement of body) {
        if (statement.type !== 'ExpressionStatement' || statement.directive === undefined) {
            return false
        }
        if (statement.directive === 'use strict') {
            return true
        }
    }
    return false
}

function isLabelledFunction(node: Statement): boolean {
    let inner = node
    while (inner.type === 'LabeledStatement') {
        inner = inner.body
    }
    return inner.type === 'FunctionDeclaration'
}

function boundIdentifiers(node: Expression | Pattern, out: Identifier[]): void {
    switch (node.type) {
        case 'Identifier':
            out.push(node)
            return
        case 'ObjectPattern':
            for (const property of node.properties) {
                boundIdentifiers(
                    property.type === 'RestElement' ? property.argument : property.value,
                    out,
                )
            }
            return
        case 'ArrayPattern':
            for (const element of node.elements) {
                if (element !== null) {
                    boundIdentifiers(element, out)
                }
            }
            return
        case 'AssignmentPattern':
            boundIdentifiers(node.left, out)
            return
        case 'RestElement':
            boundIdentifiers(node.argument, out)
            return
        default:
            return
    }
}

function moduleName(node: Identifier | Literal): string {
    return node.type === 'Identifier' ? node.name : String(node.value)
}

function alreadyDeclared(id: Identifier): ScopeError {
    return new ScopeError(`"${id.name}" is already declared`, id.start)
}

class Analyzer {
    readonly root: Scope
    hasModuleSyntax = false
    readonly references = new Map<Identifier, Binding | null>()

    private readonly varScopes = new Set<Scope>()
    private readonly argumentsOwners = new Set<Scope>()
    /** Function body scope → its separate params scope (non-simple parameter lists only). */
    private readonly paramsOf = new Map<Scope, Scope>()
    /** Function or catch body scope → the params/catch scope its lexical names may not redeclare. */
    private readonly lexicalGuard = new Map<Scope, Scope>()
    private readonly lexical = new Set<Binding>()
    private readonly sloppyPlainFunctions = new Set<Binding>()
    private readonly occurrences = new Map<Identifier, Scope>()
    private readonly pendingVars: Located[] = []
    private readonly blockFunctions: Located[] = []
    private readonly refs: Located[] = []
    private readonly dynamic: Scope[] = []
    private readonly exportLocals: Identifier[] = []
    private readonly exportedDeclarations: Identifier[] = []
    private readonly exportNames = new Set<string>()

    constructor(program: Program) {
        const isModule = program.sourceType === 'module'
        this.root = this.newScope(
            isModule ? 'module' : 'script',
            null,
            program,
            isModule || hasUseStrict(program.body),
        )
        this.varScopes.add(this.root)
        this.statements(program.body, this.root)
        this.hoistVars()
        this.hoistBlockFunctions()
        this.resolveExports()
        this.resolveReferences()
        this.markDynamic()
        this.computeThrough()
    }

    // ---- Scopes and bindings ----

    private newScope(
        kind: Scope['kind'],
        parent: Scope | null,
        node: Node,
        strict: boolean,
    ): Scope {
        const scope: Scope = {
            kind,
            parent,
            children: [],
            bindings: new Map(),
            unresolved: new Set(),
            unsafe: false,
            node,
            strict,
            through: new Set(),
        }
        parent?.children.push(scope)
        return scope
    }

    private createBinding(scope: Scope, name: string, kind: BindingKind): Binding {
        const binding: Binding = { name, kind, scope, identifiers: [], exported: false }
        scope.bindings.set(name, binding)
        return binding
    }

    private addIdentifier(binding: Binding, id: Identifier, at: Scope): void {
        binding.identifiers.push(id)
        this.occurrences.set(id, at)
    }

    /** A let/const/class/import, catch parameter, block-level or module-level function. */
    private declareLexical(
        scope: Scope,
        id: Identifier,
        kind: BindingKind,
        sloppyPlainFunction = false,
    ): void {
        const existing = scope.bindings.get(id.name)
        if (existing !== undefined) {
            if (sloppyPlainFunction && this.sloppyPlainFunctions.has(existing)) {
                this.addIdentifier(existing, id, scope)
                return
            }
            throw alreadyDeclared(id)
        }
        if (this.lexicalGuard.get(scope)?.bindings.has(id.name) === true) {
            throw alreadyDeclared(id)
        }
        const binding = this.createBinding(scope, id.name, kind)
        this.addIdentifier(binding, id, scope)
        if (kind !== 'catch') {
            this.lexical.add(binding)
        }
        if (sloppyPlainFunction) {
            this.sloppyPlainFunctions.add(binding)
        }
    }

    private declareParam(scope: Scope, id: Identifier, allowDuplicate: boolean): void {
        const existing = scope.bindings.get(id.name)
        if (existing !== undefined) {
            if (!allowDuplicate) {
                throw alreadyDeclared(id)
            }
            this.addIdentifier(existing, id, scope)
            return
        }
        this.addIdentifier(this.createBinding(scope, id.name, 'param'), id, scope)
    }

    /** A function declared directly in a function body, static block or script top level. */
    private declareVarFunction(scope: Scope, id: Identifier): void {
        const existing =
            scope.bindings.get(id.name) ?? this.paramsOf.get(scope)?.bindings.get(id.name)
        if (existing !== undefined) {
            if (this.lexical.has(existing)) {
                throw alreadyDeclared(id)
            }
            this.addIdentifier(existing, id, scope)
            return
        }
        this.addIdentifier(this.createBinding(scope, id.name, 'function'), id, scope)
    }

    private declareFunctionName(node: FunctionDeclaration, id: Identifier, scope: Scope): void {
        if (this.varScopes.has(scope) && scope.kind !== 'module') {
            this.declareVarFunction(scope, id)
            return
        }
        const plain = !node.async && !node.generator
        const annexB = plain && !scope.strict && scope.kind !== 'module'
        this.declareLexical(scope, id, 'function', annexB)
        if (annexB) {
            this.blockFunctions.push({ id, scope })
        }
    }

    // ---- Statements ----

    private statements(body: Statement[], scope: Scope): void {
        for (const statement of body) {
            this.statement(statement, scope)
        }
    }

    /** A single-statement position (if/loop/with/label body): a function there gets a block. */
    private body(node: Statement, scope: Scope): void {
        if (isLabelledFunction(node)) {
            this.statement(node, this.newScope('block', scope, node, scope.strict))
            return
        }
        this.statement(node, scope)
    }

    private block(node: BlockStatement, scope: Scope): void {
        this.statements(node.body, this.newScope('block', scope, node, scope.strict))
    }

    private statement(node: Statement, scope: Scope): void {
        switch (node.type) {
            case 'ExpressionStatement':
                this.expr(node.expression, scope)
                return
            case 'BlockStatement':
                this.block(node, scope)
                return
            case 'EmptyStatement':
            case 'DebuggerStatement':
            case 'BreakStatement':
            case 'ContinueStatement':
                return
            case 'WithStatement':
                this.expr(node.object, scope)
                this.dynamic.push(scope)
                this.body(node.body, scope)
                return
            case 'ReturnStatement':
            case 'ThrowStatement':
                if (node.argument !== null) {
                    this.expr(node.argument, scope)
                }
                return
            case 'LabeledStatement':
                this.statement(node.body, scope)
                return
            case 'IfStatement':
                this.expr(node.test, scope)
                this.body(node.consequent, scope)
                if (node.alternate !== null) {
                    this.body(node.alternate, scope)
                }
                return
            case 'SwitchStatement': {
                this.expr(node.discriminant, scope)
                const inner = this.newScope('block', scope, node, scope.strict)
                for (const switchCase of node.cases) {
                    if (switchCase.test !== null) {
                        this.expr(switchCase.test, inner)
                    }
                    this.statements(switchCase.consequent, inner)
                }
                return
            }
            case 'TryStatement':
                this.block(node.block, scope)
                if (node.handler !== null) {
                    const handler = node.handler
                    const inner = this.newScope('catch', scope, handler, scope.strict)
                    if (handler.param !== null) {
                        this.pattern(handler.param, inner, (id) => {
                            this.declareLexical(inner, id, 'catch')
                        })
                    }
                    const body = this.newScope('block', inner, handler.body, scope.strict)
                    this.lexicalGuard.set(body, inner)
                    this.statements(handler.body.body, body)
                }
                if (node.finalizer !== null) {
                    this.block(node.finalizer, scope)
                }
                return
            case 'WhileStatement':
            case 'DoWhileStatement':
                this.expr(node.test, scope)
                this.body(node.body, scope)
                return
            case 'ForStatement': {
                const inner = this.loopScope(node.init, node, scope)
                if (node.init !== null) {
                    if (node.init.type === 'VariableDeclaration') {
                        this.variables(node.init, inner)
                    } else {
                        this.expr(node.init, inner)
                    }
                }
                if (node.test !== null) {
                    this.expr(node.test, inner)
                }
                if (node.update !== null) {
                    this.expr(node.update, inner)
                }
                this.body(node.body, inner)
                return
            }
            case 'ForInStatement':
            case 'ForOfStatement': {
                const inner = this.loopScope(node.left, node, scope)
                if (node.left.type === 'VariableDeclaration') {
                    this.variables(node.left, inner)
                } else {
                    this.expr(node.left, inner)
                }
                this.expr(node.right, inner)
                this.body(node.body, inner)
                return
            }
            case 'VariableDeclaration':
                this.variables(node, scope)
                return
            case 'FunctionDeclaration':
                if (node.id !== null) {
                    this.declareFunctionName(node, node.id, scope)
                }
                this.fn(node, scope, false)
                return
            case 'ClassDeclaration':
                if (node.id !== null) {
                    this.declareLexical(scope, node.id, 'class')
                }
                this.cls(node, scope)
                return
            case 'ImportDeclaration':
                this.hasModuleSyntax = true
                for (const specifier of node.specifiers) {
                    this.declareLexical(scope, specifier.local, 'import')
                }
                return
            case 'ExportNamedDeclaration':
                this.hasModuleSyntax = true
                if (node.declaration !== null) {
                    const ids: Identifier[] = []
                    if (node.declaration.type === 'VariableDeclaration') {
                        for (const declarator of node.declaration.declarations) {
                            boundIdentifiers(declarator.id, ids)
                        }
                    } else if (node.declaration.id !== null) {
                        ids.push(node.declaration.id)
                    }
                    for (const id of ids) {
                        this.exportName(id.name, id.start)
                        this.exportedDeclarations.push(id)
                    }
                    this.statement(node.declaration, scope)
                }
                for (const specifier of node.specifiers) {
                    this.exportName(moduleName(specifier.exported), specifier.exported.start)
                    if (node.source === null) {
                        if (specifier.local.type !== 'Identifier') {
                            throw new ScopeError(
                                'cannot export a string name locally',
                                specifier.start,
                            )
                        }
                        this.exportLocals.push(specifier.local)
                    }
                }
                return
            case 'ExportDefaultDeclaration': {
                this.hasModuleSyntax = true
                this.exportName('default', node.start)
                const declaration = node.declaration
                if (
                    declaration.type === 'FunctionDeclaration' ||
                    declaration.type === 'ClassDeclaration'
                ) {
                    if (declaration.id !== null) {
                        this.exportedDeclarations.push(declaration.id)
                    }
                    this.statement(declaration, scope)
                } else {
                    this.expr(declaration, scope)
                }
                return
            }
            case 'ExportAllDeclaration':
                this.hasModuleSyntax = true
                if (node.exported !== null) {
                    this.exportName(moduleName(node.exported), node.exported.start)
                }
                return
        }
    }

    private loopScope(head: Node | null, node: Node, scope: Scope): Scope {
        if (head?.type === 'VariableDeclaration' && head.kind !== 'var') {
            return this.newScope('block', scope, node, scope.strict)
        }
        return scope
    }

    private exportName(name: string, offset: number): void {
        if (this.exportNames.has(name)) {
            throw new ScopeError(`duplicate export "${name}"`, offset)
        }
        this.exportNames.add(name)
    }

    private variables(node: VariableDeclaration, scope: Scope): void {
        for (const declarator of node.declarations) {
            this.pattern(declarator.id, scope, (id) => {
                if (node.kind === 'var') {
                    this.pendingVars.push({ id, scope })
                } else {
                    this.declareLexical(scope, id, node.kind)
                }
            })
            if (declarator.init !== null) {
                this.expr(declarator.init, scope)
            }
        }
    }

    /** A binding pattern: `declare` each bound name, visit defaults and computed keys in `scope`. */
    private pattern(
        node: Expression | Pattern,
        scope: Scope,
        declare: (id: Identifier) => void,
    ): void {
        switch (node.type) {
            case 'Identifier':
                declare(node)
                return
            case 'ObjectPattern':
                for (const property of node.properties) {
                    if (property.type === 'RestElement') {
                        this.pattern(property.argument, scope, declare)
                    } else {
                        if (property.computed) {
                            this.expr(property.key, scope)
                        }
                        this.pattern(property.value, scope, declare)
                    }
                }
                return
            case 'ArrayPattern':
                for (const element of node.elements) {
                    if (element !== null) {
                        this.pattern(element, scope, declare)
                    }
                }
                return
            case 'AssignmentPattern':
                this.pattern(node.left, scope, declare)
                this.expr(node.right, scope)
                return
            case 'RestElement':
                this.pattern(node.argument, scope, declare)
                return
            default:
                // Not a binding form (the parser never produces one here); visit it as code.
                this.expr(node, scope)
                return
        }
    }

    // ---- Functions and classes ----

    private fn(node: FunctionNode, scope: Scope, method: boolean): void {
        const strict =
            scope.strict || (node.body.type === 'BlockStatement' && hasUseStrict(node.body.body))
        let outer = scope
        if (node.type === 'FunctionExpression' && node.id !== null) {
            outer = this.newScope('block', scope, node, strict)
            this.addIdentifier(this.createBinding(outer, node.id.name, 'function'), node.id, outer)
        }
        const simple = node.params.every((param) => param.type === 'Identifier')
        let params: Scope
        let body: Scope
        if (simple) {
            body = this.newScope('function', outer, node, strict)
            params = body
        } else {
            params = this.newScope('params', outer, node, strict)
            body = this.newScope('function', params, node, strict)
            this.paramsOf.set(body, params)
            this.lexicalGuard.set(body, params)
        }
        this.varScopes.add(body)
        const arrow = node.type === 'ArrowFunctionExpression'
        if (!arrow) {
            this.argumentsOwners.add(params)
        }
        const allowDuplicate = !strict && simple && !arrow && !method
        for (const param of node.params) {
            this.pattern(param, params, (id) => {
                this.declareParam(params, id, allowDuplicate)
            })
        }
        if (node.body.type === 'BlockStatement') {
            this.statements(node.body.body, body)
        } else {
            this.expr(node.body, body)
        }
    }

    private cls(node: ClassDeclaration | ClassExpression, scope: Scope): void {
        const inner = this.newScope('class', scope, node, true)
        if (node.type === 'ClassExpression' && node.id !== null) {
            this.addIdentifier(this.createBinding(inner, node.id.name, 'class'), node.id, inner)
        }
        if (node.superClass !== null) {
            this.expr(node.superClass, inner)
        }
        for (const element of node.body.body) {
            switch (element.type) {
                case 'MethodDefinition':
                    if (element.computed) {
                        this.expr(element.key, inner)
                    }
                    this.fn(element.value, inner, true)
                    break
                case 'PropertyDefinition':
                    if (element.computed) {
                        this.expr(element.key, inner)
                    }
                    if (element.value !== null) {
                        const field = this.newScope('function', inner, element, true)
                        this.argumentsOwners.add(field)
                        this.expr(element.value, field)
                    }
                    break
                case 'StaticBlock': {
                    const block = this.newScope('function', inner, element, true)
                    this.varScopes.add(block)
                    this.argumentsOwners.add(block)
                    this.statements(element.body, block)
                    break
                }
            }
        }
    }

    // ---- Expressions (and assignment targets, whose identifiers are references) ----

    private expr(
        node: Expression | Pattern | SpreadElement | Super | PrivateIdentifier,
        scope: Scope,
    ): void {
        switch (node.type) {
            case 'Identifier':
                this.refs.push({ id: node, scope })
                return
            case 'Literal':
            case 'ThisExpression':
            case 'Super':
            case 'PrivateIdentifier':
                return
            case 'MetaProperty':
                if (node.meta.name === 'import') {
                    this.hasModuleSyntax = true
                }
                return
            case 'ArrayExpression':
            case 'ArrayPattern':
                for (const element of node.elements) {
                    if (element !== null) {
                        this.expr(element, scope)
                    }
                }
                return
            case 'ObjectExpression':
            case 'ObjectPattern':
                for (const property of node.properties) {
                    if (property.type !== 'Property') {
                        this.expr(property.argument, scope)
                        continue
                    }
                    if (property.computed) {
                        this.expr(property.key, scope)
                    }
                    const value = property.value
                    if (
                        value.type === 'FunctionExpression' &&
                        (property.method || property.kind !== 'init')
                    ) {
                        this.fn(value, scope, true)
                    } else {
                        this.expr(value, scope)
                    }
                }
                return
            case 'SpreadElement':
            case 'RestElement':
            case 'UnaryExpression':
            case 'UpdateExpression':
            case 'AwaitExpression':
                this.expr(node.argument, scope)
                return
            case 'YieldExpression':
                if (node.argument !== null) {
                    this.expr(node.argument, scope)
                }
                return
            case 'FunctionExpression':
            case 'ArrowFunctionExpression':
                this.fn(node, scope, false)
                return
            case 'ClassExpression':
                this.cls(node, scope)
                return
            case 'TemplateLiteral':
                for (const expression of node.expressions) {
                    this.expr(expression, scope)
                }
                return
            case 'TaggedTemplateExpression':
                this.expr(node.tag, scope)
                this.expr(node.quasi, scope)
                return
            case 'MemberExpression':
                this.expr(node.object, scope)
                if (node.computed) {
                    this.expr(node.property, scope)
                }
                return
            case 'CallExpression':
                if (node.callee.type === 'Identifier' && node.callee.name === 'eval') {
                    this.dynamic.push(scope)
                }
                this.expr(node.callee, scope)
                for (const argument of node.arguments) {
                    this.expr(argument, scope)
                }
                return
            case 'NewExpression':
                this.expr(node.callee, scope)
                for (const argument of node.arguments) {
                    this.expr(argument, scope)
                }
                return
            case 'ChainExpression':
                this.expr(node.expression, scope)
                return
            case 'ImportExpression':
                this.expr(node.source, scope)
                if (node.options !== null) {
                    this.expr(node.options, scope)
                }
                return
            case 'BinaryExpression':
            case 'LogicalExpression':
            case 'AssignmentExpression':
            case 'AssignmentPattern':
                this.expr(node.left, scope)
                this.expr(node.right, scope)
                return
            case 'ConditionalExpression':
                this.expr(node.test, scope)
                this.expr(node.consequent, scope)
                this.expr(node.alternate, scope)
                return
            case 'SequenceExpression':
                for (const expression of node.expressions) {
                    this.expr(expression, scope)
                }
                return
        }
    }

    // ---- Resolution passes ----

    private hoistVars(): void {
        for (const { id, scope: from } of this.pendingVars) {
            const path: Scope[] = []
            let annexB = false
            let scope = from
            while (!this.varScopes.has(scope)) {
                const existing = scope.bindings.get(id.name)
                if (existing !== undefined) {
                    const node = scope.node
                    if (
                        existing.kind === 'catch' &&
                        node.type === 'CatchClause' &&
                        node.param?.type === 'Identifier'
                    ) {
                        annexB = true
                    } else {
                        throw alreadyDeclared(id)
                    }
                }
                path.push(scope)
                scope = this.parentOf(scope)
            }
            if (annexB) {
                for (const crossed of path) {
                    crossed.unsafe = true
                }
                scope.unsafe = true
            }
            const existing =
                scope.bindings.get(id.name) ?? this.paramsOf.get(scope)?.bindings.get(id.name)
            if (existing !== undefined) {
                if (this.lexical.has(existing)) {
                    throw alreadyDeclared(id)
                }
                this.addIdentifier(existing, id, from)
                continue
            }
            this.addIdentifier(this.createBinding(scope, id.name, 'var'), id, from)
            if (id.name === 'arguments' && this.argumentsOwners.has(this.ownScopeOf(scope))) {
                scope.unsafe = true
            }
        }
    }

    private hoistBlockFunctions(): void {
        for (const { id, scope: block } of this.blockFunctions) {
            block.unsafe = true
            let blocked = false
            let scope = block
            while (!this.varScopes.has(scope)) {
                scope = this.parentOf(scope)
                scope.unsafe = true
                const existing = scope.bindings.get(id.name)
                if (existing === undefined) {
                    continue
                }
                if (this.varScopes.has(scope)) {
                    blocked ||= this.lexical.has(existing) || existing.kind === 'param'
                } else {
                    blocked ||= existing.kind !== 'catch'
                }
            }
            const params = this.paramsOf.get(scope)
            if (params !== undefined) {
                params.unsafe = true
                blocked ||= params.bindings.has(id.name)
            }
            if (!blocked && !scope.bindings.has(id.name)) {
                this.createBinding(scope, id.name, 'var')
            }
        }
    }

    private resolveExports(): void {
        for (const id of this.exportLocals) {
            const binding = this.root.bindings.get(id.name)
            if (binding === undefined) {
                throw new ScopeError(`exported "${id.name}" is not declared`, id.start)
            }
            binding.exported = true
            this.references.set(id, binding)
            this.addIdentifier(binding, id, this.root)
        }
        for (const id of this.exportedDeclarations) {
            const binding = this.root.bindings.get(id.name)
            if (binding !== undefined) {
                binding.exported = true
            }
        }
    }

    private resolveReferences(): void {
        for (const { id, scope: from } of this.refs) {
            let found: Binding | null = null
            let owner: Scope | null = null
            for (let scope: Scope | null = from; scope !== null; scope = scope.parent) {
                const binding = scope.bindings.get(id.name)
                if (binding !== undefined) {
                    found = binding
                    break
                }
                if (id.name === 'arguments' && this.argumentsOwners.has(scope)) {
                    owner = scope
                    break
                }
            }
            this.references.set(id, found)
            if (found !== null) {
                this.addIdentifier(found, id, from)
                continue
            }
            for (let scope: Scope | null = from; scope !== null; scope = scope.parent) {
                scope.unresolved.add(id.name)
                if (scope === owner) {
                    break
                }
            }
        }
    }

    private markDynamic(): void {
        const markDown = (scope: Scope): void => {
            scope.unsafe = true
            for (const child of scope.children) {
                markDown(child)
            }
        }
        for (const origin of this.dynamic) {
            markDown(origin)
            for (let scope = origin.parent; scope !== null; scope = scope.parent) {
                scope.unsafe = true
            }
        }
    }

    private computeThrough(): void {
        const visit = (scope: Scope): void => {
            for (const binding of scope.bindings.values()) {
                for (const id of binding.identifiers) {
                    let at = this.occurrences.get(id) ?? scope
                    while (at !== scope) {
                        at.through.add(binding)
                        at = this.parentOf(at)
                    }
                }
            }
            for (const child of scope.children) {
                visit(child)
            }
        }
        visit(this.root)
    }

    private parentOf(scope: Scope): Scope {
        if (scope.parent === null) {
            throw new Error('scope analysis: walked past the root scope')
        }
        return scope.parent
    }

    /** The outermost scope of a function's own scopes (its params scope when it has one). */
    private ownScopeOf(body: Scope): Scope {
        return this.paramsOf.get(body) ?? body
    }
}

/**
 * Builds the scope tree of a parsed program: bindings with their declaration and reference
 * identifiers, free names per scope, and unsafe (eval/with/Annex B) scopes.
 * @param program - A program produced by `parse`.
 * @returns The root scope, the program's free names, whether it has module syntax, and the
 *   binding (or `null`) of every reference identifier.
 * @throws {ScopeError} On an illegal redeclaration, a duplicate export or an export of an
 *   undeclared name (early errors the parser does not report).
 */
export function analyze(program: Program): Analysis {
    const analyzer = new Analyzer(program)
    return {
        root: analyzer.root,
        unresolved: analyzer.root.unresolved,
        hasModuleSyntax: analyzer.hasModuleSyntax,
        references: analyzer.references,
    }
}
