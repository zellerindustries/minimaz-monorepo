import { log } from '@minimaz/logger'

/**
 * Marker base class for errors a CLI command anticipated — bad input, a
 * missing file, a failed validation — as opposed to an unexpected bug.
 * Carries no behavior of its own; only identity, checked via `instanceof`
 * in {@link handleCliError}.
 */
export class KnownError extends Error {}

/**
 * Top-level CLI error handler. Classifies `error` as known (anticipated)
 * or unexpected, logs it accordingly through `@minimaz/logger`, and sets
 * `process.exitCode = 1`.
 *
 * @param {unknown} error - The value caught at a CLI entry point's
 *   top-level try/catch
 * @returns {void}
 */
export function handleCliError(error: unknown): void {
    if (error instanceof KnownError) {
        log.error(error.message)

        if ('errors' in error && Array.isArray(error.errors)) {
            for (const detail of error.errors as unknown[]) {
                log.error(`\t-> ${String(detail)}`)
            }
        }

        process.exitCode = 1
        return
    }

    const bugHint = 'This looks like a bug — please report it.'

    if (error instanceof Error) {
        log.error([error.stack ?? error.message, bugHint])
    } else {
        log.error([String(error), bugHint])
    }

    process.exitCode = 1
}
