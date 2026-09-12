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

function importPattern(): RegExp {
    return /@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?\s*;/g
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
        const context = importedFrom ? ` (imported from ${importedFrom})` : ''
        throw new Error(`bundleCss: file not found: ${resolvedPath}${context}`)
    }

    visited.add(resolvedPath)

    const raw = await getFileContent(resolvedPath)
    const fileDir = dirname(resolvedPath)
    const nextStack = [...stack, resolvedPath]

    const inlinedByMatch = new Map<string, string>()

    for (const match of raw.matchAll(importPattern())) {
        const fullMatch = match[0]
        const spec = match[1]
        if (spec === undefined || !isRelativeSpecifier(spec)) {
            continue
        }
        const importedPath = resolve(fileDir, spec)
        const inlined = await inlineImports(
            importedPath,
            entryDir,
            visited,
            nextStack,
            resolvedPath,
        )
        inlinedByMatch.set(fullMatch, inlined)
    }

    const inlined = raw.replace(
        importPattern(),
        (fullMatch: string) => inlinedByMatch.get(fullMatch) ?? fullMatch,
    )

    return rewriteUrls(inlined, fileDir, entryDir)
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
