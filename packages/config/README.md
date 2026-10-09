# @minimaz/config

Loads and validates `minimaz.config.json`.

## Install

```bash
npm install @minimaz/config
```

## Usage

```ts
import { configFileName, ConfigNotFoundError, loadConfig } from '@minimaz/config'

try {
    const config = await loadConfig(process.cwd())
    // config.docs.* and config.input/output.* are both always present,
    // independently defaulted regardless of which sections the file provided
} catch (error) {
    if (error instanceof ConfigNotFoundError) {
        // no minimaz.config.json at cwd
    }
}
```

## API

- `loadConfig(cwd, { initCommand? })` — reads `minimaz.config.json` from `cwd`, type-checks every known field,
  and defaults missing ones. Understands **both** the docs-builder schema (`docs.input.dir`,
  `docs.output.bundle`, `docs.output.formats`) and the build-oriented schema (`input`/`output`, `mapping`,
  `externals`, `exclude`, CSS/JS/HTML processing options), plus the `serve` section below. Unknown keys are
  logged as warnings and ignored. `initCommand` (e.g. `'minimaz init'`) is appended to a `ConfigNotFoundError`
  as a "Run ... first." hint.
- `configFileName` — `'minimaz.config.json'`.
- `defaultConfig`, `defaultBuildConfig`, `defaultServeConfig` — the default docs/build/serve config shapes.
- `ConfigNotFoundError` — thrown when no config file exists at the given path.
- `ConfigReadError` — thrown when the config file exists but can't be read (e.g. `EISDIR`, `EACCES`); the
  message names the real cause.
- `ConfigValidationError` — thrown when any field has the wrong type; `errors` lists every bad field.
- `resolveDocsOutputDirs(outputDir)` — docs output directories derived from the build `output.dir`: a sibling
  `<output.dir>-docs/html` and `<output.dir>-docs/pdf`, never inside `output.dir` (which `build`/`clear` wipe).
- `outputDirs` — `resolveDocsOutputDirs` for the default `output.dir`: `dist-docs/html` and `dist-docs/pdf`.
- `bundleSeparator`, `bundleName`, `outputExtensions` — constants used by the docs bundler.
  `bundleSeparator` is a Markdown thematic break (`'\n\n---\n\n'`), so bundled files are divided by a
  horizontal rule.
- Types: `MinimazConfig`, `DocsConfig`, `BuildConfig`, `ServeConfig`, `OutputFormat`, and related sub-types.

### `serve` fields

- `port` — `number` — default `0` — TCP port to listen on (`0` picks a random free port).
- `host` — `string` — default `'127.0.0.1'` — interface to bind the server to.
- `liveReload` — `boolean` — default `true` — inject the SSE-based live-reload client into served HTML.
- `cleanUrls` — `boolean` — default `false` — fall back to `<path>.html` when an extensionless path has no
  exact file match.
- `singlePageApp` — `boolean` — default `false` — fall back to the root `index.html` for unmatched routes.
- `directoryListing` — `boolean` — default `false` — render a directory index when a folder has no `index.html`.
- `cacheControl` — `boolean` — default `false` — add an `ETag` and `Cache-Control: no-cache` to every response,
  honoring `If-None-Match` with a `304`.

Depends on [`@minimaz/json`](../json) and [`@minimaz/logger`](../logger).
