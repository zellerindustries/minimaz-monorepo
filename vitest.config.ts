import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { configDefaults, coverageConfigDefaults, defineConfig } from 'vitest/config'

// 1. Group names to scan for package directories; each entry that doesn't exist is skipped.
const workspaceDirs = ['packages/*', 'toolkits/*']

// This file's own directory (repo root), not process.cwd() — a per-package `npm test` invokes
// `vitest run --root ../..` from inside the package directory, so cwd is not the repo root there.
const rootDir = dirname(fileURLToPath(import.meta.url))

/**
 * Finds the immediate subdirectories of a workspace group that contain a `package.json`.
 * @param group - a `test.projects` glob entry, e.g. `'packages/*'`.
 * @returns paths (relative to `rootDir`) to each package directory found.
 */
function findPackageDirs(group: string): string[] {
    const groupDir = group.replace(/\/\*$/, '')
    if (!existsSync(join(rootDir, groupDir))) {
        return []
    }
    return readdirSync(join(rootDir, groupDir), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(groupDir, entry.name))
        .filter((dir) => existsSync(join(rootDir, dir, 'package.json')))
}

/**
 * Reads a package directory's `package.json` `name` field.
 * @param dir - the package directory.
 * @returns the package's declared name.
 */
function readPackageName(dir: string): string {
    const raw = readFileSync(join(rootDir, dir, 'package.json'), 'utf-8')
    return (JSON.parse(raw) as { name: string }).name
}

// Inline project configs so each package inherits root `test` options (clearMocks, restoreMocks,
// etc.) — a string glob entry does not: only `extends: true` inline configs inherit them.
const packageProjects = workspaceDirs.flatMap((group) =>
    findPackageDirs(group).map((dir) => ({
        extends: true as const,
        root: dir,
        test: {
            name: readPackageName(dir),
        },
    })),
)

export default defineConfig({
    test: {
        // 2. Vitest 3.2+ standard for monorepos (replaces vitest.workspace.ts); inline configs
        // (built above) instead of glob strings so root `test` options below reach each package.
        projects: packageProjects,

        passWithNoTests: true,
        // A bare `tsc -b` (npm run validate) emits compiled copies of the tests into dist/.
        exclude: [...configDefaults.exclude, '**/dist/**'],
        clearMocks: true,
        // Also drops unconsumed mockResolvedValueOnce() queues, which clearMocks leaves behind.
        mockReset: true,
        restoreMocks: true,

        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'json-summary'],
            reportsDirectory: './node_modules/.cache/vitest/coverage',

            // 3. Explicit `**` glob: Vitest 5 no longer treats a bare directory string as
            // "everything inside it" (a plain `packages/*/src` matched zero files).
            include: workspaceDirs.map((dir) => `${dir}/src/**`),

            // 4. CRITICAL FIX: Preserve built-in default exclusions
            exclude: [...coverageConfigDefaults.exclude, '**/*.d.ts', '**/index.ts'],
        },
    },
})
