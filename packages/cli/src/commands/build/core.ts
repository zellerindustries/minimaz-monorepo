import { readFile, rename } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import type { MinimazConfig } from '@minimaz/config'
import {
    applyReplacements,
    copy,
    ensureDir,
    getDirElements,
    isDirectory,
    outputFile,
    pathExists,
    remove,
} from '@minimaz/core'
import { KnownError, log } from '@minimaz/logger'
import { bundleCssForBuild, processCss } from './processors/css.js'
import { processHtml } from './processors/html.js'
import { processJs, processTs } from './processors/javascript.js'
import type { CssBundleCache, File, RenameDir, ReplaceOutDirOptions } from './types.js'

/**
 * True for an `input.externals` key that names a remote URL rather than a local path. Matches only an explicit
 * `http://` or `https://` scheme, so a local folder like `httpdocs/` is still treated as a path.
 *
 * @param {string} source - An `input.externals` key
 * @returns {boolean}
 */
export function isRemoteExternal(source: string): boolean {
    return /^https?:\/\//i.test(source)
}

const processableExtensions = new Set(['.css', '.js', '.ts', '.tsx', '.html'])

/**
 * Path of the scratch directory a build writes into before it replaces
 * `output.dir`: a sibling of `output.dir` (same parent, so same filesystem
 * and `rename` is atomic-ish), named after it.
 *
 * @param {string} outDirPath - The output directory path (absolute or relative)
 * @returns {string} The sibling temp directory path, in the same form as `outDirPath`
 */
export function getBuildTempDirName(outDirPath: string): string {
    return `${outDirPath}.minimaz-tmp`
}

/**
 * Path the previous output is moved aside to while a finished build is
 * swapped in: a sibling of `output.dir`, named after it.
 *
 * @param {string} outDirPath - The output directory path (absolute or relative)
 * @returns {string} The sibling backup directory path, in the same form as `outDirPath`
 */
export function getBuildOldDirName(outDirPath: string): string {
    return `${outDirPath}.minimaz-old`
}

const transientRenameCodes = new Set(['EPERM', 'EACCES', 'EBUSY'])
const renameAttempts = 5

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

function isTransientRenameError(error: unknown): boolean {
    if (!(error instanceof Error) || !('code' in error)) {
        return false
    }
    return typeof error.code === 'string' && transientRenameCodes.has(error.code)
}

// Windows often fails a rename of just-written files with a short-lived
// EPERM/EACCES/EBUSY while Defender or the indexer still holds a handle.
async function renameWithRetry(
    renameDir: RenameDir,
    from: string,
    to: string,
    retryDelayMs: number,
): Promise<void> {
    for (let attempt = 1; ; attempt++) {
        try {
            await renameDir(from, to)
            return
        } catch (error: unknown) {
            if (attempt >= renameAttempts || !isTransientRenameError(error)) {
                throw error
            }
            log.debug(`build: rename ${from} -> ${to} failed (${getErrorMessage(error)}), retrying`)
            await sleep(retryDelayMs * attempt)
        }
    }
}

/**
 * Replaces `outDirPath` with the finished build in `tempDirPath` without
 * ever leaving `outDirPath` missing on failure: the previous output is
 * renamed aside to `getBuildOldDirName(outDirPath)`, the temp directory is
 * renamed into place, then the backup is removed. If moving the new build
 * in fails, the backup is renamed back. Each rename is retried a few times
 * on a transient EPERM/EACCES/EBUSY. (A plain `rename` over an existing
 * directory fails on Windows, hence the move-aside.)
 *
 * @param {string} tempDirPath - Absolute path to the completed build
 * @param {string} outDirPath - Absolute path to the configured output directory
 * @param {ReplaceOutDirOptions} [options] - Injectable rename and retry backoff
 * @throws {KnownError} When the swap fails; the message names
 *   `tempDirPath` (which still holds the completed build) and says where
 *   the previous output is
 */
