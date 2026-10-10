# @minimaz/markdown

## 0.2.1

### Patch Changes

- `mdToHtml` no longer emits clickable links with `javascript:`, `vbscript:` or `data:` URLs (case-insensitive, ignoring the tabs/newlines/control characters browsers strip): the link renders as its plain text, with no `<a>`. PDF output (`mdToPdf`): a word or code line longer than a whole line is now hard-split at the right margin instead of running off the page, tabs become four spaces instead of `?`, and a document whose last block ends at the bottom of a page no longer gets a trailing blank page.

## 0.2.0

### Minor Changes

- Breaking: exported constants and functions now use camelCase names.

    - `@minimaz/config`: `CONFIG_FILE_NAME` → `configFileName`, `BUNDLE_SEPARATOR` → `bundleSeparator`, `BUNDLE_NAME` →
      `bundleName`, `DEFAULT_CONFIG` → `defaultConfig`, `DEFAULT_BUILD_CONFIG` → `defaultBuildConfig`, `OUTPUT_DIRS` →
      `outputDirs`, `EXTENSIONS` → `outputExtensions`.
    - `@minimaz/markdown`: `MdToHtml` → `mdToHtml`, `MdToPdf` → `mdToPdf`.
    - `@minimaz/templates`: `DEFAULT_TEMPLATE_NAMES` → `defaultTemplateNames`.
