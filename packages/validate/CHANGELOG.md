# @minimaz/validate

## 0.1.1

### Patch Changes

- @minimaz/logger now provides a KnownError marker class and a shared handleCliError() top-level error handler.
  ConfigNotFoundError, ValidationError, TemplateNotFoundError, and InvalidTemplateNameError now extend KnownError.
  @minimaz/cli's runCli() now always prints the stack trace for an unexpected (non-KnownError) failure instead of
  gating it behind DEBUG=true — a visible CLI output change.

- `validateHtml` no longer reports tags inside `<script>`, `<style>`, `<textarea>` and `<title>` contents.
- Updated dependencies [`7fc77c9`]:
    - @minimaz/logger@0.2.0
