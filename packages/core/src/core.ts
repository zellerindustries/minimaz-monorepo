import { cp, lstat, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'

import { dirname, isAbsolute, relative, sep } from 'node:path'

import { KnownError, log } from '@minimaz/logger'

/* =========================================================
    VALIDATION / INSPECTION
========================================================= */

/**
 * Checks whether a filesystem path exists.
 *
 * Returns:
 * - true → path is accessible
 * - false → path does not exist or cannot be accessed
 *
 * Uses `stat()` internally to support both files and directories.
 *
 * @param {string} path - File or directory path
 * @returns {Promise<boolean>}
 */
export async function pathExists(path: string): Promise<boolean> {
    try {
        await stat(path)
        return true
    } catch {
        return false
    }
}

/**
 * Reads and parses a JSON file.
 *
 * Provides UTF-8 decoding and normalized errors, each with a distinct message prefix:
 * - `NOT FOUND` → the file does not exist
 * - `READ ERROR` → the file exists but can't be read (e.g. permission denied, a directory)
 * - `PARSE ERROR` → the content is not valid JSON
 *
 * @template T
 * @param {string} file - Path to JSON file
 * @returns {Promise<T>}
 * @throws {Error} With a `NOT FOUND`, `READ ERROR` or `PARSE ERROR` message
 */
export async function readJsonFile<T>(file: string): Promise<T> {
    let content: string

    try {
        content = await readFile(file, 'utf8')
    } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            throw new Error(`NOT FOUND: "${file}" does not exist`, { cause: error })
        }

        const message = error instanceof Error ? error.message : String(error)

        throw new Error(`READ ERROR: Failed to read "${file}" - ${message}`, { cause: error })
    }

    try {
        return JSON.parse(content) as T
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)

        throw new Error(`PARSE ERROR: Failed to parse JSON in "${file}" - ${message}`, {
            cause: error,
        })
    }
}

/**
 * Reads directory contents and returns file/folder names.
 *
 * Returns an empty array when the directory does not exist
 * instead of throwing.
 *
 * @param {string} dir - Directory path
 * @returns {Promise<string[]>}
 */
export async function getDirElements(dir: string): Promise<string[]> {
    log.debug(`Reading directory: ${dir}`)

    try {
        return await readdir(dir)
    } catch {
        log.warn(`Directory does not exist: ${dir}`)
        return []
    }
}

/* =========================================================
    FILESYSTEM MUTATION
========================================================= */

/**
 * Removes a file or directory recursively.
 *
 * Behavior mirrors `rm -rf`:
 * - recursive deletion enabled
 * - ignores missing targets
 *
 * @param {string} path - File or directory path to remove
 */
export async function remove(path: string): Promise<void> {
    await rm(path, {
        recursive: true,
        force: true,
    })
}

/**
 * Ensures a directory exists.
 *
 * Creates the full directory tree when missing
 * (equivalent to `mkdir -p`).
 *
 * Safe to call on existing directories.
 *
 * @param {string} path - Directory path to create
 */
export async function ensureDir(path: string): Promise<void> {
    await mkdir(path, {
        recursive: true,
    })
}

/**
 * Copies a file or directory.
 *
 * Supports:
 * - recursive directory copy
 * - optional overwrite behavior
 *
 * @param {string} src - Source path
 * @param {string} dest - Destination path
 * @param {boolean} [overwrite=false] - Replace existing targets when true
 */
export async function copy(src: string, dest: string, overwrite = false): Promise<void> {
    if (overwrite) {
        log.debug(`${dest} exists, removing...`)
        await rm(dest, { recursive: true, force: true })
    }

    log.debug(`[COPY] ${src} to ${dest}...`)
    await cp(src, dest, { recursive: true })
}

/**
 * Writes a file while ensuring parent directories exist.
 *
 * Equivalent to `fs-extra.outputFile`.
 *
 * Responsibilities:
 * - resolve parent directory
 * - create missing directory tree
 * - write file content
 *
 * @param {string} path - Destination file path
 * @param {string | Uint8Array} data - File content
 * @param options - Optional writeFile options
 */
export async function outputFile(
    path: string,
    data: string | Uint8Array,
    options?: Parameters<typeof writeFile>[2],
): Promise<void> {
    const dir = dirname(path)

    await mkdir(dir, {
        recursive: true,
    })

    await writeFile(path, data, options ?? 'utf8')
}
/**
 * Checks if a path is a directory.
 *
 * Returns false if the path does not exist or is a file.
 *
 * @param {string} path - Path to check
 * @returns {Promise<boolean>}
 */
export async function isDirectory(path: string): Promise<boolean> {
    return lstat(path)
        .then((stats) => stats.isDirectory())
        .catch(() => false)
}

/**
 * Checks whether `child` is strictly inside `parent` - true containment,
 * not a string-length proxy. Both paths must already be resolved/absolute;
 * this does no path resolution itself.
 *
 * @param {string} child - The path to check
 * @param {string} parent - The directory `child` must be inside
 * @returns {boolean} Whether `child` is a strict descendant of `parent`
 */
export function isPathInside(child: string, parent: string): boolean {
    return child !== parent && child.startsWith(parent + sep)
}

function isSameOrInside(child: string, parent: string): boolean {
    const rel = relative(parent, child)
    return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

/**
 * True when two absolute paths are the same directory, or one contains the
 * other. Compares case-insensitively on Windows and macOS, whose default
 * filesystems ignore case — a case-only difference is still the same
 * directory on disk.
 *
 * @param {string} a - First absolute path
 * @param {string} b - Second absolute path
 * @returns {boolean}
 */
export function pathsOverlap(a: string, b: string): boolean {
    const caseInsensitive = process.platform === 'win32' || process.platform === 'darwin'
    const left = caseInsensitive ? a.toLowerCase() : a
    const right = caseInsensitive ? b.toLowerCase() : b

    return isSameOrInside(left, right) || isSameOrInside(right, left)
}

/**
 * Reads the content of a file as a UTF-8 string.
 *
 * Rejects with a `KnownError` (original error as `cause`) when the path
 * cannot be read — missing, a directory, permission denied — rather than
 * returning an empty string, which callers could not tell apart from a
 * genuinely empty file. A caller that wants "missing means empty" must check
 * `pathExists` first.
 *
 * @param {string} path - Path to the file
 * @returns {Promise<string>}
 * @throws {KnownError} When the file cannot be read
 */
export async function getFileContent(path: string): Promise<string> {
    try {
        return await readFile(path, 'utf8')
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        throw new KnownError(`Failed to read file at "${path}": ${message}`, { cause: error })
    }
}

/* =========================================================
    STRING TRANSFORMATION
========================================================= */

/**
 * Replaces every literal occurrence of each key in `replacements` with its
 * value. Not regex-based — keys are matched as plain substrings, so no
 * escaping is needed for special characters.
 *
 * @param {string} content - Source text to transform
 * @param {Record<string, string>} replacements - Map of literal search string to replacement
 * @returns {string} `content` with every replacement applied
 */
export function applyReplacements(content: string, replacements: Record<string, string>): string {
    let result = content

    for (const [search, replacement] of Object.entries(replacements)) {
        result = result.split(search).join(replacement)
    }

    return result
}
