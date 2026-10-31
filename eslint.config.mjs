// @ts-check

import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import { importX } from 'eslint-plugin-import-x'
import jsdoc from 'eslint-plugin-jsdoc'
import vitest from '@vitest/eslint-plugin'
import globals from 'globals'

const repoRoot = import.meta.dirname

export default defineConfig(
    {
        linterOptions: {
            reportUnusedDisableDirectives: 'error',
        },
    },

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
            '**/__tests__/fixtures/**', // test inputs whose exact layout is under test
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

    // Import cycles, resolved through each package's tsconfig. Cross-package `@minimaz/*` imports
    // resolve to the dependency's built dist/ (so they are only followed after a build); cycles
    // between packages are already rejected by tsc project references.
    {
        files: ['**/*.{ts,tsx,cts,mts}'],
        plugins: { 'import-x': importX },
        settings: {
            // Without these, import-x only parses `.js` dependencies, so no-cycle never follows a `.ts` import.
            'import-x/extensions': ['.ts', '.tsx', '.cts', '.mts', '.js', '.jsx', '.cjs', '.mjs'],
            'import-x/external-module-folders': ['node_modules', 'node_modules/@types'],
            'import-x/parsers': { '@typescript-eslint/parser': ['.ts', '.tsx', '.cts', '.mts'] },
            'import-x/resolver-next': [
                createTypeScriptImportResolver({
                    alwaysTryTypes: true,
                    project: `${repoRoot}/tsconfig.json`,
                }),
            ],
        },
        rules: {
            'import-x/no-cycle': 'error',
        },
    },
    {
        files: ['**/__tests__/**/*.ts'],
        plugins: { vitest },
        rules: {
            'vitest/no-focused-tests': 'error',
            'vitest/no-disabled-tests': 'error',
            // roundTrip (js print tests) and expectPortInUse (local-server startup tests) call expect() themselves.
            'vitest/expect-expect': [
                'error',
                { assertFunctionNames: ['expect', 'roundTrip', 'expectPortInUse'] },
            ],
        },
    },

    // Public (exported) functions in library source need JSDoc, including their parameters.
    {
        files: ['**/src/**/*.ts'],
        ignores: ['**/__tests__/**'],
        plugins: { jsdoc },
        rules: {
            'jsdoc/require-jsdoc': [
                'error',
                {
                    publicOnly: true,
                    require: { FunctionDeclaration: true, ArrowFunctionExpression: true },
                },
            ],
            'jsdoc/require-param': [
                'error',
                {
                    contexts: [
                        'ExportNamedDeclaration > FunctionDeclaration',
                        'ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > ArrowFunctionExpression',
                        'ExportDefaultDeclaration > FunctionDeclaration',
                    ],
                },
            ],
        },
    },

    // Named exports only; tool config files are the exception because their loaders require a default export.
    {
        rules: {
            'no-restricted-exports': [
                'error',
                {
                    restrictDefaultExports: {
                        direct: true,
                        named: true,
                        defaultFrom: true,
                        namedFrom: true,
                        namespaceFrom: true,
                    },
                },
            ],
            'no-nested-ternary': 'error',
            'max-depth': ['error', 4],
        },
    },
    {
        files: ['eslint.config.mjs', 'vitest.config.ts'],
        rules: {
            'no-restricted-exports': 'off',
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
