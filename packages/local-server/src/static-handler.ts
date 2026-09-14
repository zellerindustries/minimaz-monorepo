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

    try {
        const stats = await stat(targetPath)
        if (stats.isDirectory()) {
            targetPath = resolve(targetPath, 'index.html')
        }
    } catch {
        return { status: 404 }
    }

    try {
        const finalStats = await stat(targetPath)
        if (!finalStats.isFile()) {
            return { status: 404 }
        }
    } catch {
        return { status: 404 }
    }

    return { status: 200, filePath: targetPath }
}
