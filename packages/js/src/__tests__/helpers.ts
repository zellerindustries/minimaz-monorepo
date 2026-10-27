import type { Identifier, Program } from '../ast.js'
import type { Binding, Scope } from '../scope.js'
import { analyze } from '../scope.js'

/** Options for {@link structuralDiff}. */
export interface StructuralOptions {
    /** Treat `void 0` and the identifier `undefined` as equal (the printer's `undefined` rewrite). */
    undefinedAsVoid?: boolean
}

/** Per-tree identifier-to-binding maps plus the binding pairing found so far (see {@link alphaDiff}). */
interface AlphaContext {
    left: Map<Identifier, Binding>
    right: Map<Identifier, Binding>
    pairs: Map<Binding, Binding>
    reversePairs: Map<Binding, Binding>
}

type NodeRecord = Record<string, unknown>

const asciiIdentifierName = /^[A-Za-z_$][\w$]*$/

function isRecord(value: unknown): value is NodeRecord {
    return typeof value === 'object' && value !== null
}

function isLiteral(value: unknown, literal: unknown): boolean {
    return isRecord(value) && value['type'] === 'Literal' && Object.is(value['value'], literal)
}

/** A string literal key or member name that is a plain identifier name, as an `Identifier`. */
function asIdentifier(value: unknown): unknown {
    if (
        isRecord(value) &&
        value['type'] === 'Literal' &&
        typeof value['value'] === 'string' &&
        asciiIdentifierName.test(value['value'])
    ) {
        return { type: 'Identifier', name: value['value'] }
    }
    return value
}

/** An object-literal property that defines an own `__proto__`, in one canonical (computed) form. */
function ownProtoProperty(property: unknown): unknown {
    if (!isRecord(property) || property['type'] !== 'Property') {
        return property
    }
    const key = property['key']
    const shorthandProto =
        property['shorthand'] === true &&
        isRecord(key) &&
        key['type'] === 'Identifier' &&
        key['name'] === '__proto__'
    const computedProto =
        property['computed'] === true &&
        property['kind'] === 'init' &&
        property['method'] === false &&
        isLiteral(key, '__proto__')
    if (!shorthandProto && !computedProto) {
        return property
    }
    return { ...property, computed: true, key: { type: 'Literal', value: '__proto__' } }
}

/**
 * Maps a node to the canonical form of the printer's safe rewrites, so `!0`/`true`, `a["b"]`/
 * `a.b` and `{"a": 1}`/`{a: 1}` compare equal.
 */
function canonical(node: NodeRecord, options: StructuralOptions): NodeRecord {
    switch (node['type']) {
        case 'UnaryExpression': {
            const argument = node['argument']
            if (node['operator'] === '!' && isLiteral(argument, 0)) {
                return { type: 'Literal', value: true }
            }
            if (node['operator'] === '!' && isLiteral(argument, 1)) {
                return { type: 'Literal', value: false }
            }
            if (
                options.undefinedAsVoid === true &&
                node['operator'] === 'void' &&
                isLiteral(argument, 0)
            ) {
                return { type: 'Identifier', name: 'undefined' }
            }
            return node
        }
        case 'MemberExpression': {
            const property = asIdentifier(node['property'])
            if (node['computed'] === true && property !== node['property']) {
                return { ...node, computed: false, property }
            }
            return node
        }
        case 'ObjectExpression': {
            // `{__proto__}` and `{["__proto__"]: a}` both define an own property (the printer
            // writes the second for a renamed shorthand); `{__proto__: a}` sets the prototype.
            const properties = node['properties'] as unknown[]
            return { ...node, properties: properties.map(ownProtoProperty) }
        }
        case 'TemplateLiteral': {
            // Untagged template text is compared by cooked value: the printer may re-escape it.
            const quasis = node['quasis'] as NodeRecord[]
            return {
                ...node,
                quasis: quasis.map((quasi) => ({
                    ...quasi,
                    value: { cooked: (quasi['value'] as NodeRecord)['cooked'] },
                })),
            }
        }
        case 'TaggedTemplateExpression':
            // A tag can read the raw text, so it is compared as is.
            return { ...node, quasi: { ...(node['quasi'] as NodeRecord), type: 'TaggedQuasi' } }
        case 'Property':
        case 'MethodDefinition':
        case 'PropertyDefinition':
            if (node['computed'] === false) {
                return { ...node, key: asIdentifier(node['key']) }
            }
            return node
        default:
            return node
    }
}

