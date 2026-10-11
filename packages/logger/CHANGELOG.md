# @minimaz/logger

## 0.2.1

### Patch Changes

- `handleCliError` no longer logs an unexpected error's full stack trace by default — matches `minimaz-cli`'s original `DEBUG=true` gate. Pass `--verbose` (or set `DEBUG=true`) to see the stack trace; otherwise only the error message is shown, followed by a hint on how to get the trace.

## 0.2.0

### Minor Changes

- @minimaz/logger now provides a KnownError marker class and a shared handleCliError() top-level error handler.
  ConfigNotFoundError, ValidationError, TemplateNotFoundError, and InvalidTemplateNameError now extend KnownError.
  @minimaz/cli's runCli() now always prints the stack trace for an unexpected (non-KnownError) failure instead of
  gating it behind DEBUG=true — a visible CLI output change.
