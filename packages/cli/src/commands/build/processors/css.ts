import { resolve } from 'node:path'
import { applyReplacements } from '@minimaz/core'
import { bundleCss, minifyCss } from '@minimaz/css'
import { KnownError } from '@minimaz/logger'
import type { MinimazConfig } from '@minimaz/config'
import type { CssBundleCache, File } from '../types.js'
import { rethrowPrefixedAsKnown } from './errors.js'

/**
 * Runs `bundleCss`, re-throwing its deliberate failures (errors whose message
 * starts with `bundleCss:` — a missing or circular `@import`, an unsupported
 * `supports()`/`layer` import) as `KnownError`s with the original error as
 * `cause` — they are mistakes in the user's stylesheets, not bugs. Any other
 * rejection is an internal bug and is rethrown unchanged. `@minimaz/css` stays
 * free of a logger dependency, so the classification happens here at the CLI
 * boundary.
 *
 * @param {string} entryPath - Path to the entry CSS file
 * @returns {Promise<{ code: string; inputs: string[] }>} `bundleCss`'s result
 * @throws {KnownError} If `bundleCss` rejects with one of its own `bundleCss:` errors
 */
export async function bundleCssForBuild(
    entryPath: string,
): Promise<{ code: string; inputs: string[] }> {
    try {
        return await bundleCss(entryPath)
    } catch (error: unknown) {
        if (error instanceof KnownError) {
            throw error
        }
        // Only bundleCss's own deliberate throws carry this prefix; anything
        // else is an internal bug and must keep its bug-report hint and stack.
        return rethrowPrefixedAsKnown(error, 'bundleCss:')
    }
}

/**
 * Processes a CSS file: inlines `@import`s when `output.css.bundling` is
 * enabled (applying `output.replace` a second time to the bundled result,
 * since `bundleCss` reads dependency files fresh from disk), otherwise
 * passes `file.content` through unchanged. Minifies via `minifyCss` when
 * `output.css.minify` is enabled.
 *
 * The bundle itself is looked up in `cssBundleCache` (populated by the
 * discovery pass's `runDiscovery`, keyed by resolved entry path) instead
 * of calling `bundleCss` again — the discovery pass already resolved and
 * read this entry's whole `@import` graph from disk once.
 *
 * @param {File} file - The file being processed
 * @param {MinimazConfig} config - The loaded build configuration
 * @param {CssBundleCache} cssBundleCache - Discovery pass's cached `bundleCss` results, keyed by resolved entry path
 * @returns {Promise<string>} The final CSS content to write to `file.dest`
 */
export async function processCss(
    file: File,
    config: MinimazConfig,
    cssBundleCache: CssBundleCache,
): Promise<string> {
    let content: string

    if (config.output.css.bundling) {
        const cached = cssBundleCache.get(resolve(file.src))
        const { code } = cached ?? (await bundleCssForBuild(file.src))
        content = applyReplacements(code, config.output.replace)
    } else {
        content = file.content
    }

    return config.output.css.minify ? minifyCss(content) : content
}
