// @ts-check

import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'
import globals from 'globals'

const repoRoot = import.meta.dirname

export default defineConfig(
    // ============================================================
    // Global ignores
    // ============================================================
    {
        ignores: [
            '**/node_modules/**',
            '**/dist/**',
            'build/**',
            '**/out/**',
            '**/coverage/**',
            '**/.cache/**',
            '**/.turbo/**',
            '**/.nx/**',
            '**/.vite/**',
            '**/.vitest/**',
            '**/.tmp/**',
            '**/tmp/**',
            '**/src/seeds/**', // seed templates (user-facing content, not formatted or linted)
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
                projectService: true,
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

            // Types & API surface
            '@typescript-eslint/explicit-module-boundary-types': 'error',
            '@typescript-eslint/explicit-function-return-type': [
                'error',
                { allowExpressions: true, allowTypedFunctionExpressions: true },
            ],
            '@typescript-eslint/consistent-type-exports': 'error',
            '@typescript-eslint/no-import-type-side-effects': 'error',
            '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
            '@typescript-eslint/method-signature-style': ['error', 'property'],
            '@typescript-eslint/prefer-readonly': 'error',
            '@typescript-eslint/switch-exhaustiveness-check': [
                'error',
                { considerDefaultExhaustiveForUnions: true },
            ],
            '@typescript-eslint/require-array-sort-compare': [
                'error',
                { ignoreStringArrays: true },
            ],
            '@typescript-eslint/promise-function-async': 'error',
            '@typescript-eslint/strict-boolean-expressions': [
                'error',
                { allowString: false, allowNumber: false, allowNullableObject: true },
            ],
            '@typescript-eslint/no-shadow': 'error',
            '@typescript-eslint/naming-convention': [
                'error',
                { selector: 'default', format: ['camelCase'], leadingUnderscore: 'allow' },
                { selector: 'import', format: ['camelCase', 'PascalCase'] },
                { selector: 'typeLike', format: ['PascalCase'] },
                { selector: 'variable', modifiers: ['destructured'], format: null },
                { selector: 'objectLiteralProperty', format: null },
                { selector: 'typeProperty', format: null },
                { selector: 'enumMember', format: ['PascalCase'] },
            ],

            // Control flow & style
            'no-param-reassign': 'error',
            'no-else-return': ['error', { allowElseIf: false }],
            'no-implicit-coercion': 'error',
            'no-console': 'error',
            'object-shorthand': 'error',
            'prefer-template': 'error',
            'no-restricted-syntax': [
                'error',
                {
                    selector: "CallExpression[callee.property.name='forEach']",
                    message: 'Use a for...of loop instead of .forEach().',
                },
            ],
        },
    },

    // Mock factories return promises without awaiting anything, which `require-await` forbids marking
    // `async` — the two rules can't both hold there.
    {
        files: ['**/__tests__/**/*.ts'],
        rules: {
            '@typescript-eslint/promise-function-async': 'off',
        },
    },

    // The logger, and standalone repo scripts, are the places that are supposed to write to the console.
    {
        files: ['packages/logger/src/core.ts', 'scripts/**'],
        rules: {
            'no-console': 'off',
        },
    },

    // ============================================================
    // JavaScript files
    // ============================================================

    // Disables type-aware rules for .js, .cjs, .mjs files only — left unscoped, it also switched off
    // every type-aware rule (and the project service) for the TypeScript files above.
    {
        files: ['**/*.{js,mjs,cjs}'],
        extends: [tseslint.configs.disableTypeChecked],
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

    // eslint-config-prettier turns `curly` off; its "all" option is compatible with Prettier, so re-enable it here.
    {
        rules: {
            curly: ['error', 'all'],
        },
    },
)
