import { resolve } from 'node:path'
import { loadConfig } from '@minimaz/config'
import { getDirElements } from '@minimaz/core'
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
 * @throws {Error} When `output.js.bundling` is `true` — JS/TS import-graph
 *   bundling isn't implemented yet.
 */
export async function build(cwd: string): Promise<void> {
    const config = await loadConfig(cwd)

    if (config.output.js.bundling) {
        throw new Error(
            'build: output.js.bundling is not supported yet — set it to false in minimaz.config.json',
        )
    }

    const inDirPath = resolve(cwd, config.input.dir)
    const outDirPath = resolve(cwd, config.output.dir)

    await reCreateOutDir(outDirPath)

    const dirElements = await getDirElements(inDirPath)
    if (dirElements.length === 0) {
        log.error(`Directory ${config.input.dir} is empty`)
        return
    }

    const ignoredFiles = new Set<string>()

    log.info('Discovery: starting')
    await runDiscovery(inDirPath, config, ignoredFiles)

    log.info('Processing: starting')
    await walkFolder(inDirPath, outDirPath, config, ignoredFiles, inDirPath)

    const externalKeys = Object.keys(config.input.externals)
    if (externalKeys.length > 0) {
        log.debug(`Processing ${externalKeys.length} external resources`)
        await processExternals(cwd, outDirPath, config.input.externals, config, ignoredFiles)
    }

    log.success(`Build completed. Output saved in ${config.output.dir}`)
}
