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
- `validateHtml(code)` / `HtmlValidationError` — zero-dep tag-balance structural check. The contents of
  `<script>`, `<style>`, `<textarea>` and `<title>` are treated as text, so a `<` inside them is never read as a
  tag. HTML5 optional end tags (`li`, `p`, `td`, `option`, …) are closed implicitly, not reported as unclosed.
- `validateJs(code)` / `JsValidationError` — parses as JavaScript only, so TypeScript-only syntax is rejected.
- `validateTs(code, options?: { jsx?: boolean })` / `TsValidationError` — via `typescript`'s parser diagnostics.
- `validateJson(code)` / `JsonValidationError` — via `JSON.parse`.

Config validation (`minimaz.config.json`) is not duplicated here — see [`@minimaz/config`](../config).

Depends on [`@minimaz/logger`](../logger) and `typescript`.
