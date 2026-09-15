import { resolve } from 'node:path'
import { isPathInside, pathExists, remove } from '@minimaz/core'
import { loadConfig } from '@minimaz/config'
import { KnownError } from '@minimaz/errors'
import { log } from '@minimaz/logger'

/**
 * Removes the configured build output directory.
 *
 * @param {string} cwd - Directory to look for `minimaz.config.json` in;
 *   `output.dir` is resolved relative to it.
 * @throws {KnownError} When the resolved output directory isn't strictly
 *   inside `cwd` (refuses to ever delete the project root, an ancestor of
 *   it, or an unrelated directory).
 */
export async function clear(cwd: string): Promise<void> {
    const config = await loadConfig(cwd)
    const outputDir = resolve(cwd, config.output.dir)

    if (!isPathInside(outputDir, cwd)) {
        throw new KnownError(`Refusing to delete unsafe directory: ${outputDir}`)
    }

    if (!(await pathExists(outputDir))) {
        log.debug(`No output directory found: ${outputDir}`)
        return
    }

    await remove(outputDir)
    log.success('Output directory removed')
}
