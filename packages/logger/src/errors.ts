import { isVerbose } from './core.js'
import { log } from './main.js'

/**
 * Marker base class for errors a CLI command anticipated — bad input, a
 * missing file, a failed validation — as opposed to an unexpected bug.
 * Carries no behavior of its own; only identity, checked via `instanceof`
 * in {@link handleCliError}.
 */
export class KnownError extends Error {}

/**
 * Top-level CLI error handler. Classifies `error` as known (anticipated)
 * or unexpected, logs it accordingly through this package's `log`, and sets
 * `process.exitCode = 1`. An unexpected error's stack trace is shown only in
 * verbose mode (the CLI's `--verbose`) or with `DEBUG=true`; otherwise a hint
 * on how to get it is logged instead.
 *
 * @param {unknown} error - The value caught at a CLI entry point's
 *   top-level try/catch
 * @returns {void}
 */
export function handleCliError(error: unknown): void {
    if (error instanceof KnownError) {
        log.error(error.message)
        logErrorDetails(error)
        process.exitCode = 1
        return
    }

    const bugHint = 'This looks like a bug — please report it.'
    const showStack = isVerbose() || process.env['DEBUG'] === 'true'
    const stackHint = 'Re-run with --verbose (or DEBUG=true) for a stack trace.'

    if (error instanceof Error) {
        const message = showStack ? (error.stack ?? error.message) : error.message
        log.error(showStack ? [message, bugHint] : [message, bugHint, stackHint])
        logErrorDetails(error)
    } else {
        log.error([String(error), bugHint])
    }

    process.exitCode = 1
}

/**
 * Logs each entry of an `errors: string[]`-style detail array attached to
 * `error`, if it has one — regardless of whether `error` is a `KnownError`
 * or a plain `Error` that happens to carry the same shape.
 *
 * @param {Error} error - The error to check for an `errors` array
 * @returns {void}
 */
function logErrorDetails(error: Error): void {
    if ('errors' in error && Array.isArray(error.errors)) {
        for (const detail of error.errors as unknown[]) {
            log.error(`\t-> ${String(detail)}`)
        }
    }
}
