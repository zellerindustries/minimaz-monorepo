import { describe, expect, it } from 'vitest';
import { parseMarkdown } from './parser.js';
import { renderHtml } from './html.js';

function toHtml(markdown: string, options?: Parameters<typeof renderHtml>[1]): string {
    const { document } = parseMarkdown(markdown);
    return renderHtml(document, options);
}

describe('renderHtml', () => {
    it('renders a heading', () => {
        expect(toHtml('# Title')).toBe('<h1>Title</h1>');
    });

    it('renders a paragraph with strong and emphasis', () => {
        expect(toHtml('**bold** and *italic*')).toBe(
            '<p><strong>bold</strong> and <em>italic</em></p>',
        );
    });

    it('escapes HTML-significant characters in text so raw markup cannot inject', () => {
        expect(toHtml('<script>alert(1)</script>')).toBe(
            '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
        );
    });

    it('renders a tight unordered list without wrapping items in <p>', () => {
        expect(toHtml('- one\n- two')).toBe('<ul>\n<li>one</li>\n<li>two</li>\n</ul>');
    });

    it('renders an ordered list with a start attribute when not starting at 1', () => {
        expect(toHtml('3. three\n4. four')).toBe(
            '<ol start="3">\n<li>three</li>\n<li>four</li>\n</ol>',
        );
    });

    it('renders a fenced code block with a language class', () => {
        expect(toHtml('```ts\nconst x = 1;\n```')).toBe(
            '<pre><code class="language-ts">const x = 1;</code></pre>',
        );
    });

    it('renders a link with an href', () => {
        expect(toHtml('[text](https://example.com)')).toBe(
            '<p><a href="https://example.com">text</a></p>',
        );
    });

    it('renders block mode by default (no document shell)', () => {
        expect(toHtml('hi')).not.toContain('<!DOCTYPE html>');
    });

    it('renders a full page when full is true', () => {
        const out = toHtml('hi', { full: true, title: 'My Doc' });
        expect(out).toContain('<!DOCTYPE html>');
        expect(out).toContain('<title>My Doc</title>');
        expect(out).toContain('<p>hi</p>');
    });
});