export async function replaceOutDir(
    tempDirPath: string,
    outDirPath: string,
    options: ReplaceOutDirOptions = {},
): Promise<void> {
    const renameDir = options.renameDir ?? rename
    const retryDelayMs = options.retryDelayMs ?? 100
    const oldDirPath = getBuildOldDirName(outDirPath)
    const hadOutput = await pathExists(outDirPath)

    if (hadOutput) {
        try {
            await remove(oldDirPath)
            await renameWithRetry(renameDir, outDirPath, oldDirPath, retryDelayMs)
        } catch (error: unknown) {
            throw new KnownError(
                `build: could not move the previous output ${outDirPath} aside (${getErrorMessage(error)}); it is unchanged. The completed build is in ${tempDirPath}`,
                { cause: error },
            )
        }
    }

    try {
        await renameWithRetry(renameDir, tempDirPath, outDirPath, retryDelayMs)
    } catch (error: unknown) {
        const message = getErrorMessage(error)

        if (!hadOutput) {
            throw new KnownError(
                `build: could not move the completed build into ${outDirPath} (${message}). The completed build is in ${tempDirPath}`,
                { cause: error },
            )
        }

        try {
            await renameWithRetry(renameDir, oldDirPath, outDirPath, retryDelayMs)
        } catch (restoreError: unknown) {
            throw new KnownError(
                `build: could not move the completed build into ${outDirPath} (${message}) nor restore the previous output (${getErrorMessage(restoreError)}). The previous output is in ${oldDirPath}; the completed build is in ${tempDirPath}`,
                { cause: error },
            )
        }

        throw new KnownError(
            `build: could not move the completed build into ${outDirPath} (${message}); the previous output was restored. The completed build is in ${tempDirPath}`,
            { cause: error },
        )
    }

    if (hadOutput) {
        try {
            await remove(oldDirPath)
        } catch (error: unknown) {
            log.warn(
                `build: could not remove previous output ${oldDirPath}: ${getErrorMessage(error)}`,
            )
        }
    }
}

/**
 * Deals with a previous-output backup left by a swap that crashed midway:
 * if `outDirPath` is missing, the backup is the last good output and is
 * moved back into place; otherwise it's stale and removed.
 *
 * @param {string} outDirPath - Absolute path to the configured output directory
 */
export async function recoverOldOutDir(outDirPath: string): Promise<void> {
    const oldDirPath = getBuildOldDirName(outDirPath)

    if (!(await pathExists(oldDirPath))) {
        return
    }

    if (await pathExists(outDirPath)) {
        await remove(oldDirPath)
        return
    }

    log.warn(`build: restoring previous output from interrupted build: ${oldDirPath}`)
    await rename(oldDirPath, outDirPath)
}

/**
 * Removes and recreates the build output directory, so every build starts
 * from a clean slate.
 *
 * @param {string} path - Absolute path to the output directory
 */
export async function reCreateOutDir(path: string): Promise<void> {
    await remove(path)
    await ensureDir(path)
}

/**
 * Discovery pass: walks `currentDir`, and for each `.css` file where
 * `output.css.bundling` is enabled, resolves its `@import` graph via
 * `bundleCss` and adds every non-entry input path to `ignoredFiles` — so
 * the processing pass (`walkFolder`) skips them instead of emitting them
 * as standalone output files. JS/TS files are never added, since JS/TS
 * bundling keeps one output file per source file. The bundle result is cached by resolved entry
 * path in `cssBundleCache`, so the processing pass's `processCss` can
 * reuse it instead of re-resolving the same `@import` graph from disk.
 *
 * @param {string} currentDir - Directory to scan (recurses into subdirectories)
 * @param {MinimazConfig} config - The loaded build configuration
 * @param {Set<string>} ignoredFiles - Mutated in place with resolved absolute paths to skip
 * @param {CssBundleCache} cssBundleCache - Mutated in place with each bundled entry's result
 */
export async function runDiscovery(
    currentDir: string,
    config: MinimazConfig,
    ignoredFiles: Set<string>,
    cssBundleCache: CssBundleCache,
): Promise<void> {
    const items = await getDirElements(currentDir)

    for (const item of items) {
        if (config.input.exclude.includes(item)) {
            continue
        }

        const fullPath = join(currentDir, item)

        if (await isDirectory(fullPath)) {
            await runDiscovery(fullPath, config, ignoredFiles, cssBundleCache)
            continue
        }

        const ext = extname(fullPath).toLowerCase()
        if (ext === '.css' && config.output.css.bundling) {
            const entry = resolve(fullPath)
            const bundleResult = await bundleCssForBuild(fullPath)
            cssBundleCache.set(entry, bundleResult)

            for (const inputPath of bundleResult.inputs) {
                const resolvedInput = resolve(inputPath)
                if (resolvedInput !== entry) {
                    ignoredFiles.add(resolvedInput)
                }
            }
        }
    }
}

/**
 * Dispatches a single file to the processor matching its extension, then
 * writes the result to `file.dest` (or, for `.ts`/`.tsx`, to `file.dest`
 * with the extension swapped to `.js`). Unrecognized extensions are
 * copied as-is.
 *
 * @param {File} file - The file to process
 * @param {MinimazConfig} config - The loaded build configuration
 * @param {CssBundleCache} cssBundleCache - Discovery pass's cached `bundleCss` results, keyed by resolved entry path
 */
