# @minimaz/markdown

Dependency-free Markdown parser with HTML and PDF renderers.

## Install

```bash
npm install @minimaz/markdown
```

## Usage

```ts
import { mdToHtml, mdToPdf, validateMd } from '@minimaz/markdown'

const fragment = mdToHtml(markdownSource)
const fullPage = mdToHtml(markdownSource, { full: true }) // wraps in a complete <html> document

const pdfBytes = mdToPdf(markdownSource) // returned as a byte string

const result = validateMd(markdownSource)
```

## API

- `mdToHtml(markdown, options?: RenderHtmlOptions)` — parses and renders Markdown to HTML. `options.full` wraps
  the output in a complete `<html>` document instead of a bare fragment.
- `mdToPdf(markdown)` — parses and renders Markdown directly to a PDF file.
- `validateMd(markdown)` — structurally validates Markdown source.

No runtime dependencies — includes its own parser, HTML renderer, and PDF writer/layout engine.
