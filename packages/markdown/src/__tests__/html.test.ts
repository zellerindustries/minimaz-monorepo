import { describe, expect, it } from 'vitest'
import { parseMarkdown } from '../parser.js'
import { renderHtml } from '../html.js'
import type { Document } from '../types.js'

function toHtml(markdown: string, options?: Parameters<typeof renderHtml>[1]): string {
    const { document } = parseMarkdown(markdown)
    return renderHtml(document, options)
}

describe('renderHtml', () => {
    it('renders a heading', () => {
        expect(toHtml('# Title')).toBe('<h1>Title</h1>')
    })

    it('renders a paragraph with strong and emphasis', () => {
        expect(toHtml('**bold** and *italic*')).toBe(
            '<p><strong>bold</strong> and <em>italic</em></p>',
        )
    })

    it('escapes HTML-significant characters in text so raw markup cannot inject', () => {
        expect(toHtml('<script>alert(1)</script>')).toBe(
            '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
        )
    })

    it('renders a tight unordered list without wrapping items in <p>', () => {
        expect(toHtml('- one\n- two')).toBe('<ul>\n<li>one</li>\n<li>two</li>\n</ul>')
    })

    it('renders an ordered list with a start attribute when not starting at 1', () => {
        expect(toHtml('3. three\n4. four')).toBe(
            '<ol start="3">\n<li>three</li>\n<li>four</li>\n</ol>',
        )
    })

    it('renders a fenced code block with a language class', () => {
        expect(toHtml('```ts\nconst x = 1;\n```')).toBe(
            '<pre><code class="language-ts">const x = 1;</code></pre>',
        )
    })

    it('renders a link with an href', () => {
        expect(toHtml('[text](https://example.com)')).toBe(
            '<p><a href="https://example.com">text</a></p>',
        )
    })

    it('renders block mode by default (no document shell)', () => {
        expect(toHtml('hi')).not.toContain('<!DOCTYPE html>')
    })

    it('renders a full page when full is true', () => {
        const out = toHtml('hi', { full: true, title: 'My Doc' })
        expect(out).toContain('<!DOCTYPE html>')
        expect(out).toContain('<title>My Doc</title>')
        expect(out).toContain('<p>hi</p>')
    })

    it.each([
        ['javascript', '[click](<javascript:alert(1)>)'],
        ['mixed-case javascript', '[click](JavaScript:alert)'],
        ['tab-obfuscated javascript', '[click](<java\tscript:alert(1)>)'],
        ['vbscript', '[click](vbscript:msgbox)'],
        ['data', '[click](data:text/html;base64,PHNjcmlwdD4=)'],
    ])('renders a %s: link as plain text, with no href', (_name, markdown) => {
        expect(toHtml(markdown)).toBe('<p>click</p>')
    })

    describe('nodes rendered from a hand-built AST', () => {
        function render(...children: Document['children']): string {
            return renderHtml({ type: 'document', children })
        }

        it('renders inline code with escaped content', () => {
            expect(
                render({
                    type: 'paragraph',
                    children: [{ type: 'inlineCode', value: 'a<b' }],
                }),
            ).toBe('<p><code>a&lt;b</code></p>')
        })

        it('renders an image with escaped alt and an optional title', () => {
            expect(
                render({
                    type: 'paragraph',
                    children: [
                        { type: 'image', url: 'a.png', alt: 'say "hi"', title: 'T' },
                        { type: 'image', url: 'b.png', alt: 'b', title: undefined },
                    ],
                }),
            ).toBe(
                '<p><img src="a.png" alt="say &quot;hi&quot;" title="T" /><img src="b.png" alt="b" /></p>',
            )
        })

        it('renders a link title, escaped', () => {
            expect(
                render({
                    type: 'paragraph',
                    children: [
                        {
                            type: 'link',
                            url: '/x',
                            title: 'a&b',
                            children: [{ type: 'text', value: 'x' }],
                        },
                    ],
                }),
            ).toBe('<p><a href="/x" title="a&amp;b">x</a></p>')
        })

        it('renders a hard break', () => {
            expect(
                render({
                    type: 'paragraph',
                    children: [{ type: 'text', value: 'a' }, { type: 'break' }],
                }),
            ).toBe('<p>a<br />\n</p>')
        })

        it('renders a code block without a language class', () => {
            expect(render({ type: 'code', lang: undefined, content: '<x>' })).toBe(
                '<pre><code>&lt;x&gt;</code></pre>',
            )
        })

        it('renders a blockquote and a thematic break', () => {
            expect(
                render(
                    {
                        type: 'blockquote',
                        children: [{ type: 'paragraph', children: [{ type: 'text', value: 'q' }] }],
                    },
                    { type: 'thematicBreak' },
                ),
            ).toBe('<blockquote>\n<p>q</p>\n</blockquote>\n<hr />')
        })

        it('renders a list item with several blocks loosely, wrapped in <p>', () => {
            expect(
                render({
                    type: 'list',
                    ordered: true,
                    start: 1,
                    items: [
                        {
                            children: [
                                { type: 'paragraph', children: [{ type: 'text', value: 'a' }] },
                                { type: 'paragraph', children: [{ type: 'text', value: 'b' }] },
                            ],
                        },
                    ],
                }),
            ).toBe('<ol>\n<li><p>a</p>\n<p>b</p></li>\n</ol>')
        })
    })

    it('keeps ordinary link schemes and relative URLs clickable', () => {
        expect(toHtml('[a](mailto:x@example.com) [b](./page.html) [c](#top)')).toBe(
            '<p><a href="mailto:x@example.com">a</a> <a href="./page.html">b</a> <a href="#top">c</a></p>',
        )
    })
})
