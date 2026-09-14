import { applyReplacements } from '@minimaz/core'
import { bundleCss, minifyCss } from '@minimaz/css'
import type { MinimazConfig } from '@minimaz/config'
import type { File } from '../types.js'

/**
 * Processes a CSS file: inlines `@import`s via `bundleCss` when
 * `output.css.bundling` is enabled (applying `output.replace` a second
 * time to the bundled result, since `bundleCss` reads dependency files
 * fresh from disk), otherwise passes `file.content` through unchanged.
 * Minifies via `minifyCss` when `output.css.minify` is enabled.
 *
 * @param {File} file - The file being processed
 * @param {MinimazConfig} config - The loaded build configuration
 * @returns {Promise<string>} The final CSS content to write to `file.dest`
 */
export async function processCss(file: File, config: MinimazConfig): Promise<string> {
    let content: string

    if (config.output.css.bundling) {
        const { code } = await bundleCss(file.src)
        content = applyReplacements(code, config.output.replace)
    } else {
        content = file.content
    }

    return config.output.css.minify ? minifyCss(content) : content
}
