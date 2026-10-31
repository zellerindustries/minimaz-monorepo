import { askQuestion } from '../cli/core.js'

/**
 * Asks a yes/no question; any answer starting with `y` (case-insensitive) is a yes.
 *
 * Imports `askQuestion` from `cli/core.js` directly, the module path command tests mock; going through
 * the `cli/index.js` barrel would form an import cycle.
 *
 * @param {string} query - Question displayed to the user
 * @param {string} defaultAnswer - Answer used on empty input or timeout (e.g. `'y'` or `'n'`)
 * @returns {Promise<boolean>} Whether the user answered yes
 */
export async function askYesNo(query: string, defaultAnswer: string): Promise<boolean> {
    return (await askQuestion(query, defaultAnswer)).toLowerCase().startsWith('y')
}
