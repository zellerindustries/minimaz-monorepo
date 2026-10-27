import { BundlerError, resolveFileImports } from '@minimaz/bundler'
import type { MinimazConfig } from '@minimaz/config'
import { minifyJs } from '@minimaz/js'
import { KnownError } from '@minimaz/logger'
import { transpileTs } from '@minimaz/ts'
import type { File } from '../types.js'
import { rethrowPrefixedAsKnown } from './errors.js'

/**
 * Re-throws a `transpileTs` syntax-diagnostics error (message starting with
 * `transpileTs: syntax error`) as a `KnownError` naming the source file, with
 * the original error as `cause` — a mistake in the user's TypeScript, not a
 * bug. Anything else (including `transpileTs`'s own misuse errors) is rethrown
 * unchanged.
 *
 * @param {unknown} error - The caught value
 * @param {string} filePath - Path to the source file that was being transpiled
 * @returns {never} Always throws
 * @throws {KnownError} If `error` is a `transpileTs` syntax error
 */
function rethrowTsSyntaxError(error: unknown, filePath: string): never {
    return rethrowPrefixedAsKnown(error, 'transpileTs: syntax error', filePath)
}

/**
 * Runs `minifyJs`, re-throwing its `minifyJs: …` errors (an unterminated
 * string, template literal, regex or block comment — a mistake in the user's
 * source, not a bug) as a `KnownError` naming the source file, with the
 * original error as `cause`. Anything else is rethrown unchanged.
 *
 * @param {string} content - JavaScript to minify
 * @param {string} filePath - Path to the source file the content came from
 * @returns {string} The minified JavaScript
 * @throws {KnownError} If `minifyJs` rejects the source as malformed
 */
function minifyForBuild(content: string, filePath: string): string {
    try {
        return minifyJs(content)
    } catch (error: unknown) {
        return rethrowPrefixedAsKnown(error, 'minifyJs:', filePath)
    }
}

/**
 * Runs `resolveFileImports`, re-throwing its `BundlerError`s (an unresolvable
 * relative import, a malformed specifier — mistakes in the user's source, not
 * bugs) as `KnownError`s with the original error as `cause`. TypeScript syntax
 * errors raised while it transpiles are converted the same way. Any other
 * rejection is an internal bug and is rethrown unchanged. `@minimaz/bundler`
 * stays free of a logger dependency, so the classification happens here at the
 * CLI boundary.
 *
 * @param {string} filePath - Path to the JS/TS file whose imports are rewritten
 *   (decides transpilation and the resolution base)
 * @param {string} source - The file's text to process, with `output.replace` already applied
 * @returns {Promise<string>} The file's JavaScript with relative import specifiers rewritten
 * @throws {KnownError} If `resolveFileImports` rejects with a `BundlerError`
 */
export async function resolveFileImportsForBuild(
    filePath: string,
    source: string,
): Promise<string> {
    try {
        return await resolveFileImports(filePath, source)
    } catch (error: unknown) {
        if (error instanceof BundlerError) {
            throw new KnownError(error.message, { cause: error })
        }
        return rethrowTsSyntaxError(error, filePath)
    }
}

/**
 * Processes a JavaScript file. When `output.js.bundling` is enabled, relative
 * import specifiers in `file.content` (which already has `output.replace`
 * applied) are rewritten via `resolveFileImports`, otherwise `file.content`
 * passes through unchanged. Minifies via `minifyJs` when `output.js.minify` is
 * enabled.
 *
 * @param {File} file - The file being processed
 * @param {MinimazConfig} config - The loaded build configuration
 * @returns {Promise<string>} The final JS content to write to `file.dest`
 * @throws {KnownError} When bundling is enabled and an import can't be resolved, or
 *   minification meets an unterminated string, template literal, regex or block comment
 */
export async function processJs(file: File, config: MinimazConfig): Promise<string> {
    const content = config.output.js.bundling
        ? await resolveFileImportsForBuild(file.src, file.content)
        : file.content

    return config.output.js.minify ? minifyForBuild(content, file.src) : content
}

/**
 * Processes a TypeScript/TSX file. When `output.js.bundling` is enabled,
 * `resolveFileImports` transpiles `file.content` (which already has
 * `output.replace` applied) and rewrites relative import specifiers; otherwise
 * it is transpiled via `transpileTs` (stripping types, transforming JSX for
 * `.tsx`). Minifies via `minifyJs` when `output.js.minify` is enabled.
 *
 * @param {File} file - The file being processed (`file.ext` is `.ts` or `.tsx`)
 * @param {MinimazConfig} config - The loaded build configuration
 * @returns {Promise<string>} The final JS content to write (caller is responsible for using a `.js` destination path)
 * @throws {KnownError} When bundling is enabled and an import can't be resolved, the
 *   source has a TypeScript syntax error, or minification meets an unterminated literal or comment
 */
export async function processTs(file: File, config: MinimazConfig): Promise<string> {
    let content: string
    if (config.output.js.bundling) {
        content = await resolveFileImportsForBuild(file.src, file.content)
    } else {
        try {
            content = transpileTs(file.content, { jsx: file.ext === '.tsx' })
        } catch (error: unknown) {
            return rethrowTsSyntaxError(error, file.src)
        }
    }

    return config.output.js.minify ? minifyForBuild(content, file.src) : content
}
