import { resolve } from 'node:path'
import { loadConfig } from '@minimaz/config'
import { getDirElements, isPathInside, pathsOverlap, remove } from '@minimaz/core'
import { KnownError, log } from '@minimaz/logger'
import {
    getBuildOldDirName,
    getBuildTempDirName,
    isRemoteExternal,
    processExternals,
    reCreateOutDir,
    recoverOldOutDir,
    replaceOutDir,
    runDiscovery,
    walkFolder,
} from './core.js'

import type { MinimazConfig } from '@minimaz/config'
import type { CssBundleCache } from './types.js'

/**
 * Builds the project according to `minimaz.config.json`, using a two-pass
 * strategy: a discovery pass finds CSS partials consumed via `@import` (so
 * they're excluded from standalone output), then a processing pass writes
 * every remaining file to `output.dir`, dispatched by extension. Finally,
 * `input.externals` are copied/processed in. Everything is written to a
 * sibling temp directory (`<output.dir>.minimaz-tmp`) first; `output.dir` is
 * only replaced once the whole build succeeds, so a failed build leaves the
 * previous output untouched and removes the temp directory.
 *
 * @param {string} cwdArg - Directory to look for `minimaz.config.json` in
 *   (a relative path resolves against `process.cwd()`); `input.dir`/
 *   `output.dir` are resolved relative to it.
 * @throws {KnownError} When the resolved `output.dir` isn't strictly inside
 *   `cwd` (refuses to ever delete the project root, an ancestor of it, or an
 *   unrelated directory), when `output.dir` equals, contains, or is nested
 *   inside `input.dir` or a local `input.externals` source, when the temp
 *   directory overlaps either of those, when `input.dir` is missing or
 *   empty, when a relative import or relative dynamic import in bundled JS/TS
 *   can't be resolved, or when swapping the finished build into
 *   `output.dir` fails (the message names the temp directory still holding
 *   it).
 */
export async function build(cwdArg: string): Promise<void> {
    const cwd = resolve(cwdArg)
    const config = await loadConfig(cwd, { initCommand: 'minimaz init' })

    const inDirPath = resolve(cwd, config.input.dir)
    const outDirPath = resolve(cwd, config.output.dir)

    if (!isPathInside(outDirPath, cwd)) {
        throw new KnownError(`build: refusing to delete unsafe output directory: ${outDirPath}`)
    }

    if (pathsOverlap(outDirPath, inDirPath)) {
        throw new KnownError(
            `build: refusing output directory that overlaps input directory: ${outDirPath}`,
        )
    }

    // Both are siblings of outDirPath, so inside cwd by construction; checked
    // anyway since build deletes them.
    const scratchDirs = [
        { label: 'temp', path: getBuildTempDirName(outDirPath) },
        { label: 'backup', path: getBuildOldDirName(outDirPath) },
    ]

    for (const { label, path } of scratchDirs) {
        if (!isPathInside(path, cwd)) {
            throw new KnownError(`build: refusing to delete unsafe ${label} directory: ${path}`)
        }

        if (pathsOverlap(path, inDirPath)) {
            throw new KnownError(
                `build: refusing ${label} directory that overlaps input directory: ${path}`,
            )
        }
    }

    for (const source of Object.keys(config.input.externals)) {
        if (isRemoteExternal(source)) {
            continue
        }

        const sourcePath = resolve(cwd, source)

        if (pathsOverlap(outDirPath, sourcePath)) {
            throw new KnownError(
                `build: refusing output directory that overlaps external "${source}": ${outDirPath}`,
            )
        }

        for (const { label, path } of scratchDirs) {
            if (pathsOverlap(path, sourcePath)) {
                throw new KnownError(
                    `build: refusing ${label} directory that overlaps external "${source}": ${path}`,
                )
            }
        }
    }

    const dirElements = await getDirElements(inDirPath)
    if (dirElements.length === 0) {
        throw new KnownError(`build: input directory is missing or empty: ${inDirPath}`)
    }

    await recoverOldOutDir(outDirPath)

    const tempDirPath = getBuildTempDirName(outDirPath)

    // Also clears a stale temp dir left by a crashed previous build.
    await reCreateOutDir(tempDirPath)

    try {
        await buildInto(cwd, inDirPath, tempDirPath, config)
    } catch (error: unknown) {
        await removeTempDir(tempDirPath)
        throw error
    }

    await replaceOutDir(tempDirPath, outDirPath)

    log.success(`Build completed. Output saved in ${config.output.dir}`)
}

/**
 * Runs the discovery and processing passes plus externals, writing to `outDirPath`.
 *
 * @param {string} cwd - Project directory externals resolve against
 * @param {string} inDirPath - Absolute input directory
 * @param {string} outDirPath - Absolute directory to write output into
 * @param {MinimazConfig} config - The loaded build configuration
 */
async function buildInto(
    cwd: string,
    inDirPath: string,
    outDirPath: string,
    config: MinimazConfig,
): Promise<void> {
    const ignoredFiles = new Set<string>()
    const cssBundleCache: CssBundleCache = new Map()

    log.info('Discovery: starting')
    await runDiscovery(inDirPath, config, ignoredFiles, cssBundleCache)

    log.info('Processing: starting')
    await walkFolder(inDirPath, outDirPath, config, ignoredFiles, inDirPath, cssBundleCache)

    const externalKeys = Object.keys(config.input.externals)
    if (externalKeys.length > 0) {
        log.debug(`Processing ${String(externalKeys.length)} external resources`)
        await processExternals(
            cwd,
            inDirPath,
            outDirPath,
            config.input.externals,
            config,
            ignoredFiles,
            cssBundleCache,
        )
    }
}

/**
 * Best-effort removal of a failed build's temp directory; a cleanup failure
 * is logged rather than thrown so it never masks the build error.
 *
 * @param {string} tempDirPath - Absolute temp directory path
 */
async function removeTempDir(tempDirPath: string): Promise<void> {
    try {
        await remove(tempDirPath)
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        log.warn(`build: could not remove temp directory ${tempDirPath}: ${message}`)
    }
}
