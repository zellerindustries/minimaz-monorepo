#!/usr/bin/env node
import { resolve } from 'node:path';
import { log } from '@minimaz/logger';
import { getGlobalDir, getTemplatesDir } from '@minimaz/templates';
import {
    buildDocs,
    config,
    docsInit,
    help,
    init,
    resolveDocsCommand,
    template,
    validate,
    version,
} from '../commands/index.js';
import type { InitCommandOptions } from '../commands/init/types.js';
import type { TemplateCommandOptions } from '../commands/template/types.js';
import type { CommandFn } from './types.js';
import { initEnv, parseArgs, parseBooleanFlag } from './core.js';

/**
 * Best-effort `~/.minimaz` bootstrap, run when `npm_lifecycle_event` is
 * `"postinstall"`. Never throws — a failure here must not fail `npm
 * install` for whoever installed this package (including this monorepo's
 * own contributors, since every workspace's `postinstall` runs on a root
 * `npm install` too).
 */
async function postInstall(): Promise<void> {
    log.info('Post install: running');
    try {
        const globalDir = getGlobalDir();
        const templatesDir = getTemplatesDir(globalDir);
        await config(globalDir, templatesDir, false);
        log.success('Post install: done');
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        log.warn(`Post install skipped: ${message}`);
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
        await postInstall();
        return;
    }

    const args = parseArgs(process.argv.slice(2));
    const cmd = args._[0] ?? '';
    const subArg = args._[1];

    initEnv(args['v'] === true || args['verbose'] === true);

    if (cmd === 'help' || args['help'] === true || args['h'] === true) {
        help(typeof subArg === 'string' ? subArg : undefined);
        return;
    }

    const cwd = process.env['CLI_WORKDIR'] ?? process.cwd();
    const globalDir = getGlobalDir();
    const templatesDir = getTemplatesDir(globalDir);

    const commands: Record<string, CommandFn> = {
        h: () => {
            help();
        },
        version: () => version(pkgPath),
        v: () => version(pkgPath),
        validate: () => validate(typeof args['path'] === 'string' ? args['path'] : ''),

        init: async () => {
            const projectName = typeof subArg === 'string' ? subArg : 'minimaz-project';
            const templateFlag =
                typeof args['template'] === 'string'
                    ? args['template']
                    : typeof args['t'] === 'string'
                      ? args['t']
                      : 'default';
            const gitproviderFlag =
                typeof args['gitprovider'] === 'string' ? args['gitprovider'] : undefined;
            const gitremoteFlag =
                typeof args['gitremote'] === 'string' ? args['gitremote'] : undefined;
            const npmFlag = parseBooleanFlag(args['npm'] as string | boolean | undefined);
            const gitFlag = parseBooleanFlag(args['git'] as string | boolean | undefined);

            const options: InitCommandOptions = {
                template: templateFlag,
                ...(npmFlag !== undefined ? { npm: npmFlag } : {}),
                ...(gitFlag !== undefined ? { git: gitFlag } : {}),
                ...(gitproviderFlag !== undefined ? { gitprovider: gitproviderFlag } : {}),
                ...(gitremoteFlag !== undefined ? { gitremote: gitremoteFlag } : {}),
            };

            await init(projectName, options, resolve(cwd, projectName), templatesDir);
        },

        config: async () => {
            const overwrite =
                parseBooleanFlag(args['overwrite'] as string | boolean | undefined) ?? false;
            await config(globalDir, templatesDir, overwrite);
        },

        template: async () => {
            const deleteFlag =
                typeof args['delete'] === 'string'
                    ? args['delete']
                    : typeof args['d'] === 'string'
                      ? args['d']
                      : undefined;
            const updateFlag =
                typeof args['update'] === 'string'
                    ? args['update']
                    : typeof args['u'] === 'string'
                      ? args['u']
                      : args['update'] === true || args['u'] === true
                        ? true
                        : undefined;

            const options: TemplateCommandOptions = {
                list: args['list'] === true || args['l'] === true,
                ...(deleteFlag !== undefined ? { delete: deleteFlag } : {}),
                ...(updateFlag !== undefined ? { update: updateFlag } : {}),
            };

            const sourcePath = resolve(cwd, typeof subArg === 'string' ? subArg : '');
            await template(globalDir, templatesDir, options, sourcePath);
        },

        docs: async () => {
            const action = resolveDocsCommand(subArg);
            if (action === 'init') {
                await docsInit(cwd);
            } else {
                await buildDocs(cwd);
            }
        },
    };

    const handler = commands[cmd];

    try {
        if (handler) {
            await handler();
        } else {
            // Exit non-zero on an unknown command (minimaz-cli's original exited 0 here).
            log.error(`Unknown command "${cmd}"\nUse "minimaz help" to see available commands`);
            help();
            process.exitCode = 1;
        }
    } catch (error: unknown) {
        const isDebug = process.env['DEBUG'] === 'true';
        const message =
            error instanceof Error
                ? isDebug
                    ? (error.stack ?? error.message)
                    : error.message
                : String(error);
        log.error(message);

        if (error instanceof Error && 'errors' in error && Array.isArray(error.errors)) {
            for (const detail of error.errors as unknown[]) {
                log.error(`\t-> ${String(detail)}`);
            }
        }

        process.exitCode = 1;
    }
}
