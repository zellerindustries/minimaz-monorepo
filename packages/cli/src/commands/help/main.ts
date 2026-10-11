import { log } from '@minimaz/logger'
import { commandsHelp } from './constants.js'
import type { CommandHelp } from './types.js'

/**
 * Finds a help entry by command name or alias, ignoring inherited object
 * properties such as `constructor`.
 *
 * @param {string} name - Command name or alias
 * @returns {CommandHelp | undefined} The matching entry, if any
 */
function findEntry(name: string): CommandHelp | undefined {
    if (Object.hasOwn(commandsHelp, name)) {
        return commandsHelp[name]
    }
    return Object.values(commandsHelp).find((entry) => entry.aliases?.includes(name) === true)
}

/**
 * Prints help. With `cmdName` (a command name or alias), prints just that
 * command's entry (or a fallback message if unrecognized). Without it,
 * prints every command.
 *
 * @param {string} [cmdName] - Optional command name or alias to show help for
 */
export function help(cmdName?: string): void {
    if (cmdName !== undefined && cmdName !== '') {
        const cmd = findEntry(cmdName)
        if (!cmd) {
            log.default(`No help found for: ${cmdName}\n`)
            return
        }
        printEntry(cmd)
        return
    }

    log.default('Usage:\n')
    for (const cmd of Object.values(commandsHelp)) {
        printEntry(cmd)
    }
}

function printEntry(cmd: CommandHelp): void {
    log.default([cmd.usage, `\n\t${cmd.description}`])
    if (cmd.aliases !== undefined && cmd.aliases.length > 0) {
        log.default(`\tAlias: ${cmd.aliases.join(', ')}`)
    }
    if (cmd.options) {
        log.default('\tOptions:')
        for (const [opt, desc] of Object.entries(cmd.options)) {
            log.default(`\t\t${opt}\t${desc}`)
        }
    }
    log.default('')
}
