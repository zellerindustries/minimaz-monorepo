import { stat } from 'node:fs/promises'
import { resolve, sep } from 'node:path'

/**
 * The outcome of resolving a request path against a served directory:
 * a servable file, a traversal attempt, or a miss.
 */
export type StaticResolution = { status: 200; filePath: string } | { status: 403 } | { status: 404 }

/**
 * Resolves a URL pathname to a file inside `dir`, guarding against paths
 * that escape `dir` and falling back to `index.html` for directories.
 *
 * @param {string} dir - The directory being served
 * @param {string} pathname - The decoded request pathname (e.g. "/assets/app.css")
 * @returns {Promise<StaticResolution>} The resolution outcome
 */
export async function resolveStaticFile(dir: string, pathname: string): Promise<StaticResolution> {
    const resolvedDir = resolve(dir)
    const requestedPath = resolve(resolvedDir, `.${pathname}`)

    if (requestedPath !== resolvedDir && !requestedPath.startsWith(resolvedDir + sep)) {
        return { status: 403 }
    }

    let targetPath = requestedPath
    let stats
    try {
        stats = await stat(targetPath)
    } catch (error: unknown) {
        return { status: isPermissionError(error) ? 403 : 404 }
    }

    if (stats.isDirectory()) {
        targetPath = resolve(targetPath, 'index.html')
        try {
            stats = await stat(targetPath)
        } catch (error: unknown) {
            return { status: isPermissionError(error) ? 403 : 404 }
        }
    }

    if (!stats.isFile()) {
        return { status: 404 }
    }

    return { status: 200, filePath: targetPath }
}

/**
 * True when `error` is a filesystem permission failure (`EACCES`), which
 * should be reported as `403` rather than the generic `404` used for a
 * genuinely missing path.
 *
 * @param {unknown} error - The error caught from a `stat` call
 * @returns {boolean} Whether `error` is an `EACCES` failure
 */
function isPermissionError(error: unknown): boolean {
    return error instanceof Error && (error as NodeJS.ErrnoException).code === 'EACCES'
}
