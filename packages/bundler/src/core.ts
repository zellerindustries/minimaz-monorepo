import { readFile, stat } from 'node:fs/promises'
import { dirname, extname, join, relative } from 'node:path'
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
const IMPORT_SPECIFIER_RE = /\b(?:from\s*|import\s*)(['"])(\.[^'"]+)\1/g

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

async function processFile(
    filePath: string,
    visited: Set<string>,
    modules: Map<string, string>,
): Promise<void> {
    if (visited.has(filePath)) {
        return
    }
    visited.add(filePath)

    let contents = await loadAndTranspile(filePath)
    const fromDir = dirname(filePath)
    const matches = [...contents.matchAll(IMPORT_SPECIFIER_RE)]

    for (const match of matches) {
        if (!match[1] || !match[2]) continue

        const quote = match[1]
        const specifier = match[2]
        const specifierExt = extname(specifier)

        if (specifierExt !== '' && !RESOLVABLE_EXTENSIONS.includes(specifierExt)) {
            continue
        }

        const resolvedPath = await resolveSpecifier(filePath, specifier)
        await processFile(resolvedPath, visited, modules)

        const newSpecifier = toRelativeSpecifier(fromDir, resolvedPath).replace(/\.tsx?$/, '.js')
        const oldQuoted = `${quote}${specifier}${quote}`
        const newQuoted = `${quote}${newSpecifier}${quote}`
        contents = contents.split(oldQuoted).join(newQuoted)
    }

    modules.set(filePath, contents)
}

/**
 * Walks `entryPath`'s relative JS/TS import graph, transpiling TypeScript
 * along the way, and returns every reachable module's rewritten contents
 * keyed by absolute source path.
 *
 * @param {string} entryPath - Absolute path to the entry file.
 * @returns {Promise<ModuleGraphResult>} Every reachable module's contents.
 */
export async function resolveModuleGraph(entryPath: string): Promise<ModuleGraphResult> {
    const modules = new Map<string, string>()
    const visited = new Set<string>()

    await processFile(entryPath, visited, modules)

    return { modules }
}
