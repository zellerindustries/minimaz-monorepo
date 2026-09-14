#!/usr/bin/env node

import { rm, glob } from 'node:fs/promises'
import { handleCliError } from '@minimaz/errors'
import { createLogger } from '@minimaz/logger'

const log = createLogger('cleaner')

const patterns = ['**/dist', '**/coverage', '**/.cache', '**/*.tsbuildinfo']

/**
 * True for a real npm dependency path that must never be touched — but
 * false for `node_modules` itself and for this repo's own tsc caches,
 * deliberately stored under each package's `node_modules/.cache/tsc/`
 * (see CLAUDE.md). `glob`'s `exclude` is evaluated during directory
 * traversal (it prunes descent), so excluding `node_modules` itself would
 * also block ever reaching the nested `.cache` directory — this checks
 * what comes *after* `node_modules` rather than just testing for its
 * presence in the path.
 */
function isDependencyPath(filePath: string): boolean {
    const normalized = filePath.split('\\').join('/')
    const marker = 'node_modules'
    const index = normalized.indexOf(marker)

    if (index === -1 || (index !== 0 && normalized[index - 1] !== '/')) {
        return false
    }

    const afterNodeModules = normalized.slice(index + marker.length)

    return afterNodeModules !== '' && !afterNodeModules.startsWith('/.cache')
}

/**
 * Sweeps and deletes monorepo build outputs, test coverage, and tool caches.
 */
async function clean(): Promise<void> {
    log.info('Cleaning monorepo artifacts and caches')

    for (const pattern of patterns) {
        log.debug(`Sweeping pattern ${pattern}`)

        // glob handles deep nested monorepo discovery natively
        for await (const entryPath of glob(pattern, {
            exclude: isDependencyPath,
        })) {
            try {
                await rm(entryPath, { recursive: true, force: true })
                log.info(`Deleted: ${entryPath}`)
            } catch (error: unknown) {
                // Explicitly consume the error to satisfy strict empty-block rules
                // while safely ignoring locked files or race conditions.
                void error
            }
        }
    }

    log.success('Cleanup complete')
}

clean().catch((error: unknown) => {
    handleCliError(error)
})
