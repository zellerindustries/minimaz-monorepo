# @minimaz/ts

TypeScript/TSX transpiler via the `typescript` compiler.

## Install

```bash
npm install @minimaz/ts
```

## Usage

```ts
import { transpileTs } from '@minimaz/ts';

const js = transpileTs(tsSource);
const jsx = transpileTs(tsxSource, { jsx: true });
```

## API

- `transpileTs(code, options?: { jsx?: boolean })` — strips types and transforms JSX using the `typescript`
  compiler. Type-stripping and JSX transform only — no type-checking (see [`@minimaz/validate`](../validate) for
  that).

Depends on `typescript`.