/** The keys compared for a node: positions never, and a literal's `raw` text only via its value. */
function keysOf(node: NodeRecord): string[] {
    const isLiteralNode = node['type'] === 'Literal'
    return Object.keys(node)
        .filter(
            (key) =>
                key !== 'start' &&
                key !== 'end' &&
                // `{a}` and `{a: a}` (or `{a: b}` after renaming) differ only in this flag.
                key !== 'shorthand' &&
                node[key] !== undefined &&
                !(isLiteralNode && (key === 'raw' || (key === 'value' && 'regex' in node))),
        )
        .sort()
}

/**
 * Compares two identifiers by binding: bound ones must pair up one-to-one (the same binding on the
 * left always meets the same binding on the right, and vice versa), whatever their names.
 * @returns `undefined` when neither identifier is bound (compare them by name instead).
 */
function alphaCompare(
    a: NodeRecord,
    b: NodeRecord,
    path: string,
    alpha: AlphaContext,
): string | null | undefined {
    const left = alpha.left.get(a as unknown as Identifier)
    const right = alpha.right.get(b as unknown as Identifier)
    if (left === undefined && right === undefined) {
        return undefined
    }
    if (left === undefined || right === undefined) {
        return `${path}(bound/free: ${String(a['name'])}|${String(b['name'])})`
    }
    const paired = alpha.pairs.get(left)
    const reversePaired = alpha.reversePairs.get(right)
    if (paired === undefined && reversePaired === undefined) {
        alpha.pairs.set(left, right)
        alpha.reversePairs.set(right, left)
        return null
    }
    return paired === right && reversePaired === left
        ? null
        : `${path}(binding mismatch: ${String(a['name'])}|${String(b['name'])})`
}

function diff(
    a: unknown,
    b: unknown,
    path: string,
    options: StructuralOptions,
    alpha?: AlphaContext,
): string | null {
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
            return path
        }
        for (const [i, item] of a.entries()) {
            const found = diff(item, b[i], `${path}[${String(i)}]`, options, alpha)
            if (found !== null) {
                return found
            }
        }
        return null
    }
    if (!isRecord(a) || !isRecord(b)) {
        return Object.is(a, b) ? null : path
    }
    const left = canonical(a, options)
    const right = canonical(b, options)
    if (alpha !== undefined && left['type'] === 'Identifier' && right['type'] === 'Identifier') {
        const found = alphaCompare(left, right, path, alpha)
        if (found !== undefined) {
            return found
        }
    }
    const keys = keysOf(left)
    if (keys.join() !== keysOf(right).join()) {
        return `${path}{${keys.join()}|${keysOf(right).join()}}`
    }
    for (const key of keys) {
        const found = diff(left[key], right[key], `${path}.${key}`, options, alpha)
        if (found !== null) {
            return found
        }
    }
    return null
}

/**
 * Finds the first structural difference between two ASTs, ignoring source positions, literal
 * `raw` text (values are compared instead) and the printer's safe literal rewrites.
 * @param a - First tree.
 * @param b - Second tree.
 * @param options - See {@link StructuralOptions}.
 * @returns The path of the first difference, or `null` when the trees are equal.
 */
export function structuralDiff(
    a: unknown,
    b: unknown,
    options: StructuralOptions = {},
): string | null {
    return diff(a, b, '$', options)
}

/**
 * Compares two ASTs structurally (see {@link structuralDiff}).
 * @param a - First tree.
 * @param b - Second tree.
 * @param options - See {@link StructuralOptions}.
 * @returns Whether the trees are equal.
 */
export function structurallyEqual(
    a: unknown,
    b: unknown,
    options: StructuralOptions = {},
): boolean {
    return structuralDiff(a, b, options) === null
}

function bindingsOf(program: Program): Map<Identifier, Binding> {
    const map = new Map<Identifier, Binding>()
    const scopes: Scope[] = [analyze(program).root]
    for (const scope of scopes) {
        for (const binding of scope.bindings.values()) {
            for (const id of binding.identifiers) {
                map.set(id, binding)
            }
        }
        scopes.push(...scope.children)
    }
    return map
}

/**
 * Like {@link structuralDiff}, but modulo renaming: two bound identifiers are equal when they refer
 * to bindings at the same position in both programs (checked as a one-to-one pairing of bindings),
 * whatever their names; free identifiers, property names and labels must still match by name.
 * @param a - First program (analyzed, not modified).
 * @param b - Second program.
 * @param options - See {@link StructuralOptions}.
 * @returns The path of the first difference, or `null` when the programs are alpha-equivalent.
 */
export function alphaDiff(a: Program, b: Program, options: StructuralOptions = {}): string | null {
    const alpha: AlphaContext = {
        left: bindingsOf(a),
        right: bindingsOf(b),
        pairs: new Map(),
        reversePairs: new Map(),
    }
    return diff(a, b, '$', options, alpha)
}
