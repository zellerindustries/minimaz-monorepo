# @minimaz/errors

Shared top-level CLI error classification and handling for Minimaz tools. Depends only on `@minimaz/logger`.

## Install

```bash
npm install @minimaz/errors
```

## Usage

```ts
import { KnownError, handleCliError } from '@minimaz/errors';

class ConfigNotFoundError extends KnownError {}

try {
    await run();
} catch (error: unknown) {
    handleCliError(error);
}
```

## API

- `KnownError` — marker base class for errors a CLI command anticipated (bad input, a missing file, a failed
  validation), as opposed to an unexpected bug. Extend it instead of `Error` to mark an error class as known.
- `handleCliError(error: unknown): void` — top-level CLI error handler. Logs a `KnownError`'s message only (plus
  any `errors: string[]` detail list it carries); for anything else, always logs the stack trace plus a
  "this looks like a bug" hint. Sets `process.exitCode = 1` in both cases.
