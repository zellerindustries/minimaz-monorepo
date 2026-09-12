import { defineConfig, coverageConfigDefaults } from 'vitest/config'

// 1. Use wildcards so Vitest skips missing directories gracefully
const workspaceDirs = ['packages/*', 'toolkits/*', 'tools/*', 'apps/*', 'app/*']

export default defineConfig({
    test: {
        // 2. Vitest 3.2+ standard for monorepos (replaces vitest.workspace.ts)
        projects: workspaceDirs,

        passWithNoTests: true,
        clearMocks: true,
        restoreMocks: true,

        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'json-summary'],
            reportsDirectory: './node_modules/.cache/vitest/coverage',

            // 3. Simplified syntax: Recent Vitest versions treat a string without wildcards
            // as a directory and automatically match everything inside it.
            include: workspaceDirs.map((dir) => `${dir}/src`),

            // 4. CRITICAL FIX: Preserve built-in default exclusions
            exclude: [...coverageConfigDefaults.exclude, '**/*.d.ts', '**/index.ts'],
        },
    },
})
