---
paths:
    - '**/__tests__/**'
    - 'vitest.config.ts'
    - 'packages/*/package.json'
    - 'toolkits/*/package.json'
---

# Testing

- Tests live in a `__tests__/` subdirectory next to the code they cover (e.g. `src/__tests__/core.test.ts` for
  `src/core.ts`), under `packages/*/src` and `toolkits/*/src`.
- `vitest.config.ts` builds one inline project per package directory under `packages/` and `toolkits/` (named
  after its `package.json` `name`), each with `extends: true` — plain directory-glob project strings never inherit
  root `test` options, which once left `clearMocks`/`restoreMocks` silently applying to no package. Keep
  `extends: true` if you touch that config.
- Relative imports from a `__tests__/` file need an extra `../` compared to a sibling file (e.g.
  `import { foo } from '../core.js'`, not `./core.js`) — easy to get wrong when moving a test into `__tests__/`,
  and `tsc -b` only catches it if the package's own `tsconfig.json` `rootDir`/`include` still correctly point at
  `"./src"`/`["src"]` (pointing them at `"__tests__"` instead silently empties the TypeScript project — zero files
  matched, so `tsc -b` reports no errors at all instead of catching the mistake).
- Repo scripts aren't workspace packages, so `vitest.config.ts` adds a `scripts` project (`scripts/__tests__/*.test.mjs`,
  `wiki-sync.test.mjs`, `bundle.test.mjs`, `verify-packages.test.mjs`); root `npm test` runs it last via `npm run test:scripts`.
- There is no separate test package (a centralized test-suite package is only a design idea — see
  `.claude/status.md`).
- A package's own `test` script is `vitest run --root ../.. --project <package-name>`. A path filter like
  `packages/css` doesn't work there: Vitest resolves it against the package's own cwd, matches nothing, and
  `passWithNoTests` turns that into a silent pass.
- Some tests read another package's built output: `@minimaz/cli`'s `init` and seed tests load the seeds from
  `@minimaz/templates`'s gitignored `dist/seeds`. A stale or missing `dist/` fails them, so run `npm run build`
  before `npm test` on a fresh checkout or after changing a seed (`npm run verify` already orders them that way).
- Never let a test import a module whose top level does real work (a build, a clean). The old `tools/builder` and
  `tools/cleaner` packages did exactly that, so every `npm test` ran a workspace build and a repo-wide clean
  mid-run, randomly deleting `dist/*.js` ("Failed to resolve entry for package", once misattributed to antivirus).
- Verify with the root scripts, not a package's own: see the `verifying-monorepo-changes` skill.
