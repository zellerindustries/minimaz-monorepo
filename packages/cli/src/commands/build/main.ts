import { resolve } from 'node:path'
import { loadConfig } from '@minimaz/config'
import { getDirElements } from '@minimaz/core'
import { KnownError } from '@minimaz/errors'
import { log } from '@minimaz/logger'
import { processExternals, reCreateOutDir, runDiscovery, walkFolder } from './core.js'

/**
 * Builds the project according to `minimaz.config.json`, using a two-pass
 * strategy: a discovery pass finds CSS partials consumed via `@import` (so
 * they're excluded from standalone output), then a processing pass writes
 * every remaining file to `output.dir`, dispatched by extension. Finally,
 * `input.externals` are copied/processed in.
 *
 * @param {string} cwd - Directory to look for `minimaz.config.json` in;
 *   `input.dir`/`output.dir` are resolved relative to it.
 * @throws {KnownError} When `output.js.bundling` is `true` (JS/TS
 *   import-graph bundling isn't implemented yet), or when the resolved
 *   `output.dir` is `cwd` itself or a parent of it (refuses to ever
 *   delete the project root).
 */
export async function build(cwd: string): Promise<void> {
    const config = await loadConfig(cwd)

    if (config.output.js.bundling) {
        throw new KnownError(
            'build: output.js.bundling is not supported yet — set it to false in minimaz.config.json',
        )
    }

    const inDirPath = resolve(cwd, config.input.dir)
    const outDirPath = resolve(cwd, config.output.dir)

    if (outDirPath === cwd || outDirPath.length <= cwd.length) {
        throw new KnownError(`build: refusing to delete unsafe output directory: ${outDirPath}`)
    }

    const dirElements = await getDirElements(inDirPath)
    if (dirElements.length === 0) {
        log.error(`Directory ${config.input.dir} is empty`)
        return
    }

    await reCreateOutDir(outDirPath)

    const ignoredFiles = new Set<string>()

    log.info('Discovery: starting')
    await runDiscovery(inDirPath, config, ignoredFiles)

    log.info('Processing: starting')
    await walkFolder(inDirPath, outDirPath, config, ignoredFiles, inDirPath)

    const externalKeys = Object.keys(config.input.externals)
    if (externalKeys.length > 0) {
        log.debug(`Processing ${externalKeys.length} external resources`)
        await processExternals(
            cwd,
            inDirPath,
            outDirPath,
            config.input.externals,
            config,
            ignoredFiles,
        )
    }

    log.success(`Build completed. Output saved in ${config.output.dir}`)
}
