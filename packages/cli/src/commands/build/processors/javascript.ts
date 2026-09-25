import type { MinimazConfig } from '@minimaz/config'
import { minifyJs } from '@minimaz/js'
import { transpileTs } from '@minimaz/ts'
import type { File } from '../types.js'

/**
 * Processes a JavaScript file: minifies via `minifyJs` when
 * `output.js.minify` is enabled, otherwise passes `file.content` through
 * unchanged. JS/TS bundling is not supported — `build()` validates
 * `output.js.bundling` before this is ever called, so this function
 * doesn't re-check it.
 *
 * @param {File} file - The file being processed
 * @param {MinimazConfig} config - The loaded build configuration
 * @returns {string} The final JS content to write to `file.dest`
 */
export function processJs(file: File, config: MinimazConfig): string {
    return config.output.js.minify ? minifyJs(file.content) : file.content
}

/**
 * Processes a TypeScript/TSX file: transpiles via `transpileTs` (stripping
 * types, transforming JSX for `.tsx`), then optionally minifies via
 * `minifyJs` when `output.js.minify` is enabled.
 *
 * @param {File} file - The file being processed (`file.ext` is `.ts` or `.tsx`)
 * @param {MinimazConfig} config - The loaded build configuration
 * @returns {string} The final JS content to write (caller is responsible for using a `.js` destination path)
 */
export function processTs(file: File, config: MinimazConfig): string {
    const transpiled = transpileTs(file.content, { jsx: file.ext === '.tsx' })

    return config.output.js.minify ? minifyJs(transpiled) : transpiled
}
