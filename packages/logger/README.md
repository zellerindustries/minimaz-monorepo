# @minimaz/logger

Minimal, performance-oriented structured logger for Minimaz tools, plus the shared top-level CLI error handling
(`KnownError`, `handleCliError`). Zero dependencies.

## Install

```bash
npm install @minimaz/logger
```

## Usage

```ts
import { createLogger, handleCliError, KnownError } from '@minimaz/logger'

const log = createLogger('build')

log.info('Starting build')
log.warn(['Config field missing', 'using the default'])

try {
    if (!inputExists) {
        throw new KnownError('input directory is missing')
    }
} catch (error: unknown) {
    handleCliError(error)
}
```

Each line is tagged with the logger's context (`[build]`). With `VERBOSE=true` in the environment, `debug` and
`verbose` output is shown too and plain lines get a timestamp.

## API

- `createLogger(context = 'app')` — returns a logger bound to `context`, with `debug`, `default`, `error`, `info`,
  `success`, `verbose` and `warn` methods. Each takes a message or an array of messages (one line each).
- `log` — a ready-made logger with the `app` context.
- `KnownError` — marker base class for anticipated failures (bad input, a missing file, a failed validation), as
  opposed to bugs. Extend it for a package's own error types.
- `handleCliError(error)` — top-level handler for CLI entry points. Logs a `KnownError` as a plain message; logs
  anything else with a bug-report hint, plus its stack trace only in verbose mode (the CLI's `--verbose`) or with
  `DEBUG=true` (otherwise a hint on how to get it). Also logs each entry of an `errors: string[]` detail
  array when the error carries one, and sets `process.exitCode = 1`.
- `LogType` — the log-level union type.
