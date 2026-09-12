#!/usr/bin/env node

import { rm, glob } from 'node:fs/promises'
import { handleCliError } from '@minimaz/errors'

const patterns = ['**/dist', '**/coverage', '**/.cache', '**/*.tsbuildinfo']

/**
 * Sweeps and deletes monorepo build outputs, test coverage, and tool caches.
 */
async function clean(): Promise<void> {
    console.log('🧹 Cleaning monorepo artifacts and caches...')

    for (const pattern of patterns) {
        // glob handles deep nested monorepo discovery natively
        for await (const entryPath of glob(pattern, {
            exclude: (filePath) => filePath.includes('node_modules'), // Never touch node_modules
        })) {
            try {
                await rm(entryPath, { recursive: true, force: true })
                console.log(`Deleted: ${entryPath}`)
            } catch (error: unknown) {
                // Explicitly consume the error to satisfy strict empty-block rules
                // while safely ignoring locked files or race conditions.
                void error
            }
        }
    }

    console.log('✨ Cleanup complete!')
}

clean().catch((error: unknown) => {
    handleCliError(error)
})
