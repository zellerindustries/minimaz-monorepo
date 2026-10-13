import { describe, expect, it } from 'vitest'
import { parseMarkdown } from '../parser.js'

describe('parseMarkdown', () => {
    it('parses ATX headings of all levels', () => {
        const { document } = parseMarkdown('# One\n## Two\n### Three')
        expect(document.children).toEqual([
            {
                type: 'heading',
                level: 1,
                children: [{ type: 'text', value: 'One' }],
            },
            {
                type: 'heading',
                level: 2,
                children: [{ type: 'text', value: 'Two' }],
            },
            {
                type: 'heading',
                level: 3,
                children: [{ type: 'text', value: 'Three' }],
            },
        ])
    })

    it('parses a simple paragraph', () => {
        const { document } = parseMarkdown('Hello world.')
        expect(document.children).toEqual([
            {
                type: 'paragraph',
                children: [{ type: 'text', value: 'Hello world.' }],
            },
        ])
    })

    it('joins wrapped paragraph lines with a soft break rendered as a space', () => {
        const { document } = parseMarkdown('Line one\nline two.')
        expect(document.children).toEqual([
            {
                type: 'paragraph',
                children: [{ type: 'text', value: 'Line one line two.' }],
            },
        ])
    })

    it('treats a trailing double-space as a hard line break', () => {
        const { document } = parseMarkdown('Line one  \nline two.')
        expect(document.children).toEqual([
            {
                type: 'paragraph',
                children: [
                    { type: 'text', value: 'Line one' },
                    { type: 'break' },
                    { type: 'text', value: 'line two.' },
                ],
            },
        ])
    })

    it('parses strong and emphasis', () => {
        const { document } = parseMarkdown('**bold** and *italic* and ***both***')
        expect(document.children).toEqual([
            {
                type: 'paragraph',
                children: [
                    {
                        type: 'strong',
                        children: [{ type: 'text', value: 'bold' }],
                    },
                    { type: 'text', value: ' and ' },
                    {
                        type: 'emphasis',
                        children: [{ type: 'text', value: 'italic' }],
                    },
                    { type: 'text', value: ' and ' },
                    {
                        type: 'strong',
                        children: [
                            {
                                type: 'emphasis',
                                children: [{ type: 'text', value: 'both' }],
                            },
                        ],
                    },
                ],
            },
        ])
    })

    it('does not treat underscores inside a word as emphasis', () => {
        const { document } = parseMarkdown('snake_case_var')
        expect(document.children).toEqual([
            {
                type: 'paragraph',
                children: [{ type: 'text', value: 'snake_case_var' }],
            },
        ])
    })

    it('parses inline code spans', () => {
        const { document } = parseMarkdown('Use `const x = 1` here.')
        expect(document.children).toEqual([
            {
                type: 'paragraph',
                children: [
                    { type: 'text', value: 'Use ' },
                    { type: 'inlineCode', value: 'const x = 1' },
                    { type: 'text', value: ' here.' },
                ],
            },
        ])
    })

    it('parses fenced code blocks with a language', () => {
        const { document, errors } = parseMarkdown('```ts\nconst x = 1;\n```')
        expect(errors).toEqual([])
        expect(document.children).toEqual([{ type: 'code', lang: 'ts', content: 'const x = 1;' }])
    })

    it('reports an unterminated fenced code block', () => {
        const { document, errors } = parseMarkdown('```ts\nconst x = 1;')
        expect(errors).toEqual(['Unterminated code fence opened at line 1'])
        expect(document.children).toEqual([{ type: 'code', lang: 'ts', content: 'const x = 1;' }])
    })

    it('parses blockquotes', () => {
        const { document } = parseMarkdown('> quoted text')
        expect(document.children).toEqual([
            {
                type: 'blockquote',
                children: [
                    {
                        type: 'paragraph',
                        children: [{ type: 'text', value: 'quoted text' }],
                    },
                ],
            },
        ])
    })

    it('parses an unordered list', () => {
        const { document } = parseMarkdown('- one\n- two\n- three')
        expect(document.children).toEqual([
            {
                type: 'list',
                ordered: false,
                start: undefined,
                items: [
                    {
                        children: [
                            {
                                type: 'paragraph',
                                children: [{ type: 'text', value: 'one' }],
                            },
                        ],
                    },
                    {
                        children: [
                            {
                                type: 'paragraph',
                                children: [{ type: 'text', value: 'two' }],
                            },
                        ],
                    },
                    {
                        children: [
                            {
                                type: 'paragraph',
                                children: [{ type: 'text', value: 'three' }],
                            },
                        ],
                    },
                ],
            },
        ])
    })

    it('parses an ordered list preserving the start number', () => {
        const { document } = parseMarkdown('3. three\n4. four')
        const list = document.children[0]
        expect(list?.type).toBe('list')
        if (list?.type === 'list') {
            expect(list.ordered).toBe(true)
            expect(list.start).toBe(3)
            expect(list.items).toHaveLength(2)
        }
    })

    it('parses a nested list via indentation', () => {
        const { document } = parseMarkdown('- parent\n  - child')
        const list = document.children[0]
        expect(list?.type).toBe('list')
        if (list?.type === 'list') {
            const firstItem = list.items[0]
            expect(firstItem?.children).toHaveLength(2)
            expect(firstItem?.children[1]?.type).toBe('list')
        }
    })

    it('parses links and images', () => {
        const { document } = parseMarkdown('[text](https://example.com "t") and ![alt](img.png)')
        expect(document.children).toEqual([
            {
                type: 'paragraph',
                children: [
                    {
                        type: 'link',
                        url: 'https://example.com',
                        title: 't',
                        children: [{ type: 'text', value: 'text' }],
                    },
                    { type: 'text', value: ' and ' },
                    {
                        type: 'image',
                        url: 'img.png',
                        alt: 'alt',
                        title: undefined,
                    },
                ],
            },
        ])
    })

    it('parses a thematic break', () => {
        const { document } = parseMarkdown('---')
        expect(document.children).toEqual([{ type: 'thematicBreak' }])
    })

    it('unescapes backslash-escaped punctuation', () => {
        const { document } = parseMarkdown('\\*not emphasis\\*')
        expect(document.children).toEqual([
            {
                type: 'paragraph',
                children: [{ type: 'text', value: '*not emphasis*' }],
            },
        ])
    })

    describe('hard breaks', () => {
        it('treats a trailing backslash as a hard line break', () => {
            const { document } = parseMarkdown('one\\\ntwo')
            expect(document.children).toEqual([
                {
                    type: 'paragraph',
                    children: [
                        { type: 'text', value: 'one' },
                        { type: 'break' },
                        { type: 'text', value: 'two' },
                    ],
                },
            ])
        })
    })

    describe('unmatched emphasis delimiters', () => {
        it.each([['a *'], ['a * foo*'], ['*a'], ['**a'], ['_a_b']])(
            'degrades %j to literal text',
            (input) => {
                const { document, errors } = parseMarkdown(input)
                expect(errors).toEqual([])
                expect(document.children).toEqual([
                    { type: 'paragraph', children: [{ type: 'text', value: input }] },
                ])
            },
        )

        it('keeps the surplus opening asterisk as text when only a shorter run closes', () => {
            const { document } = parseMarkdown('**a*')
            expect(document.children).toEqual([
                {
                    type: 'paragraph',
                    children: [
                        { type: 'text', value: '*' },
                        { type: 'emphasis', children: [{ type: 'text', value: 'a' }] },
                    ],
                },
            ])
        })

        it('keeps two surplus asterisks when a triple run is closed by a single one', () => {
            const { document } = parseMarkdown('***a*')
            expect(document.children).toEqual([
                {
                    type: 'paragraph',
                    children: [
                        { type: 'text', value: '**' },
                        { type: 'emphasis', children: [{ type: 'text', value: 'a' }] },
                    ],
                },
            ])
        })
    })

    describe('inline code edge cases', () => {
        it('supports multi-backtick spans containing a single backtick', () => {
            const { document } = parseMarkdown('``a`b``')
            expect(document.children).toEqual([
                { type: 'paragraph', children: [{ type: 'inlineCode', value: 'a`b' }] },
            ])
        })

        it('strips one surrounding space pair from a code span', () => {
            const { document } = parseMarkdown('` a `')
            expect(document.children).toEqual([
                { type: 'paragraph', children: [{ type: 'inlineCode', value: 'a' }] },
            ])
        })

        it('keeps an all-space code span unstripped', () => {
            const { document } = parseMarkdown('`  `')
            expect(document.children).toEqual([
                { type: 'paragraph', children: [{ type: 'inlineCode', value: '  ' }] },
            ])
        })

        it.each([['`a'], ['``a`']])('treats an unclosed backtick run in %j as text', (input) => {
            const { document } = parseMarkdown(input)
            expect(document.children).toEqual([
                { type: 'paragraph', children: [{ type: 'text', value: input }] },
            ])
        })
    })

    describe('link and image edge cases', () => {
        it('handles nested brackets inside a link label', () => {
            const { document } = parseMarkdown('[a [b] c](u)')
            expect(document.children).toEqual([
                {
                    type: 'paragraph',
                    children: [
                        {
                            type: 'link',
                            url: 'u',
                            title: undefined,
                            children: [{ type: 'text', value: 'a [b] c' }],
                        },
                    ],
                },
            ])
        })

        it('skips an escaped bracket inside a link label', () => {
            const { document } = parseMarkdown('[a\\]b](u)')
            expect(document.children).toEqual([
                {
                    type: 'paragraph',
                    children: [
                        {
                            type: 'link',
                            url: 'u',
                            title: undefined,
                            children: [{ type: 'text', value: 'a]b' }],
                        },
                    ],
                },
            ])
        })

        it('parses an angle-bracketed destination with a single-quoted title', () => {
            const { document } = parseMarkdown("[a](<b c> 't')")
            expect(document.children).toEqual([
                {
                    type: 'paragraph',
                    children: [
                        {
                            type: 'link',
                            url: 'b c',
                            title: 't',
                            children: [{ type: 'text', value: 'a' }],
                        },
                    ],
                },
            ])
        })

        it.each([['[abc'], ['[a] b'], ['[a](b c d)'], ['![a'], ['![x] y']])(
            'degrades malformed %j to literal text',
            (input) => {
                const { document } = parseMarkdown(input)
                expect(document.children).toEqual([
                    { type: 'paragraph', children: [{ type: 'text', value: input }] },
                ])
            },
        )
    })

    describe('block edge cases', () => {
        it('parses an empty heading and strips closing hashes', () => {
            const { document } = parseMarkdown('#\n## Title ##')
            expect(document.children).toEqual([
                { type: 'heading', level: 1, children: [] },
                { type: 'heading', level: 2, children: [{ type: 'text', value: 'Title' }] },
            ])
        })

        it('does not close a tilde fence with backticks or a shorter fence', () => {
            const { document, errors } = parseMarkdown('~~~\nx\n```\n~~~')
            expect(errors).toEqual([])
            expect(document.children).toEqual([
                { type: 'code', lang: undefined, content: 'x\n```' },
            ])

            const longer = parseMarkdown('````\nx\n```\n````')
            expect(longer.errors).toEqual([])
            expect(longer.document.children).toEqual([
                { type: 'code', lang: undefined, content: 'x\n```' },
            ])
        })

        it('parses a bare marker as an empty list item and a ")" ordered marker', () => {
            const { document } = parseMarkdown('-\n\n1) x')
            expect(document.children).toEqual([
                { type: 'list', ordered: false, start: undefined, items: [{ children: [] }] },
                {
                    type: 'list',
                    ordered: true,
                    start: 1,
                    items: [
                        {
                            children: [
                                { type: 'paragraph', children: [{ type: 'text', value: 'x' }] },
                            ],
                        },
                    ],
                },
            ])
        })

        it('starts a new list when the marker kind changes', () => {
            const { document } = parseMarkdown('- a\n1. b')
            expect(document.children.map((b) => b.type)).toEqual(['list', 'list'])
        })

        it('keeps blank-line separated paragraphs inside one list item', () => {
            const { document } = parseMarkdown('- a\n\n  b\n- c')
            const list = document.children[0]
            expect(document.children).toHaveLength(1)
            expect(list?.type).toBe('list')
            if (list?.type === 'list') {
                expect(list.items).toHaveLength(2)
                expect(list.items[0]?.children.map((b) => b.type)).toEqual([
                    'paragraph',
                    'paragraph',
                ])
            }
        })

        it('ends a list at an unindented paragraph after a blank line', () => {
            const { document } = parseMarkdown('- a\n\npara')
            expect(document.children.map((b) => b.type)).toEqual(['list', 'paragraph'])
        })

        it('parses a nested list inside a blockquote', () => {
            const { document } = parseMarkdown('> - a\n>   - b')
            const quote = document.children[0]
            expect(quote?.type).toBe('blockquote')
            if (quote?.type === 'blockquote') {
                const list = quote.children[0]
                expect(list?.type).toBe('list')
                if (list?.type === 'list') {
                    expect(list.items[0]?.children.map((b) => b.type)).toEqual([
                        'paragraph',
                        'list',
                    ])
                }
            }
        })

        it('reports the absolute line of an unterminated fence inside a blockquote', () => {
            const { document, errors } = parseMarkdown('> a\n>\n> ```\n> code')
            expect(errors).toEqual(['Unterminated code fence opened at line 3'])
            expect(document.children).toHaveLength(1)
        })

        it('treats table syntax as a plain paragraph (tables are unsupported)', () => {
            const { document, errors } = parseMarkdown('| a |  |\n|---|---|')
            expect(errors).toEqual([])
            expect(document.children).toEqual([
                {
                    type: 'paragraph',
                    children: [{ type: 'text', value: '| a |  | |---|---|' }],
                },
            ])
        })
    })
})
