import { log } from "@minimaz/logger";
import { commandsHelp } from "./constants.js";
import type { CommandHelp } from "./types.js";

/**
 * Prints help. With `cmdName`, prints just that command's entry (or a
 * fallback message if unrecognized). Without it, prints every command.
 *
 * @param {string} [cmdName] - Optional command name to show help for
 */
export function help(cmdName?: string): void {
    if (cmdName) {
        const cmd: CommandHelp | undefined = commandsHelp[cmdName];
        if (!cmd) {
            log.default(`No help found for: ${cmdName}\n`);
            return;
        }
        printEntry(cmd);
        return;
    }

    log.default("Usage:\n");
    for (const cmd of Object.values(commandsHelp)) {
        printEntry(cmd);
    }
}

function printEntry(cmd: CommandHelp): void {
    log.default([cmd.usage, `\n\t${cmd.description}`]);
    if (cmd.options) {
        log.default("\tOptions:");
        for (const [opt, desc] of Object.entries(cmd.options)) {
            log.default(`\t\t${opt}\t${desc}`);
        }
    }
    log.default("");
}
