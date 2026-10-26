/** Options for {@link structuralDiff}. */
export interface StructuralOptions {
    /** Treat `void 0` and the identifier `undefined` as equal (the printer's `undefined` rewrite). */
    undefinedAsVoid?: boolean
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
                node[key] !== undefined &&
                !(isLiteralNode && (key === 'raw' || (key === 'value' && 'regex' in node))),
        )
        .sort()
}

function diff(a: unknown, b: unknown, path: string, options: StructuralOptions): string | null {
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
            return path
        }
        for (const [i, item] of a.entries()) {
            const found = diff(item, b[i], `${path}[${String(i)}]`, options)
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
    const keys = keysOf(left)
    if (keys.join() !== keysOf(right).join()) {
        return `${path}{${keys.join()}|${keysOf(right).join()}}`
    }
    for (const key of keys) {
        const found = diff(left[key], right[key], `${path}.${key}`, options)
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
