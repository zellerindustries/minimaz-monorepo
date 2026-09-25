import { readJsonFile } from '@minimaz/core'
import { log } from '@minimaz/logger'

/**
 * Prints `@minimaz/cli`'s own version, read from `pkgPath` (its
 * `package.json`) — not the cwd project's, unlike `minimaz-cli`'s
 * original `version` command.
 *
 * @param {string} pkgPath - Path to `@minimaz/cli`'s own `package.json`
 */
export async function version(pkgPath: string): Promise<void> {
    const data = await readJsonFile<{ version?: unknown }>(pkgPath)

    if (typeof data.version !== 'string') {
        throw new Error('Invalid or missing version in package.json')
    }

    log.default(data.version)
}
