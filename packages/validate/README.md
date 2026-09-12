# @minimaz/validate

Structural validators for CSS, HTML, JS, TS, and JSON.

## Install

```bash
npm install @minimaz/validate
```

## Usage

```ts
import { validateCss, validateHtml, validateJs, validateTs, validateJson } from '@minimaz/validate'

try {
    validateHtml(htmlSource)
} catch (error) {
    // error is an HtmlValidationError
}
```

Each `validate*` function throws a corresponding `*ValidationError` on failure and returns `void` on success —
none of them return a false-success result or swallow errors internally.

## API

- `validateCss(code)` / `CssValidationError`
- `validateHtml(code)` / `HtmlValidationError` — zero-dep brace/tag-balance structural check.
- `validateJs(code)` / `JsValidationError`
- `validateTs(code, options?: { jsx?: boolean })` / `TsValidationError` — via `typescript`'s parser diagnostics.
- `validateJson(code)` / `JsonValidationError` — via `JSON.parse`.

Config validation (`minimaz.config.json`) is not duplicated here — see [`@minimaz/config`](../config).

Depends on `typescript`.
