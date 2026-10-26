import { readFile, stat } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { transpileTs } from '@minimaz/ts'
import { BundlerError } from './errors.js'
import type { ModuleGraphResult } from './types.js'

const resolvableExtensions = ['.ts', '.tsx', '.js']

/**
 * Matches a quoted relative import specifier following either `from` (for
 * `import ... from '...'` and `export ... from '...'`) or a bare `import
 * '...'` side-effect import. This is a lightweight text scan, not a real
 * JS/TS parser — matching every relative-import style, but also able to
 * false-positive on a comment or string literal that happens to contain
 * the same text, same tradeoff as this repo's other hand-rolled JS
 * tooling (`@minimaz/js`'s minifier).
 */
const importSpecifierRe = /\b(?:from\s*|import\s*)(['"])(\.{1,2}(?:\/[^'"]*)?)\1/g

/**
 * Matches a dynamic `import('./relative')` call with a relative string
 * literal argument. Dynamic imports aren't resolved by this package (only
 * static `import`/`export ... from` statements are) — detected here only
 * so an unsupported dynamic import fails loudly instead of shipping an
 * unrewritten, unresolvable specifier to the browser.
 */
const dynamicImportRe = /\bimport\s*\(\s*(['"])(\.{1,2}(?:\/[^'"]*)?)\1\s*\)/

async function fileExists(filePath: string): Promise<boolean> {
    try {
        const stats = await stat(filePath)
        return stats.isFile()
    } catch {
        return false
    }
}

async function loadAndTranspile(filePath: string, source?: string): Promise<string> {
    const raw = source ?? (await readFile(filePath, 'utf8'))
    const ext = extname(filePath).toLowerCase()

    if (ext === '.ts' || ext === '.tsx') {
        return transpileTs(raw, { jsx: ext === '.tsx' })
    }

    return raw
}

function toRelativeSpecifier(fromDir: string, resolvedPath: string): string {
    const rel = relative(fromDir, resolvedPath).split('\\').join('/')
    return rel.startsWith('../') ? rel : `./${rel}`
}

/**
 * Resolves a relative import specifier to an absolute file path, trying
 * `.ts`, `.tsx`, `.js` appended to the specifier (after stripping a trailing
 * code extension, so `./a.js` still finds `a.ts`), then the same three
 * extensions against `<specifier>/index` for directory imports. Appending
 * rather than replacing the extension keeps dotted names such as
 * `./utils.config` or `./foo.min` resolvable.
 *
 * @returns The resolved file, or the list of candidates tried when none exists.
 */
async function findCandidate(
    fromFile: string,
    specifier: string,
): Promise<{ found: string } | { tried: string[] }> {
    const rawTarget = join(dirname(fromFile), specifier)
    const ext = extname(specifier)
    const stripped = resolvableExtensions.includes(ext)
        ? rawTarget.slice(0, -ext.length)
        : rawTarget

    const candidates = [
        ...resolvableExtensions.map((e) => stripped + e),
        ...resolvableExtensions.map((e) => join(stripped, `index${e}`)),
    ]

    for (const candidate of candidates) {
        if (await fileExists(candidate)) {
            return { found: candidate }
        }
    }

    return { tried: candidates }
}

/**
 * Resolves a relative import specifier to an absolute code file. A specifier
 * whose extension is not a code extension (`./data.json`, `./utils.config`) is
 * an asset only when an exact file of that name exists or no code file
 * resolves; otherwise it is code.
 *
 * @returns The resolved path, or `null` when the specifier is an asset.
 * @throws {BundlerError} When a code-looking specifier cannot be resolved.
 */
async function resolveSpecifier(fromFile: string, specifier: string): Promise<string | null> {
    const ext = extname(specifier)
    const isCodeExt = resolvableExtensions.includes(ext)

    if (ext !== '' && !isCodeExt && (await fileExists(join(dirname(fromFile), specifier)))) {
        return null
    }

    const result = await findCandidate(fromFile, specifier)
    if ('found' in result) {
        return result.found
    }

    if (ext !== '' && !isCodeExt) {
        return null
    }

    throw new BundlerError(
        `Cannot resolve "${specifier}" imported from "${fromFile}" — tried:\n${result.tried
            .map((c) => `  - ${c}`)
            .join('\n')}`,
    )
}

interface Edit {
    start: number
    end: number
    text: string
}

/**
 * Loads (transpiling TypeScript) `filePath` and rewrites each relative code
 * specifier to its resolved `.js` form. Does not recurse; `onDependency` is
 * called with each resolved target so callers can walk the graph themselves.
 */
async function rewriteImports(
    filePath: string,
    onDependency?: (resolved: string) => Promise<void>,
    source?: string,
): Promise<string> {
    const original = await loadAndTranspile(filePath, source)

    const dynamicImportMatch = dynamicImportRe.exec(original)
    if (dynamicImportMatch) {
        throw new BundlerError(
            `Dynamic import("${dynamicImportMatch[2] ?? ''}") in "${filePath}" is not supported — ` +
                `@minimaz/bundler only resolves static "import"/"export ... from" statements.`,
        )
    }

    const fromDir = dirname(filePath)
    const matches = [...original.matchAll(importSpecifierRe)]
    const edits: Edit[] = []

    for (const match of matches) {
        const quote = match[1]
        const specifier = match[2]
        if (quote === undefined || specifier === undefined) {
            continue
        }

        const resolvedPath = await resolveSpecifier(filePath, specifier)
        if (resolvedPath === null) {
            continue
        }
        await onDependency?.(resolvedPath)

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

    return contents
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

    const contents = await rewriteImports(filePath, async (dep) =>
        processFile(dep, visited, modules),
    )

    modules.set(filePath, contents)
}

/**
 * Transpiles a single file (TypeScript to JS) and rewrites its relative code
 * specifiers to `./….js`, confirming each target exists. Does not follow
 * imports.
 *
 * @param {string} filePath - Path to the file (resolved to absolute). Its extension
 *   decides whether the text is transpiled, and its directory is the resolution base.
 * @param {string} [source] - Text to process instead of reading `filePath` from disk
 *   (e.g. content that already had replacements applied). `filePath` need not exist then.
 * @returns {Promise<string>} The file's rewritten JS text.
 * @throws {BundlerError} On an unresolvable specifier or relative dynamic import.
 */
export async function resolveFileImports(filePath: string, source?: string): Promise<string> {
    return rewriteImports(resolve(filePath), undefined, source)
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
