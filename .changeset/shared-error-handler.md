---
'@minimaz/cli': minor
'@minimaz/config': patch
'@minimaz/validate': patch
'@minimaz/templates': patch
---

Add @minimaz/errors: a KnownError marker class and shared handleCliError() top-level error handler.
ConfigNotFoundError, ValidationError, TemplateNotFoundError, and InvalidTemplateNameError now extend
KnownError. @minimaz/cli's runCli() now always prints the stack trace for an unexpected (non-KnownError)
failure instead of gating it behind DEBUG=true — a visible CLI output change.
