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

- `loadConfig(cwd)` — reads `minimaz.config.json` from `cwd`, defaulting missing/invalid fields. Understands
  **both** the docs-builder schema (`docs.input.dir`, `docs.output.bundle`, `docs.output.formats`) and the
  build-oriented schema (`input`/`output`, `mapping`, `externals`, `exclude`, CSS/JS/HTML processing options),
  plus the `serve` section below.
- `configFileName` — `'minimaz.config.json'`.
- `defaultConfig`, `defaultBuildConfig`, `defaultServeConfig` — the default docs/build/serve config shapes.
- `ConfigNotFoundError` — thrown when no config file exists at the given path.
- `bundleSeparator`, `bundleName`, `outputDirs`, `outputExtensions` — constants used by the docs bundler.
- Types: `MinimazConfig`, `DocsConfig`, `BuildConfig`, `ServeConfig`, `OutputFormat`, and related sub-types.

### `serve` fields

- `port` — `number` — default `0` — TCP port to listen on (`0` picks a random free port).
- `host` — `string` — default `'127.0.0.1'` — interface to bind the server to.
- `liveReload` — `boolean` — default `true` — inject the SSE-based live-reload client into served HTML.
- `cleanUrls` — `boolean` — default `false` — serve `/about` for `/about.html` (extension-less URLs).
- `singlePageApp` — `boolean` — default `false` — fall back to the root `index.html` for unmatched routes.
- `directoryListing` — `boolean` — default `false` — render a directory index when a folder has no `index.html`.
- `cacheControl` — `boolean` — default `false` — send `Cache-Control` response headers for served files.

Depends on [`@minimaz/json`](../json) and [`@minimaz/logger`](../logger).
