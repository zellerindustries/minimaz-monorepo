import { parseMarkdown } from './parser.js'
import { renderHtml } from './html.js'
import type { RenderHtmlOptions } from './types.js'
import { renderPdf } from './pdf/index.js'

export { validateMd } from './validate.js'

/**
 * Converts a Markdown string to HTML — a bare fragment by default, or a
 * full `<html>` document when `options.full` is true. Lenient: structural
 * errors (e.g. an unterminated code fence) never throw — call `validateMd`
 * first to detect them. Links with `javascript:`, `vbscript:` or `data:`
 * URLs render as their plain link text, with no `<a>`.
 *
 * @param {string} markdown - Markdown source to convert
 * @param {RenderHtmlOptions} [options] - Rendering options (full page vs fragment, page title)
 * @returns {string} Rendered HTML
 */
export function mdToHtml(markdown: string, options?: RenderHtmlOptions): string {
    const { document } = parseMarkdown(markdown)
    return renderHtml(document, options)
}

/**
 * Converts a Markdown string to a complete PDF file, returned as a byte
 * string (see pdf/writer.ts for why it's safe to write out as UTF-8).
 * Lenient like `mdToHtml` — call `validateMd` first to detect structural errors.
 *
 * @param {string} markdown - Markdown source to convert
 * @returns {string} PDF file contents as a byte string
 */
export function mdToPdf(markdown: string): string {
    const { document } = parseMarkdown(markdown)
    return renderPdf(document)
}
