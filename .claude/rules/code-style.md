---
paths:
    - '**/*.ts'
    - '**/*.mjs'
---

# Code style

- 4-space indentation, 100-char print width, trailing commas, single quotes, **no semicolons** — enforced by
  Prettier (`.prettierrc.json`: `semi: false`) + pre-commit hook, not manual. (Older specs/plans under
  `.claude/superpowers/` predate this and still say "semicolons" — the checked-in `.prettierrc.json` and actual
  source are the current source of truth.)
- TypeScript (`tsconfig.base.json`): `strict` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noPropertyAccessFromIndexSignature`, `noUnusedLocals`/`noUnusedParameters`, `noImplicitReturns`/`Override`,
  `noUncheckedSideEffectImports`, `verbatimModuleSyntax`, and `erasableSyntaxOnly` (no enums, namespaces or
  parameter properties). ES2024 target, NodeNext modules. Named exports + barrel `index.ts` only, no default
  exports. `.js` extensions in relative imports.
- ESLint (`eslint.config.mjs`): `strictTypeChecked` + `stylisticTypeChecked`, with type-aware rules on for TS
  files only. On top of that, all errors:
    - camelCase everything (constants included; types PascalCase).
    - `interface` over `type` for object shapes.
    - Explicit return types on exported functions.
    - `strict-boolean-expressions` (no string/number truthiness — write `!== ''` / `!== null`).
    - Exhaustive `switch`.
    - `curly: all`.
    - No `.forEach` (use `for...of`).
    - No `console` outside `packages/logger/src/core.ts`.
    - No `any` — use proper types or `unknown`. Prefix unused vars with `_`.
- JSDoc (`@param`/`@returns`) on every exported function.
- Discriminated unions for AST-like nodes; type predicates for runtime validation (e.g. `isOutputFormat`).
- User mistakes (bad argument, missing file, bad `@import`) are thrown as `KnownError`, never a plain `Error` —
  see `monorepo-architecture.md`.
