import { resolve } from 'node:path'
import { loadConfig } from '@minimaz/config'
import { pathExists } from '@minimaz/core'
import { KnownError, log } from '@minimaz/logger'
import { startLocalServer } from '@minimaz/local-server'

/**
 * Options for {@link serve}.
 */
export interface ServeCommandOptions {
    /** Whether to keep the process alive listening for SIGINT/SIGTERM. Defaults to true; set to false in tests. */
    keepAlive?: boolean
}

/**
 * Starts a local HTTP server on the configured build output directory,
 * using every `serve.*` field from `minimaz.config.json` for behavior
 * (clean URLs, SPA fallback, directory listing, cache-control) and binding.
 *
 * @param {string} cwdArg - Directory to look for `minimaz.config.json` in
 *   (a relative path resolves against `process.cwd()`); `output.dir` is
 *   resolved relative to it.
 * @param {ServeCommandOptions} [options] - Command-level options, distinct
 *   from the server's own `minimaz.config.json`-sourced options
 * @returns {Promise<void>} Resolves once the server has stopped (or
 *   immediately after starting, when `options.keepAlive` is `false`)
 * @throws {KnownError} When the configured `output.dir` does not exist —
 *   run `minimaz build` first.
 */
export async function serve(cwdArg: string, options: ServeCommandOptions = {}): Promise<void> {
    const keepAlive = options.keepAlive ?? true
    const cwd = resolve(cwdArg)
    const config = await loadConfig(cwd)
    const outDirPath = resolve(cwd, config.output.dir)

    if (!(await pathExists(outDirPath))) {
        throw new KnownError(
            `serve: output directory does not exist: ${outDirPath}\nRun "minimaz build" first.`,
        )
    }

    const handle = await startLocalServer({
        dir: outDirPath,
        port: config.serve.port,
        host: config.serve.host,
        liveReload: config.serve.liveReload,
        cleanUrls: config.serve.cleanUrls,
        singlePageApp: config.serve.singlePageApp,
        directoryListing: config.serve.directoryListing,
        cacheControl: config.serve.cacheControl,
    })

    log.success(`Serving ${config.output.dir} at ${handle.url}`)

    if (!keepAlive) {
        await handle.close()
        return
    }

    await new Promise<void>((resolveServe) => {
        const shutdown = (): void => {
            handle
                .close()
                .then(() => {
                    resolveServe()
                })
                .catch(() => {
                    resolveServe()
                })
        }
        process.once('SIGINT', shutdown)
        process.once('SIGTERM', shutdown)
    })
}
