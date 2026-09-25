import type { LogType } from './types.js'

// Built once at module load, not per call — emit() is on the hot path and
// string-building a prefix on every log line would be wasted work.
export const prefix: Record<LogType, string> = {
    error: '\x1b[31m[ --- ERROR ----- ]\t\x1b[0m',
    warn: '\x1b[33m[ --- WARN ------ ]\t\x1b[0m',
    success: '\x1b[32m[ --- SUCCESS --- ]\t\x1b[0m',
    info: '\x1b[34m[ --- INFO ------ ]\t\x1b[0m',
    debug: '\x1b[90m[ --- DEBUG ----- ]\t\x1b[0m',
}

/**
 * Formats a date as `YYYY-MM-DD HH:MM:SS` (local time, zero-padded).
 *
 * @param {Date} [date] - Date to format; defaults to now
 * @returns {string} The formatted timestamp
 */
export function formatTs(date: Date = new Date()): string {
    const pad = (n: number): string => (n < 10 ? `0${String(n)}` : String(n))

    const y = date.getFullYear()
    const m = pad(date.getMonth() + 1)
    const d = pad(date.getDate())
    const h = pad(date.getHours())
    const min = pad(date.getMinutes())
    const s = pad(date.getSeconds())

    return `${String(y)}-${m}-${d} ${h}:${min}:${s}`
}

/**
 * Reads the `VERBOSE` env var to decide whether verbose-only output and
 * timestamps should be shown. Read live (not cached) so it reflects
 * changes made to `process.env` at runtime, e.g. in tests.
 *
 * @returns {boolean} `true` if `VERBOSE` is exactly the string `'true'`
 */
export const isVerbose = (): boolean => process.env['VERBOSE'] === 'true'

/**
 * Normalizes a single message or array of messages into an array, so
 * callers can always iterate uniformly.
 *
 * @param {string | string[]} message - A message or list of messages
 * @returns {string[]} The message(s) as an array
 */
export function normalize(message: string | string[]): string[] {
    return Array.isArray(message) ? message : [message]
}

/**
 * Formats a context tag (e.g. a module/subsystem name) wrapped in cyan
 * ANSI color codes, with a trailing space for direct concatenation.
 *
 * @param {string} context - The context label to render
 * @returns {string} The colorized, space-suffixed context tag
 */
export function formatContext(context: string): string {
    return `\x1b[36m[${context}]\x1b[0m `
}

/**
 * Writes a single prefixed, colorized log line to the console method that
 * matches its type (`console.error` for errors, `console.warn` for
 * warnings, `console.log` for everything else).
 *
 * @param {LogType} type - The log level, selecting the prefix/color and output stream
 * @param {string} message - The message text to print
 * @param {string} context - The context label to tag the line with
 * @returns {void}
 */
export function print(type: LogType, message: string, context: string): void {
    const output = prefix[type] + formatContext(context) + message

    if (type === 'error') {
        console.error(output)
        return
    }

    if (type === 'warn') {
        console.warn(output)
        return
    }

    console.log(output)
}

/**
 * Renders a bracketed timestamp prefix, but only when verbose mode is on —
 * callers can unconditionally prepend the result without an extra
 * `isVerbose()` check of their own.
 *
 * @returns {string} `[YYYY-MM-DD HH:MM:SS] ` when verbose, else `''`
 */
export function ts(): string {
    const verbose = isVerbose()
    if (!verbose) {
        return ''
    }
    return `[${formatTs()}] `
}

/**
 * Central dispatch for all log calls: normalizes the message(s), applies
 * verbose gating, and routes each line either through the colorized
 * `print` path or a plain, prefix-free `console.log` (used for the default/
 * verbose "no type prefix" output modes).
 *
 * @param {LogType} type - The log level to emit at
 * @param {string | string[]} message - A message or list of messages to emit, one per line
 * @param {string} context - The context label to tag each line with
 * @param {boolean} [noPrefix=false] - Skip the colorized type prefix and print a plain `[context] message` line instead
 * @param {boolean} [forceVerboseOnly=false] - Suppress this call entirely unless verbose mode is on
 * @returns {void}
 */
export function emit(
    type: LogType,
    message: string | string[],
    context: string,
    noPrefix = false,
    forceVerboseOnly = false,
): void {
    const verbose = isVerbose()

    if (forceVerboseOnly && !verbose) {
        return
    }

    const msgs: string[] = normalize(message)

    for (const line of msgs) {
        if (noPrefix) {
            console.log(verbose ? `${ts()}[${context}] ${line}` : `[${context}] ${line}`)

            continue
        }

        print(type, line, context)
    }
}
