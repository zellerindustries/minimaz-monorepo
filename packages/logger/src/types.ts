/**
 * Supported log levels for the logging system.
 *
 * Ordered by typical severity:
 * - error: critical failures
 * - warn: non-blocking issues
 * - success: successful operations
 * - info: general runtime information
 * - debug: verbose diagnostic output
 */
export type LogType = 'error' | 'warn' | 'success' | 'info' | 'debug'

/** A logger bound to one context label, as returned by `createLogger`. */
export interface Logger {
    /** Diagnostic output, shown only when `VERBOSE=true`. */
    debug: (message: string | string[]) => void
    /** Unstyled `[context] message` output, always shown. */
    default: (message: string | string[]) => void
    error: (message: string | string[]) => void
    info: (message: string | string[]) => void
    success: (message: string | string[]) => void
    /** Unstyled `[context] message` output, shown only when `VERBOSE=true`. */
    verbose: (message: string | string[]) => void
    warn: (message: string | string[]) => void
}
