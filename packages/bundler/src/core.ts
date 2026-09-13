import { readFile, stat } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { transpileTs } from '@minimaz/ts'
import type { ModuleGraphResult } from './types.js'

const RESOLVABLE_EXTENSIONS = ['.ts', '.tsx', '.js']

/**
 * Matches a quoted relative import specifier following either `from` (for
 * `import ... from '...'` and `export ... from '...'`) or a bare `import
 * '...'` side-effect import. This is a lightweight text scan, not a real
 * JS/TS parser — matching every relative-import style, but also able to
 * false-positive on a comment or string literal that happens to contain
 * the same text, same tradeoff as this repo's other hand-rolled JS
 * tooling (`@minimaz/js`'s minifier).
 */
const IMPORT_SPECIFIER_RE = /\b(?:from\s*|import\s*)(['"])(\.[^'"]*)\1/g

/**
 * Matches a dynamic `import('./relative')` call with a relative string
 * literal argument. Dynamic imports aren't resolved by this package (only
 * static `import`/`export ... from` statements are) — detected here only
 * so an unsupported dynamic import fails loudly instead of shipping an
 * unrewritten, unresolvable specifier to the browser.
 */
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*(['"])(\.[^'"]*)\1\s*\)/

async function fileExists(filePath: string): Promise<boolean> {
    try {
        const stats = await stat(filePath)
        return stats.isFile()
    } catch {
        return false
    }
}

async function loadAndTranspile(filePath: string): Promise<string> {
    const raw = await readFile(filePath, 'utf8')
    const ext = extname(filePath)

    if (ext === '.ts' || ext === '.tsx') {
        return transpileTs(raw, { jsx: ext === '.tsx' })
    }

    return raw
}

function toRelativeSpecifier(fromDir: string, resolvedPath: string): string {
    const rel = relative(fromDir, resolvedPath).split('\\').join('/')
    return rel.startsWith('.') ? rel : `./${rel}`
}

/**
 * Resolves a relative import specifier to an absolute file path, trying
 * `.ts`, `.tsx`, `.js` against the specifier itself, then the same three
 * extensions against `<specifier>/index` for directory imports.
 *
 * @throws {Error} When no candidate file exists.
 */
async function resolveSpecifier(fromFile: string, specifier: string): Promise<string> {
    const baseDir = dirname(fromFile)
    const rawTarget = join(baseDir, specifier)
    const ext = extname(specifier)
    const stripped = RESOLVABLE_EXTENSIONS.includes(ext)
        ? rawTarget.slice(0, -ext.length)
        : rawTarget

    const candidates = [
        ...RESOLVABLE_EXTENSIONS.map((e) => stripped + e),
        ...RESOLVABLE_EXTENSIONS.map((e) => join(stripped, `index${e}`)),
    ]

    for (const candidate of candidates) {
        if (await fileExists(candidate)) {
            return candidate
        }
    }

    throw new Error(
        `Cannot resolve "${specifier}" imported from "${fromFile}" — tried:\n${candidates
            .map((c) => `  - ${c}`)
            .join('\n')}`,
    )
}

interface Edit {
    start: number
    end: number
    text: string
}

async function processFile(
    filePath: string,
    visited: Set<string>,
    modules: Map<string, string>,
): Promise<void> {
    if (visited.has(filePath)) {
        return
    }
    visited.add(filePath)

    const original = await loadAndTranspile(filePath)

    const dynamicImportMatch = DYNAMIC_IMPORT_RE.exec(original)
    if (dynamicImportMatch) {
        throw new Error(
            `Dynamic import("${dynamicImportMatch[2]}") in "${filePath}" is not supported — ` +
                `@minimaz/bundler only resolves static "import"/"export ... from" statements.`,
        )
    }

    const fromDir = dirname(filePath)
    const matches = [...original.matchAll(IMPORT_SPECIFIER_RE)]
    const edits: Edit[] = []

    for (const match of matches) {
        const quote = match[1]
        const specifier = match[2]
        if (quote === undefined || specifier === undefined || match.index === undefined) {
            continue
        }

        const specifierExt = extname(specifier)
        if (specifierExt !== '' && !RESOLVABLE_EXTENSIONS.includes(specifierExt)) {
            continue
        }

        const resolvedPath = await resolveSpecifier(filePath, specifier)
        await processFile(resolvedPath, visited, modules)

        const newSpecifier = toRelativeSpecifier(fromDir, resolvedPath).replace(/\.tsx?$/, '.js')
        const specifierStart = match.index + match[0].lastIndexOf(specifier)
        edits.push({
            start: specifierStart,
            end: specifierStart + specifier.length,
            text: newSpecifier,
        })
    }

    let contents = original
    for (const edit of edits.reverse()) {
        contents = contents.slice(0, edit.start) + edit.text + contents.slice(edit.end)
    }

    modules.set(filePath, contents)
}

/**
 * Walks `entryPath`'s relative JS/TS import graph, transpiling TypeScript
 * along the way, and returns every reachable module's rewritten contents
 * keyed by absolute source path.
 *
 * @param {string} entryPath - Path to the entry file (resolved to absolute
 *   if not already, so the same file is always keyed consistently).
 * @returns {Promise<ModuleGraphResult>} Every reachable module's contents.
 */
export async function resolveModuleGraph(entryPath: string): Promise<ModuleGraphResult> {
    const modules = new Map<string, string>()
    const visited = new Set<string>()

    await processFile(resolve(entryPath), visited, modules)

    return { modules }
}
