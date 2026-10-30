# @minimaz/sitekit

## 0.2.0

### Minor Changes

- [`a4c1375`](https://github.com/zellerindustries/minimaz-monorepo/commit/a4c13756a64f85f5fa8d092f3a2ef35f76e72b1f) Thanks [@zeller-dev](https://github.com/zeller-dev)! - Breaking: `mz build` now refuses to replace an existing `output.dir` when run non-interactively, and asks `[y/N]` when run in a terminal; pass `--overwrite` to skip the question. A failed build still keeps the previous output. `mz serve` now defaults to port 4173 (was a random free port), warns when `serve.port` is not set in `minimaz.config.json`, and errors if the port is already in use. `@minimaz/config`'s `serve.port` default is now 4173 and `loadConfig` returns a new `serve.portDefaulted` flag.

### Patch Changes

- Updated dependencies [[`a4c1375`](https://github.com/zellerindustries/minimaz-monorepo/commit/a4c13756a64f85f5fa8d092f3a2ef35f76e72b1f)]:
    - @minimaz/cli@0.5.0

## 0.1.3

### Patch Changes

- Updated dependencies [[`2c5d45a`](https://github.com/zellerindustries/minimaz-monorepo/commit/2c5d45a31b84e85578891784595cd8aeaac9ad16), [`8e9cd82`](https://github.com/zellerindustries/minimaz-monorepo/commit/8e9cd8221578a9cbc5f13fd3a624a52ccac9be19)]:
    - @minimaz/cli@0.4.0

## 0.1.2

### Patch Changes

- Updated dependencies [`38ce4e2`, `38ce4e2`, `38ce4e2`, `38ce4e2`, `38ce4e2`, `38ce4e2`, `38ce4e2`, `38ce4e2`, `38ce4e2`, `38ce4e2`]:
    - @minimaz/cli@0.3.0

## 0.1.1

### Patch Changes

- Updated dependencies [`344f498`, `d353c02`, `dc7cc76`, `31be60a`, `7fc77c9`, `f38cf2d`]:
    - @minimaz/cli@0.2.0
