# @minimaz/validate

## 0.1.2

### Patch Changes

- `validateJs` now parses its input as JavaScript, so TypeScript-only syntax (type annotations, interfaces) is rejected instead of silently accepted. `validateHtml` understands HTML5 optional end tags (`li`, `p`, `dt`, `dd`, `tr`, `td`, `th`, `thead`, `tbody`, `tfoot`, `option`, `optgroup`, `colgroup`, `caption`, `rb`, `rt`, `rp`): they are closed implicitly by sibling start tags and parent end tags and no longer reported as unclosed, and a mismatched closing tag is reported once instead of cascading into an error per open tag.
- Updated dependencies [`38ce4e2`]:
    - @minimaz/logger@0.2.1

## 0.1.1

### Patch Changes

- @minimaz/logger now provides a KnownError marker class and a shared handleCliError() top-level error handler.
  ConfigNotFoundError, ValidationError, TemplateNotFoundError, and InvalidTemplateNameError now extend KnownError.
  @minimaz/cli's runCli() now always prints the stack trace for an unexpected (non-KnownError) failure instead of
  gating it behind DEBUG=true — a visible CLI output change.

- `validateHtml` no longer reports tags inside `<script>`, `<style>`, `<textarea>` and `<title>` contents.
- Updated dependencies [`7fc77c9`]:
    - @minimaz/logger@0.2.0
