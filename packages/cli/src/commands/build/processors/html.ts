import type { MinimazConfig } from '@minimaz/config'
import { minifyHtml } from '@minimaz/html'
import type { File } from '../types.js'

/**
 * Processes an HTML file: minifies via `minifyHtml` when
 * `output.html.minify` is enabled, otherwise passes `file.content`
 * through unchanged.
 *
 * @param {File} file - The file being processed
 * @param {MinimazConfig} config - The loaded build configuration
 * @returns {Promise<string>} The final HTML content to write to `file.dest`
 */
export async function processHtml(file: File, config: MinimazConfig): Promise<string> {
    return config.output.html.minify ? await minifyHtml(file.content) : file.content
}
