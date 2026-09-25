import { resolve } from 'node:path'
import { isPathInside, pathExists, pathsOverlap, remove } from '@minimaz/core'
import { loadConfig } from '@minimaz/config'
import { KnownError, log } from '@minimaz/logger'
import { isRemoteExternal } from '../build/core.js'

/**
 * Removes the configured build output directory.
 *
 * @param {string} cwdArg - Directory to look for `minimaz.config.json` in
 *   (a relative path resolves against `process.cwd()`); `output.dir` is
 *   resolved relative to it.
 * @throws {KnownError} When the resolved output directory isn't strictly
 *   inside `cwd` (refuses to ever delete the project root, an ancestor of
 *   it, or an unrelated directory), or when it equals, contains, or is
 *   nested inside `input.dir` or a local `input.externals` source.
 */
export async function clear(cwdArg: string): Promise<void> {
    const cwd = resolve(cwdArg)
    const config = await loadConfig(cwd)
    const inputDir = resolve(cwd, config.input.dir)
    const outputDir = resolve(cwd, config.output.dir)

    if (!isPathInside(outputDir, cwd)) {
        throw new KnownError(`Refusing to delete unsafe directory: ${outputDir}`)
    }

    if (pathsOverlap(outputDir, inputDir)) {
        throw new KnownError(
            `Refusing to delete output directory that overlaps input directory: ${outputDir}`,
        )
    }

    for (const source of Object.keys(config.input.externals)) {
        if (isRemoteExternal(source)) {
            continue
        }

        if (pathsOverlap(outputDir, resolve(cwd, source))) {
            throw new KnownError(
                `Refusing to delete output directory that overlaps external "${source}": ${outputDir}`,
            )
        }
    }

    if (!(await pathExists(outputDir))) {
        log.debug(`No output directory found: ${outputDir}`)
        return
    }

    await remove(outputDir)
    log.success('Output directory removed')
}
