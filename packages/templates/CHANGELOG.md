# @minimaz/templates

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
