import { resolve } from 'node:path'
import { applyReplacements } from '@minimaz/core'
import { bundleCss, minifyCss } from '@minimaz/css'
import type { MinimazConfig } from '@minimaz/config'
import type { CssBundleCache, File } from '../types.js'

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
        const { code } = cached ?? (await bundleCss(file.src))
        content = applyReplacements(code, config.output.replace)
    } else {
        content = file.content
    }

    return config.output.css.minify ? minifyCss(content) : content
}
