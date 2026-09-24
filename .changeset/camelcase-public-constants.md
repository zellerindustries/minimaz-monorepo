---
'@minimaz/config': minor
'@minimaz/markdown': minor
'@minimaz/templates': minor
---

Breaking: exported constants and functions now use camelCase names.

- `@minimaz/config`: `CONFIG_FILE_NAME` → `configFileName`, `BUNDLE_SEPARATOR` → `bundleSeparator`, `BUNDLE_NAME` →
  `bundleName`, `DEFAULT_CONFIG` → `defaultConfig`, `DEFAULT_BUILD_CONFIG` → `defaultBuildConfig`, `OUTPUT_DIRS` →
  `outputDirs`, `EXTENSIONS` → `outputExtensions`.
- `@minimaz/markdown`: `MdToHtml` → `mdToHtml`, `MdToPdf` → `mdToPdf`.
- `@minimaz/templates`: `DEFAULT_TEMPLATE_NAMES` → `defaultTemplateNames`.
