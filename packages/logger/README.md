# @minimaz/logger

Minimal, performance-oriented structured logger for Minimaz tools. Zero dependencies.

## Install

```bash
npm install @minimaz/logger
```

## Usage

```ts
import { createLogger } from "@minimaz/logger";

const log = createLogger("build");

log.info("Starting build");
log.warn("Config field missing, using default");
log.error("Build failed", { cause: error });
```

`createLogger(context = 'app')` returns a logger whose output lines are prefixed with a timestamp and the given
context.

## API

- `createLogger(context?: string)` — returns a logger bound to `context`.
- `emit(...)`, `print(type, message, context)`, `formatTs(date?)`, `formatContext(context)`, `normalize(message)`,
  `ts()` — lower-level building blocks `createLogger` is built from, exported for reuse.
- `LogType` and related types — see `src/types.ts`.
