import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { configFileName, DEFAULT_CONFIG } from '@minimaz/config'
import { log } from '@minimaz/logger'
import { buildDocs } from './core.js'

export { buildDocs }

/**
 * Writes a default `minimaz.config.json` scaffolded for the `docs` command, unless one already exists.
 *
 * @param {string} cwd - Directory to write the config file into
 * @returns {Promise<void>} Resolves once the config file exists (written or already present)
 */
export async function docsInit(cwd: string): Promise<void> {
    const configPath = path.join(cwd, configFileName)
    if (existsSync(configPath)) {
        log.info(`${configFileName} already exists, leaving it untouched.`)
        return
    }
    await writeFile(configPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, 'utf8')
    log.success(`Created ${configFileName}.`)
}

/**
 * Resolves the `docs` command's subcommand from the parsed positional arg.
 *
 * @param {unknown} subArg - `args._[1]` from `parseArgs`
 * @returns {'init' | 'build'}
 * @throws {Error} If `subArg` isn't "init" or "build"
 */
export function resolveDocsCommand(subArg: unknown): 'init' | 'build' {
    if (subArg === 'init' || subArg === 'build') {
        return subArg
    }
    throw new Error('Usage: minimaz docs <init|build>')
}
