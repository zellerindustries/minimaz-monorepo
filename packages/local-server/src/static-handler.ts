import { readdir, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'

/**
 * The outcome of resolving a request path against a served directory.
 */
export type RequestResolution =
    | { kind: 'file'; filePath: string }
    | { kind: 'listing'; entries: DirectoryEntry[] }
    | { kind: 'forbidden' }
    | { kind: 'notFound' }

/** A single entry in a rendered directory listing. */
export interface DirectoryEntry {
    name: string
    isDirectory: boolean
}

/** Options controlling {@link resolveRequest}'s fallback behavior. */
export interface ResolveRequestOptions {
    cleanUrls: boolean
    singlePageApp: boolean
    directoryListing: boolean
}

/**
 * Resolves `requestedPath` to either a file, a listable directory, or
 * nothing — the shared core used by both the exact-match and clean-URL
 * lookups.
 *
 * @param {string} requestedPath - The absolute candidate path to check
 * @returns {Promise<{ kind: 'file'; filePath: string } | { kind: 'directory'; dirPath: string } | { kind: 'forbidden' } | { kind: 'miss' }>}
 */
async function statCandidate(
    requestedPath: string,
): Promise<
    | { kind: 'file'; filePath: string }
    | { kind: 'directory'; dirPath: string }
    | { kind: 'forbidden' }
    | { kind: 'miss' }
> {
    let stats
    try {
        stats = await stat(requestedPath)
    } catch (error: unknown) {
        return { kind: isPermissionError(error) ? 'forbidden' : 'miss' }
    }

    if (stats.isDirectory()) {
        return { kind: 'directory', dirPath: requestedPath }
    }

    return stats.isFile() ? { kind: 'file', filePath: requestedPath } : { kind: 'miss' }
}

/**
 * Resolves a URL pathname to a servable outcome inside `dir`: an exact file
 * or directory `index.html` match, a clean-URL `.html` fallback, a
 * directory listing, or an SPA fallback to root `index.html` — each stage
 * only reached if every earlier one missed, per `options`. Guards against
 * paths that escape `dir` at every stage.
 *
 * @param {string} dir - The directory being served
 * @param {string} pathname - The decoded request pathname (e.g. "/assets/app.css")
 * @param {ResolveRequestOptions} options - Which fallback behaviors are enabled
 * @returns {Promise<RequestResolution>} The resolution outcome
 */
export async function resolveRequest(
    dir: string,
    pathname: string,
    options: ResolveRequestOptions,
): Promise<RequestResolution> {
    const resolvedDir = resolve(dir)

    const resolveWithin = (candidatePathname: string): string | undefined => {
        const candidate = resolve(resolvedDir, `.${candidatePathname}`)
        return candidate === resolvedDir || candidate.startsWith(resolvedDir + sep)
            ? candidate
            : undefined
    }

    const exactPath = resolveWithin(pathname)
    if (exactPath === undefined) {
        return { kind: 'forbidden' }
    }

    const exact = await statCandidate(exactPath)

    if (exact.kind === 'forbidden') {
        return { kind: 'forbidden' }
    }

    if (exact.kind === 'file') {
        return { kind: 'file', filePath: exact.filePath }
    }

    let directoryCandidate: string | undefined
    if (exact.kind === 'directory') {
        const indexPath = resolve(exact.dirPath, 'index.html')
        const index = await statCandidate(indexPath)
        if (index.kind === 'forbidden') {
            return { kind: 'forbidden' }
        }
        if (index.kind === 'file') {
            return { kind: 'file', filePath: index.filePath }
        }
        directoryCandidate = exact.dirPath
    }

    if (options.cleanUrls && exact.kind === 'miss' && extname(pathname) === '') {
        const cleanPathname = `${pathname.replace(/\/+$/, '')}.html`
        const cleanPath = resolveWithin(cleanPathname)
        if (cleanPath !== undefined) {
            const clean = await statCandidate(cleanPath)
            if (clean.kind === 'forbidden') {
                return { kind: 'forbidden' }
            }
            if (clean.kind === 'file') {
                return { kind: 'file', filePath: clean.filePath }
            }
        }
    }

    if (options.directoryListing && directoryCandidate !== undefined) {
        const entries = await listDirectory(directoryCandidate)
        return { kind: 'listing', entries }
    }

    if (options.singlePageApp) {
        const rootIndexPath = resolve(resolvedDir, 'index.html')
        const rootIndex = await statCandidate(rootIndexPath)
        if (rootIndex.kind === 'file') {
            return { kind: 'file', filePath: rootIndex.filePath }
        }
    }

    return { kind: 'notFound' }
}

/**
 * Reads `dirPath`'s entries into sorted {@link DirectoryEntry} records:
 * directories first, then alphabetically within each group.
 *
 * @param {string} dirPath - Absolute path to the directory to list
 * @returns {Promise<DirectoryEntry[]>} The directory's entries, sorted
 */
async function listDirectory(dirPath: string): Promise<DirectoryEntry[]> {
    const dirents = await readdir(dirPath, { withFileTypes: true })
    return dirents
        .map((dirent) => ({ name: dirent.name, isDirectory: dirent.isDirectory() }))
        .sort((a, b) => {
            if (a.isDirectory !== b.isDirectory) {
                return a.isDirectory ? -1 : 1
            }
            return a.name.localeCompare(b.name)
        })
}

/**
 * Renders a minimal, dependency-free HTML directory listing for `pathname`.
 *
 * @param {string} pathname - The request pathname being listed (e.g. "/docs")
 * @param {DirectoryEntry[]} entries - The directory's sorted entries
 * @returns {string} A complete HTML document
 */
export function renderDirectoryListing(pathname: string, entries: DirectoryEntry[]): string {
    const normalized = pathname === '' ? '/' : pathname
    const base = normalized.endsWith('/') ? normalized : `${normalized}/`

    const parentLink = normalized === '/' ? '' : `<li><a href="..">.. (parent directory)</a></li>`

    const entryLinks = entries
        .map((entry) => {
            const href = entry.isDirectory ? `${entry.name}/` : entry.name
            return `<li><a href="${href}">${entry.name}${entry.isDirectory ? '/' : ''}</a></li>`
        })
        .join('\n')

    return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Index of ${base}</title></head>
<body>
<h1>Index of ${base}</h1>
<ul>
${parentLink}
${entryLinks}
</ul>
</body>
</html>`
}

/**
 * True when `error` is a filesystem permission failure (`EACCES`), which
 * should be reported as forbidden rather than a genuine miss.
 *
 * @param {unknown} error - The error caught from a `stat` call
 * @returns {boolean} Whether `error` is an `EACCES` failure
 */
function isPermissionError(error: unknown): boolean {
    return error instanceof Error && (error as NodeJS.ErrnoException).code === 'EACCES'
}
