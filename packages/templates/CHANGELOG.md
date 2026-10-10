# @minimaz/templates

## 0.3.0

### Minor Changes

- Breaking: `simple`'s static assets moved from `public/` to `src/public/`, and `docs` is now a seeded template name, so a user's own saved template named `docs` is replaced by `mz config --overwrite` / `mz template --update`. Redesigned the bundled templates: `default` is now a small dependency-free starter site (CSS partials bundled into one file, a TypeScript script, a full `serve` section), `simple` is a blank `src/` page, and a new `docs` template scaffolds Markdown documentation for `docs build`. Existing `~/.minimaz/templates` copies are not replaced automatically; run `mz config --overwrite` or `mz template --update` to pick up the new seeds.

### Patch Changes

- Restore the `npmGlobalPath` field to `~/.minimaz/settings.json`, matching `minimaz-cli`'s schema — its absence caused a spurious "Unknown key" warning for anyone who'd previously run `minimaz-cli`'s `config` command. Computed from `npm_config_prefix` (when set) instead of shelling out to `npm config get prefix`, since the field is write-only and never read back. The path now points at `node_modules/@minimaz/sitekit` (the package that publishes the `minimaz`/`mz` bin), the field is optional in `Settings` and omitted when no absolute path can be derived (e.g. `APPDATA` unset on Windows, which previously yielded a relative path), and a missing `npmGlobalPath` in an existing settings file no longer logs an "Added missing key" warning.
- Updated dependencies [`38ce4e2`, `38ce4e2`]:
    - @minimaz/core@0.3.0
    - @minimaz/logger@0.2.1

## 0.2.0

### Minor Changes

- Breaking: exported constants and functions now use camelCase names.

    - `@minimaz/config`: `CONFIG_FILE_NAME` → `configFileName`, `BUNDLE_SEPARATOR` → `bundleSeparator`, `BUNDLE_NAME` →
      `bundleName`, `DEFAULT_CONFIG` → `defaultConfig`, `DEFAULT_BUILD_CONFIG` → `defaultBuildConfig`, `OUTPUT_DIRS` →
      `outputDirs`, `EXTENSIONS` → `outputExtensions`.
    - `@minimaz/markdown`: `MdToHtml` → `mdToHtml`, `MdToPdf` → `mdToPdf`.
    - `@minimaz/templates`: `DEFAULT_TEMPLATE_NAMES` → `defaultTemplateNames`.

### Patch Changes

- @minimaz/logger now provides a KnownError marker class and a shared handleCliError() top-level error handler.
  ConfigNotFoundError, ValidationError, TemplateNotFoundError, and InvalidTemplateNameError now extend KnownError.
  @minimaz/cli's runCli() now always prints the stack trace for an unexpected (non-KnownError) failure instead of
  gating it behind DEBUG=true — a visible CLI output change.
- Updated dependencies [`344f498`, `6bfafff`, `7fc77c9`]:
    - @minimaz/core@0.2.0
    - @minimaz/logger@0.2.0
