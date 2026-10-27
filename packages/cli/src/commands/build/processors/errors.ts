import { KnownError } from '@minimaz/logger'

/**
 * Re-throws a library's deliberate failure (an `Error` whose message starts
 * with `prefix`) as a `KnownError` with the original error as `cause` — a
 * mistake in the user's source, not a bug. When `filePath` is given, the
 * message is prefixed with `<filePath>: `. Anything else is rethrown
 * unchanged.
 *
 * @param {unknown} error - The caught value
 * @param {string} prefix - Message prefix identifying the library's own deliberate throws
 * @param {string} [filePath] - Source file to name in the `KnownError` message
 * @returns {never} Always throws
 * @throws {KnownError} If `error` is an `Error` whose message starts with `prefix`
 */
export function rethrowPrefixedAsKnown(error: unknown, prefix: string, filePath?: string): never {
    if (error instanceof Error && error.message.startsWith(prefix)) {
        const message = filePath === undefined ? error.message : `${filePath}: ${error.message}`
        throw new KnownError(message, { cause: error })
    }
    throw error
}
