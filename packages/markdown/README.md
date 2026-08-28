# @minimaz/markdown

Dependency-free Markdown parser with HTML and PDF renderers.

## Install

```bash
npm install @minimaz/markdown
```

## Usage

```ts
import { MdToHtml, MdToPdf, validateMd } from '@minimaz/markdown';

const fragment = MdToHtml(markdownSource);
const fullPage = MdToHtml(markdownSource, { full: true }); // wraps in a complete <html> document

const pdfBytes = MdToPdf(markdownSource); // returned as a byte string

const result = validateMd(markdownSource);
```

## API

- `MdToHtml(markdown, options?: RenderHtmlOptions)` — parses and renders Markdown to HTML. `options.full` wraps
  the output in a complete `<html>` document instead of a bare fragment.
- `MdToPdf(markdown)` — parses and renders Markdown directly to a PDF file.
- `validateMd(markdown)` — structurally validates Markdown source.

No runtime dependencies — includes its own parser, HTML renderer, and PDF writer/layout engine.
