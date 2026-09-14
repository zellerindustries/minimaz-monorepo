import { resolve } from 'node:path'
import { pathExists, remove } from '@minimaz/core'
import { loadConfig } from '@minimaz/config'
import { KnownError } from '@minimaz/errors'
import { log } from '@minimaz/logger'

/**
 * Removes the configured build output directory.
 *
 * @param {string} cwd - Directory to look for `minimaz.config.json` in;
 *   `output.dir` is resolved relative to it.
 * @throws {Error} When the resolved output directory is `cwd` itself, or
 *   no longer than it — refuses to ever delete the project root.
 */
export async function clear(cwd: string): Promise<void> {
    const config = await loadConfig(cwd)
    const outputDir = resolve(cwd, config.output.dir)

    if (outputDir === cwd || outputDir.length <= cwd.length) {
        throw new KnownError(`Refusing to delete unsafe directory: ${outputDir}`)
    }

    if (!(await pathExists(outputDir))) {
        log.debug(`No output directory found: ${outputDir}`)
        return
    }

    await remove(outputDir)
    log.success('Output directory removed')
}
