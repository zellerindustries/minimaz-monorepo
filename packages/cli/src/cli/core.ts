import { createInterface } from 'node:readline'
import spawn from 'cross-spawn'
import type { ChildProcess } from 'node:child_process'
import { log } from '@minimaz/logger'
import type { Args } from './types.js'

/**
 * Parses raw CLI arguments into positional args (`_`) and flags.
 *
 * Supports `--key=value`, `--key value`, and bare boolean flags. Flag
 * *names* are lowercased for consistent lookup; values and positional
 * arguments are left as-is, since a file path (e.g. `--path=/File.CSS`)
 * must survive with its original case on a case-sensitive filesystem.
 *
 * @param {string[]} rawArgs - Raw CLI arguments (`process.argv.slice(2)`)
 * @returns {Args} Parsed argument object
 */
export function parseArgs(rawArgs: string[]): Args {
    const args: Args = { _: [] }

    for (let i = 0; i < rawArgs.length; i++) {
        const arg = rawArgs[i]
        if (arg === undefined) {
            continue
        }

        if (!arg.startsWith('-')) {
            args._.push(arg)
            continue
        }

        if (arg.startsWith('--') && arg.includes('=')) {
            const withoutDashes = arg.slice(2)
            const eqIndex = withoutDashes.indexOf('=')
            const key = withoutDashes.slice(0, eqIndex).toLowerCase()
            const value = withoutDashes.slice(eqIndex + 1)
            args[key] = value
            continue
        }

        const key = arg.replace(/^-+/, '').toLowerCase()
        const next = rawArgs[i + 1]

        if (next !== undefined && !next.startsWith('-')) {
            args[key] = next
            i++
        } else {
            args[key] = true
        }
    }

    return args
}

/**
 * Initializes CLI runtime environment variables (`VERBOSE`, `CLI_WORKDIR`).
 *
 * @param {boolean} [verbose] - Enables verbose logging when true
 */
export function initEnv(verbose?: boolean): void {
    process.env['VERBOSE'] = verbose === true ? 'true' : 'false'
    process.env['CLI_WORKDIR'] = process.cwd()

    log.debug([
        'Initializing environment variables',
        `CLI_WORKDIR = ${process.env['CLI_WORKDIR'] ?? ''}`,
        `VERBOSE = ${process.env['VERBOSE'] ?? ''}`,
    ])
}

/**
 * Prompts the user for input via CLI and returns the trimmed answer.
 * Falls back to `defaultAnswer` after a 60s timeout or on empty input.
 *
 * @param {string} query - Question displayed to the user
 * @param {string} [defaultAnswer] - Fallback when the user gives no answer in time
 * @returns {Promise<string>} User input as a trimmed string
 */
export async function askQuestion(query: string, defaultAnswer = ''): Promise<string> {
    return new Promise((resolvePromise) => {
        const rl = createInterface({
            input: process.stdin,
            output: process.stdout,
        })

        const timer = setTimeout(() => {
            rl.close()
            resolvePromise(defaultAnswer)
        }, 60000)

        rl.question(`[QUESTION] ${query} `, (answer) => {
            clearTimeout(timer)
            rl.close()
            resolvePromise(answer.trim() === '' ? defaultAnswer : answer.trim())
        })

        rl.on('SIGINT', () => {
            clearTimeout(timer)
            rl.close()
            process.exit(130)
        })
    })
}

/**
 * Strips only the `allow-scripts` npm config variable (any case, `-` or `_`)
 * so a nested `npm` invocation doesn't inherit the invoking npm process's
 * global allowlist, which npm rejects as an inherited, project-scoped setting
 * with `EALLOWSCRIPTS` when the nested install has a different
 * `package.json`. Other `npm_config_*` vars (registry, proxy, auth, ...)
 * are kept so the nested install still honors them.
 *
 * @returns {NodeJS.ProcessEnv} `process.env` without the allow-scripts keys
 */
export function envWithoutNpmConfig(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {}
    for (const [key, value] of Object.entries(process.env)) {
        if (key.toLowerCase().replaceAll('-', '_') !== 'npm_config_allow_scripts') {
            env[key] = value
        }
    }
    return env
}

/**
 * Executes a shell command in a cross-platform safe way, inheriting stdio.
 *
 * @param {string} command - Command name (e.g. "npm")
 * @param {string[]} args - Command arguments (e.g. ["install"])
 * @param {string} cwd - Working directory to run the command in
 * @returns {Promise<void>} Resolves on exit code 0, rejects otherwise
 */
export async function executeCommand(command: string, args: string[], cwd: string): Promise<void> {
    return new Promise((resolvePromise, reject) => {
        const child: ChildProcess = spawn(command, args, {
            cwd,
            stdio: 'inherit',
            env: command === 'npm' ? envWithoutNpmConfig() : process.env,
        })

        child.on('error', reject)
        child.on('close', (code) => {
            if (code === 0) {
                resolvePromise()
            } else {
                reject(new Error(`${command} exited with code ${String(code)}`))
            }
        })
    })
}

/**
 * Returns the string value of the first of `names` given with a value
 * (`--name=value` or `--name value`); a bare boolean flag is skipped.
 *
 * @param {Args} args - Parsed CLI arguments
 * @param {...string} names - Flag names (e.g. long form, then alias) in priority order
 * @returns {string | undefined} The first string value found, or `undefined`
 */
export function stringFlag(args: Args, ...names: string[]): string | undefined {
    for (const name of names) {
        const value = args[name]
        if (typeof value === 'string') {
            return value
        }
    }
    return undefined
}

/**
 * True when any of `names` was given as a bare flag (`--name`/`-n` with no value).
 *
 * @param {Args} args - Parsed CLI arguments
 * @param {...string} names - Flag names (e.g. long form and alias)
 * @returns {boolean}
 */
export function boolFlag(args: Args, ...names: string[]): boolean {
    return names.some((name) => args[name] === true)
}

/**
 * Normalizes a raw CLI flag value into a boolean, or `undefined` when the
 * flag wasn't provided at all (distinct from an explicit false) — callers
 * use `undefined` to know they should fall back to an interactive prompt.
 *
 * @param {string | boolean} [flag] - Raw flag value from parsed CLI args
 * @returns {boolean | undefined}
 */
export function parseBooleanFlag(flag?: string | boolean): boolean | undefined {
    if (flag === undefined) {
        return undefined
    }
    if (typeof flag === 'boolean') {
        return flag
    }

    const val = flag.toLowerCase()
    if (val === 'false' || val === '0' || val === 'n') {
        return false
    }
    return true
}
