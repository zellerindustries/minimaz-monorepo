import { dirname, relative, resolve } from 'node:path'
import { getFileContent, pathExists } from '@minimaz/core'

function isRelativeSpecifier(spec: string): boolean {
    return spec.startsWith('./') || spec.startsWith('../')
}

function isUntouchableUrl(spec: string): boolean {
    return (
        spec.startsWith('http://') ||
        spec.startsWith('https://') ||
        spec.startsWith('//') ||
        spec.startsWith('data:') ||
        spec.startsWith('#') ||
        spec.startsWith('/')
    )
}

function toPosix(path: string): string {
    return path.split('\\').join('/')
}

/**
 * Matches `@import "x"`, `@import 'x'` and `@import url(x)` (quoted or not),
 * with an optional trailing condition list (media query, `supports()`, `layer`).
 * Groups: 1/2 = url() quote/specifier, 3/4 = string quote/specifier, 5 = conditions.
 */
function importPattern(): RegExp {
    return /@import\s+(?:url\(\s*(["']?)([^"')]+?)\1\s*\)|(["'])([^"']+)\3)\s*([^;{}]*);/g
}

function rewriteUrls(code: string, fileDir: string, entryDir: string): string {
    return code.replace(
        /url\(\s*(["']?)([^"')]+)\1\s*\)/g,
        (match: string, quote: string, spec: string) => {
            if (isUntouchableUrl(spec)) {
                return match
            }
            const absolute = resolve(fileDir, spec)
            let rewritten = toPosix(relative(entryDir, absolute))
            if (!rewritten.startsWith('.')) {
                rewritten = `./${rewritten}`
            }
            return `url(${quote}${rewritten}${quote})`
        },
    )
}

async function inlineImports(
    filePath: string,
    entryDir: string,
    visited: Set<string>,
    stack: string[],
    importedFrom: string | undefined,
): Promise<string> {
    const resolvedPath = resolve(filePath)

    if (stack.includes(resolvedPath)) {
        throw new Error(
            `bundleCss: circular @import detected: ${[...stack, resolvedPath].join(' -> ')}`,
        )
    }

    if (!(await pathExists(resolvedPath))) {
        const context = importedFrom !== undefined ? ` (imported from ${importedFrom})` : ''
        throw new Error(`bundleCss: file not found: ${resolvedPath}${context}`)
    }

    visited.add(resolvedPath)

    const raw = await getFileContent(resolvedPath)
    const fileDir = dirname(resolvedPath)
    const nextStack = [...stack, resolvedPath]

    let output = ''
    let cursor = 0

    // Only this file's own text is url-rewritten; inlined text was already
    // rewritten (against entryDir) by the recursive call that read it.
    for (const match of raw.matchAll(importPattern())) {
        const fullMatch = match[0]
        const spec = match[2] ?? match[4]
        const conditions = (match[5] ?? '').trim()

        output += rewriteUrls(raw.slice(cursor, match.index), fileDir, entryDir)
        cursor = match.index + fullMatch.length

        if (spec === undefined || !isRelativeSpecifier(spec)) {
            // Not inlined, but a url() spec still resolves against this file's
            // directory, so it must be rewritten like any other url().
            output += rewriteUrls(fullMatch, fileDir, entryDir)
            continue
        }

        if (/\bsupports\s*\(|\blayer\b/i.test(conditions)) {
            throw new Error(
                `bundleCss: unsupported @import form in ${resolvedPath}: "${fullMatch}" (supports() and layer are not supported)`,
            )
        }

        const inlined = await inlineImports(
            resolve(fileDir, spec),
            entryDir,
            visited,
            nextStack,
            resolvedPath,
        )
        output += conditions === '' ? inlined : `@media ${conditions} {\n${inlined}\n}`
    }

    return output + rewriteUrls(raw.slice(cursor), fileDir, entryDir)
}

/**
 * Recursively inlines `@import` statements starting from `entryPath`,
 * rewriting relative `url()` references so they stay correct relative to
 * `entryPath`'s own directory once concatenated into one file.
 *
 * @param {string} entryPath - Path to the entry CSS file
 * @returns {Promise<{ code: string; inputs: string[] }>} Bundled CSS and every file touched (entry included, as absolute paths)
 */
export async function bundleCss(entryPath: string): Promise<{ code: string; inputs: string[] }> {
    const resolvedEntry = resolve(entryPath)
    const entryDir = dirname(resolvedEntry)
    const visited = new Set<string>()

    const code = await inlineImports(resolvedEntry, entryDir, visited, [], undefined)

    return { code, inputs: [...visited] }
}
