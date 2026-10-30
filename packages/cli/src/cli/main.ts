#!/usr/bin/env node
import { resolve } from 'node:path'
import { handleCliError, log } from '@minimaz/logger'
import { getGlobalDir, getTemplatesDir } from '@minimaz/templates'
import {
    buildDocs,
    build,
    clear,
    config,
    docsInit,
    help,
    init,
    resolveDocsCommand,
    serve,
    template,
    validate,
    version,
} from '../commands/index.js'
import type { InitCommandOptions } from '../commands/init/types.js'
import type { TemplateCommandOptions } from '../commands/template/types.js'
import type { CommandFn } from './types.js'
import { boolFlag, initEnv, parseArgs, parseBooleanFlag, stringFlag } from './core.js'

/**
 * Best-effort `~/.minimaz` bootstrap, run when `npm_lifecycle_event` is
 * `"postinstall"`. Never throws — a failure here must not fail `npm
 * install` for whoever installed this package (including this monorepo's
 * own contributors, since every workspace's `postinstall` runs on a root
 * `npm install` too).
 */
async function postInstall(): Promise<void> {
    log.info('Post install: running')
    try {
        const globalDir = getGlobalDir()
        const templatesDir = getTemplatesDir(globalDir)
        await config(globalDir, templatesDir, false)
        log.success('Post install: done')
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        log.warn(`Post install skipped: ${message}`)
    }
}

/**
 * Run a minimaz CLI command.
 *
 * @param pkgPath - Path to a package.json file; the `version` command reads
 *   from this file.
 * @returns Promise that resolves when the command completes
 */
export async function runCli(pkgPath: string): Promise<void> {
    if (process.env['npm_lifecycle_event'] === 'postinstall' && process.argv.length <= 2) {
        await postInstall()
        return
    }

    const args = parseArgs(process.argv.slice(2))
    const cmd = args._[0] ?? ''
    const subArg = args._[1]

    initEnv(boolFlag(args, 'v', 'verbose'))

    if (cmd === 'help' || boolFlag(args, 'help', 'h')) {
        help(typeof subArg === 'string' ? subArg : undefined)
        return
    }

    const cwd = process.env['CLI_WORKDIR'] ?? process.cwd()
    const globalDir = getGlobalDir()
    const templatesDir = getTemplatesDir(globalDir)

    const buildHandler: CommandFn = async () => {
        await build(cwd, {
            overwrite: parseBooleanFlag(args['overwrite'] as string | boolean | undefined) ?? false,
        })
    }
    const clearHandler: CommandFn = async () => {
        await clear(cwd)
    }
    const initHandler: CommandFn = async () => {
        const projectName = typeof subArg === 'string' ? subArg : 'minimaz-project'
        const templateFlag = stringFlag(args, 'template', 't') ?? 'default'
        const gitproviderFlag = stringFlag(args, 'gitprovider')
        const npmFlag = parseBooleanFlag(args['npm'] as string | boolean | undefined)
        const gitFlag = parseBooleanFlag(args['git'] as string | boolean | undefined)

        const options: InitCommandOptions = {
            template: templateFlag,
            ...(npmFlag !== undefined ? { npm: npmFlag } : {}),
            ...(gitFlag !== undefined ? { git: gitFlag } : {}),
            ...(gitproviderFlag !== undefined ? { gitprovider: gitproviderFlag } : {}),
        }

        await init(projectName, options, resolve(cwd, projectName), templatesDir)
    }

    const templateHandler: CommandFn = async () => {
        const deleteFlag = stringFlag(args, 'delete', 'd')
        const updateFlag =
            stringFlag(args, 'update', 'u') ?? (boolFlag(args, 'update', 'u') ? true : undefined)

        const options: TemplateCommandOptions = {
            list: boolFlag(args, 'list', 'l'),
            ...(deleteFlag !== undefined ? { delete: deleteFlag } : {}),
            ...(updateFlag !== undefined ? { update: updateFlag } : {}),
        }

        const sourcePath = resolve(cwd, typeof subArg === 'string' ? subArg : '')
        await template(globalDir, templatesDir, options, sourcePath)
    }

    const commands: Record<string, CommandFn> = {
        h: () => {
            help()
        },
        version: async () => version(pkgPath),
        v: async () => version(pkgPath),
        validate: async () => validate(stringFlag(args, 'path') ?? ''),
        build: buildHandler,
        b: buildHandler,
        clear: clearHandler,
        c: clearHandler,
        serve: async () => {
            await serve(cwd)
        },
        init: initHandler,
        i: initHandler,
        config: async () => {
            const overwrite =
                parseBooleanFlag(args['overwrite'] as string | boolean | undefined) ?? false
            await config(globalDir, templatesDir, overwrite)
        },
        template: templateHandler,
        t: templateHandler,
        docs: async () => {
            const action = resolveDocsCommand(subArg)
            if (action === 'init') {
                await docsInit(cwd)
            } else {
                await buildDocs(cwd)
            }
        },
    }

    const handler = Object.hasOwn(commands, cmd) ? commands[cmd] : undefined

    try {
        if (handler) {
            await handler()
        } else {
            // Exit non-zero on an unknown command (minimaz-cli's original exited 0 here).
            log.error(`Unknown command "${cmd}"\nUse "minimaz help" to see available commands`)
            help()
            process.exitCode = 1
        }
    } catch (error: unknown) {
        handleCliError(error)
    }
}
