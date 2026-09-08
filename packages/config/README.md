# @minimaz/config

Loads and validates `minimaz.config.json`.

## Install

```bash
npm install @minimaz/config
```

## Usage

```ts
import { loadConfig, CONFIG_FILE_NAME, ConfigNotFoundError } from '@minimaz/config';

try {
    const config = await loadConfig(process.cwd());
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
  build-oriented schema (`input`/`output`, `mapping`, `externals`, `exclude`, CSS/JS/HTML processing options).
- `CONFIG_FILE_NAME` — `'minimaz.config.json'`.
- `DEFAULT_CONFIG`, `DEFAULT_BUILD_CONFIG` — the default docs/build config shapes.
- `ConfigNotFoundError` — thrown when no config file exists at the given path.
- `BUNDLE_SEPARATOR`, `BUNDLE_NAME`, `OUTPUT_DIRS`, `EXTENSIONS` — constants used by the docs bundler.
- Types: `MinimazConfig`, `DocsConfig`, `BuildConfig`, `OutputFormat`, and related sub-types.

Depends on [`@minimaz/json`](../json).
