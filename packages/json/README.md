# @minimaz/json

Dependency-free JSON parse/minify/format.

## Install

```bash
npm install @minimaz/json
```

## Usage

```ts
import { parseJson, minifyJson, formatJson } from "@minimaz/json";

const data = parseJson(rawText); // throws a descriptive error on invalid JSON
const minified = minifyJson(rawText);
const pretty = formatJson(rawText, 4); // indent defaults to 4
```

## API

- `parseJson(code)` — parses a JSON string, wrapping `JSON.parse` failures in a descriptive error.
- `minifyJson(code)` — re-serializes JSON with no whitespace.
- `formatJson(code, indent = 4)` — re-serializes JSON with the given indentation.
