// @ts-check

import { dirname } from 'node:path';
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

// This file lives in config/, but the TS project root (tsconfig.json,
// tsconfig.base.json) is one level up at the repo root.
const repoRoot = dirname(import.meta.dirname);

export default defineConfig([
    // ============================================================
    // Global ignores
    // ============================================================

    {
        ignores: [
            '**/node_modules/**',

            // Build output.
            '**/dist/**',
            '**/build/**',
            '**/out/**',

            // Test and coverage output.
            '**/coverage/**',

            // Tool caches.
            '**/.cache/**',
            '**/.turbo/**',
            '**/.nx/**',
            '**/.vite/**',
            '**/.vitest/**',

            // Temporary files.
            '**/.tmp/**',
            '**/tmp/**',

            // Vendored template content copied verbatim from minimaz-cli;
            // not authored source, not subject to our lint rules.
            '**/src/seeds/**',
        ],
    },

    // ============================================================
    // JavaScript
    // ============================================================

    js.configs.recommended,

    // ============================================================
    // TypeScript
    // ============================================================

    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,

    {
        files: ['**/*.{ts,tsx,cts,mts}'],

        languageOptions: {
            parserOptions: {
                projectService: true,

                tsconfigRootDir: repoRoot,
            },
        },

        rules: {
            // ----------------------------------------------------------
            // TypeScript safety
            // ----------------------------------------------------------

            '@typescript-eslint/no-explicit-any': 'error',

            '@typescript-eslint/no-unsafe-assignment': 'error',

            '@typescript-eslint/no-unsafe-argument': 'error',

            '@typescript-eslint/no-unsafe-call': 'error',

            '@typescript-eslint/no-unsafe-member-access': 'error',

            '@typescript-eslint/no-unsafe-return': 'error',

            // ----------------------------------------------------------
            // Variables
            // ----------------------------------------------------------

            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                    destructuredArrayIgnorePattern: '^_',
                },
            ],

            // ----------------------------------------------------------
            // Async safety
            // ----------------------------------------------------------

            '@typescript-eslint/no-floating-promises': 'error',

            '@typescript-eslint/no-misused-promises': 'error',

            '@typescript-eslint/await-thenable': 'error',

            '@typescript-eslint/require-await': 'error',

            // ----------------------------------------------------------
            // Imports
            // ----------------------------------------------------------

            '@typescript-eslint/consistent-type-imports': [
                'error',
                {
                    prefer: 'type-imports',
                    fixStyle: 'separate-type-imports',
                },
            ],

            // ----------------------------------------------------------
            // Code quality
            // ----------------------------------------------------------

            '@typescript-eslint/no-unnecessary-condition': 'error',

            '@typescript-eslint/no-unnecessary-type-arguments': 'error',

            '@typescript-eslint/prefer-for-of': 'error',

            '@typescript-eslint/prefer-nullish-coalescing': 'error',

            '@typescript-eslint/prefer-optional-chain': 'error',

            // ----------------------------------------------------------
            // JavaScript correctness
            // ----------------------------------------------------------

            eqeqeq: ['error', 'always'],

            'no-constant-condition': 'error',

            'no-debugger': 'error',

            'no-duplicate-case': 'error',

            'no-unreachable': 'error',
        },
    },

    // ============================================================
    // JavaScript files
    // ============================================================

    {
        files: ['**/*.{js,mjs,cjs}'],

        // Disable TypeScript-specific type-aware rules.
        ...tseslint.configs.disableTypeChecked,

        languageOptions: {
            globals: {
                process: 'readonly',
                URL: 'readonly',
            },
        },
    },

    // ============================================================
    // Prettier
    // ============================================================

    // Must be last so formatting rules are disabled after
    // all other configurations have been applied.
    eslintConfigPrettier,
]);
