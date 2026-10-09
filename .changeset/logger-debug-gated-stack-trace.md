---
'@minimaz/logger': patch
---

`handleCliError` no longer logs an unexpected error's full stack trace by default — matches `minimaz-cli`'s original `DEBUG=true` gate. Pass `--verbose` (or set `DEBUG=true`) to see the stack trace; otherwise only the error message is shown, followed by a hint on how to get the trace.
