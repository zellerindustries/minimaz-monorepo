import { askQuestion } from '../cli/index.js'

/**
 * Asks a yes/no question; any answer starting with `y` (case-insensitive) is a yes.
 *
 * Imports `askQuestion` through the `cli/index.js` barrel, the same module path command tests mock.
 *
 * @param {string} query - Question displayed to the user
 * @param {string} defaultAnswer - Answer used on empty input or timeout (e.g. `'y'` or `'n'`)
 * @returns {Promise<boolean>} Whether the user answered yes
 */
export async function askYesNo(query: string, defaultAnswer: string): Promise<boolean> {
    return (await askQuestion(query, defaultAnswer)).toLowerCase().startsWith('y')
}
