import { parseMarkdown } from './parser.js';
import { renderHtml } from './html.js';
import type { RenderHtmlOptions } from './types.js';
import { renderPdf } from './pdf/index.js';

export { validateMd } from './validate.js';

/**
 * Converts a Markdown string to HTML — a bare fragment by default, or a
 * full `<html>` document when `options.full` is true.
 */
export function MdToHtml(markdown: string, options?: RenderHtmlOptions): string {
    const { document } = parseMarkdown(markdown);
    return renderHtml(document, options);
}

/**
 * Converts a Markdown string to a complete PDF file, returned as a byte
 * string (see pdf/writer.ts for why it's safe to write out as UTF-8).
 */
export function MdToPdf(markdown: string): string {
    const { document } = parseMarkdown(markdown);
    return renderPdf(document);
}
