// @ts-check

import { dirname } from 'node:path'
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'
import globals from 'globals'

const repoRoot = dirname(import.meta.dirname)

export default tseslint.config(
    // ============================================================
    // Global ignores
    // ============================================================
    {
        ignores: [
            '**/node_modules/**',
            '**/dist/**',
            '**/build/**',
            '**/out/**',
            '**/coverage/**',
            '**/.cache/**',
            '**/.turbo/**',
            '**/.nx/**',
            '**/.vite/**',
            '**/.vitest/**',
            '**/.tmp/**',
            '**/tmp/**',
            '**/src/seeds/**', // Vendored templates
        ],
    },

    // ============================================================
    // Base Presets
    // ============================================================
    js.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,

    // ============================================================
    // TypeScript Overrides & Setup
    // ============================================================
    {
        files: ['**/*.{ts,tsx,cts,mts}'],
        languageOptions: {
            parserOptions: {
                projectService: {
                    allowDefaultProject: ['vitest.config.ts', 'config/vitest.config.ts'],
                },
                tsconfigRootDir: repoRoot,
            },
        },
        rules: {
            // Only define rules here if you are OVERRIDING the presets.
            // (no-unsafe-*, await-thenable, etc. are already handled by strictTypeChecked)

            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                    destructuredArrayIgnorePattern: '^_',
                },
            ],

            '@typescript-eslint/consistent-type-imports': [
                'error',
                {
                    prefer: 'type-imports',
                    fixStyle: 'separate-type-imports',
                },
            ],

            eqeqeq: ['error', 'always'],
        },
    },

    // ============================================================
    // JavaScript files
    // ============================================================

    // Automatically disables type-aware rules for .js, .cjs, .mjs files
    tseslint.configs.disableTypeChecked,

    {
        files: ['**/*.{js,mjs,cjs}'],
        languageOptions: {
            // Automatically injects `process`, `URL`, `__dirname`, etc.
            globals: {
                ...globals.node,
                ...globals.es2024,
            },
        },
    },

    // ============================================================
    // Prettier (Must be last)
    // ============================================================
    eslintConfigPrettier,
)