export async function processFile(
    file: File,
    config: MinimazConfig,
    cssBundleCache: CssBundleCache,
): Promise<void> {
    switch (file.ext) {
        case '.css': {
            const content = await processCss(file, config, cssBundleCache)
            await outputFile(file.dest, content)
            break
        }
        case '.js': {
            const content = await processJs(file, config)
            await outputFile(file.dest, content)
            break
        }
        case '.ts':
        case '.tsx': {
            const content = await processTs(file, config)
            const jsDest = file.dest.replace(/\.(ts|tsx)$/i, '.js')
            await outputFile(jsDest, content)
            break
        }
        case '.html': {
            const content = await processHtml(file, config)
            await outputFile(file.dest, content)
            break
        }
        default:
            await ensureDir(dirname(file.dest))
            await copy(file.src, file.dest)
    }
}

/**
 * Processing pass: recursively walks `from`, applying `input.mapping`
 * (redirecting a top-level folder's contents to a different destination
 * under `to`, when `from` is `rootDir`) and `input.exclude` (skipping
 * matching names), reading + replacement-applying each processable
 * file's content, and dispatching it to `processFile`. Files in
 * `ignoredFiles` (populated by `runDiscovery`) are skipped.
 *
 * @param {string} from - Current source directory
 * @param {string} to - Current destination directory
 * @param {MinimazConfig} config - The loaded build configuration
 * @param {Set<string>} ignoredFiles - Absolute source paths to skip
 * @param {string} rootDir - The build's top-level input directory (mapping only applies at this level)
 * @param {CssBundleCache} cssBundleCache - Discovery pass's cached `bundleCss` results, keyed by resolved entry path
 */
export async function walkFolder(
    from: string,
    to: string,
    config: MinimazConfig,
    ignoredFiles: Set<string>,
    rootDir: string,
    cssBundleCache: CssBundleCache,
): Promise<void> {
    const items = await getDirElements(from)
    const isRootLevel = resolve(from) === resolve(rootDir)

    for (const item of items) {
        if (config.input.exclude.includes(item)) {
            continue
        }

        const fromPath = join(from, item)
        const resolvedFromPath = resolve(fromPath)

        if (ignoredFiles.has(resolvedFromPath)) {
            log.debug(`Skipping bundled dependency: ${resolvedFromPath}`)
            continue
        }

        const mappedValue = config.input.mapping[item]
        const nextToPath =
            isRootLevel && typeof mappedValue === 'string' ? join(to, mappedValue) : join(to, item)

        if (await isDirectory(fromPath)) {
            await walkFolder(fromPath, nextToPath, config, ignoredFiles, rootDir, cssBundleCache)
            continue
        }

        const ext = extname(fromPath).toLowerCase()
        let content = ''

        if (processableExtensions.has(ext)) {
            const raw = await readFile(fromPath, 'utf8')
            content = applyReplacements(raw, config.output.replace)
        }

        await processFile({ src: fromPath, dest: nextToPath, content, ext }, config, cssBundleCache)
    }
}

/**
 * Processes `input.externals`: remote (`http`-prefixed) sources are
 * logged and skipped; local sources not already in `ignoredFiles` are
 * copied/processed into `outDirPath` at their configured destination
 * (recursing via `walkFolder` when the source is a directory).
 *
 * @param {string} cwd - Directory externals' relative paths are resolved against
 * @param {string} rootDir - The build's real top-level input directory, so
 *   `input.mapping` (meant only for the main input tree) never fires
 *   inside an external directory
 * @param {string} outDirPath - The build output directory
 * @param {Record<string, string>} externals - Map of local-path-or-URL to destination
 * @param {MinimazConfig} config - The loaded build configuration
 * @param {Set<string>} ignoredFiles - Absolute source paths to skip
 * @param {CssBundleCache} cssBundleCache - Discovery pass's cached `bundleCss` results, keyed by resolved entry path
 */
export async function processExternals(
    cwd: string,
    rootDir: string,
    outDirPath: string,
    externals: Record<string, string>,
    config: MinimazConfig,
    ignoredFiles: Set<string>,
    cssBundleCache: CssBundleCache,
): Promise<void> {
    for (const [source, destination] of Object.entries(externals)) {
        if (isRemoteExternal(source)) {
            log.info(`Remote external: ${source} -> ${destination}`)
            continue
        }

        const fullPath = resolve(cwd, source)

        if (ignoredFiles.has(fullPath)) {
            continue
        }

        if (!(await pathExists(fullPath))) {
            log.warn(`External not found: ${source}`)
            continue
        }

        const targetPath = join(outDirPath, destination)

        if (await isDirectory(fullPath)) {
            await walkFolder(fullPath, targetPath, config, ignoredFiles, rootDir, cssBundleCache)
            continue
        }

        const ext = extname(fullPath).toLowerCase()
        let content = ''

        if (processableExtensions.has(ext)) {
            const raw = await readFile(fullPath, 'utf8')
            content = applyReplacements(raw, config.output.replace)
        }

        await processFile({ src: fullPath, dest: targetPath, content, ext }, config, cssBundleCache)
    }
}
