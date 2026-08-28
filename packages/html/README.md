# @minimaz/html

HTML minifier, plus [`@minimaz/validate`](../validate)'s HTML validator re-exported.

## Install

```bash
npm install @minimaz/html
```

## Usage

```ts
import { minifyHtml, validateHtml, HtmlValidationError } from "@minimaz/html";

const minified = await minifyHtml(htmlSource);
```

## API

- `minifyHtml(code)` — minifies HTML via `html-minifier-terser`. Throws on failure rather than falling back to
  unminified output.
- `validateHtml(code)` / `HtmlValidationError` — re-exported from `@minimaz/validate`, not reimplemented.

Depends on `html-minifier-terser` and [`@minimaz/validate`](../validate).
