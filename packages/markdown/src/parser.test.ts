import { describe, expect, it } from "vitest";
import { parseMarkdown } from "./parser.js";

describe("parseMarkdown", () => {
    it("parses ATX headings of all levels", () => {
        const { document } = parseMarkdown("# One\n## Two\n### Three");
        expect(document.children).toEqual([
            {
                type: "heading",
                level: 1,
                children: [{ type: "text", value: "One" }],
            },
            {
                type: "heading",
                level: 2,
                children: [{ type: "text", value: "Two" }],
            },
            {
                type: "heading",
                level: 3,
                children: [{ type: "text", value: "Three" }],
            },
        ]);
    });

    it("parses a simple paragraph", () => {
        const { document } = parseMarkdown("Hello world.");
        expect(document.children).toEqual([
            {
                type: "paragraph",
                children: [{ type: "text", value: "Hello world." }],
            },
        ]);
    });

    it("joins wrapped paragraph lines with a soft break rendered as a space", () => {
        const { document } = parseMarkdown("Line one\nline two.");
        expect(document.children).toEqual([
            {
                type: "paragraph",
                children: [{ type: "text", value: "Line one line two." }],
            },
        ]);
    });

    it("treats a trailing double-space as a hard line break", () => {
        const { document } = parseMarkdown("Line one  \nline two.");
        expect(document.children).toEqual([
            {
                type: "paragraph",
                children: [
                    { type: "text", value: "Line one" },
                    { type: "break" },
                    { type: "text", value: "line two." },
                ],
            },
        ]);
    });

    it("parses strong and emphasis", () => {
        const { document } = parseMarkdown(
            "**bold** and *italic* and ***both***",
        );
        expect(document.children).toEqual([
            {
                type: "paragraph",
                children: [
                    {
                        type: "strong",
                        children: [{ type: "text", value: "bold" }],
                    },
                    { type: "text", value: " and " },
                    {
                        type: "emphasis",
                        children: [{ type: "text", value: "italic" }],
                    },
                    { type: "text", value: " and " },
                    {
                        type: "strong",
                        children: [
                            {
                                type: "emphasis",
                                children: [{ type: "text", value: "both" }],
                            },
                        ],
                    },
                ],
            },
        ]);
    });

    it("does not treat underscores inside a word as emphasis", () => {
        const { document } = parseMarkdown("snake_case_var");
        expect(document.children).toEqual([
            {
                type: "paragraph",
                children: [{ type: "text", value: "snake_case_var" }],
            },
        ]);
    });

    it("parses inline code spans", () => {
        const { document } = parseMarkdown("Use `const x = 1` here.");
        expect(document.children).toEqual([
            {
                type: "paragraph",
                children: [
                    { type: "text", value: "Use " },
                    { type: "inlineCode", value: "const x = 1" },
                    { type: "text", value: " here." },
                ],
            },
        ]);
    });

    it("parses fenced code blocks with a language", () => {
        const { document, errors } = parseMarkdown("```ts\nconst x = 1;\n```");
        expect(errors).toEqual([]);
        expect(document.children).toEqual([
            { type: "code", lang: "ts", content: "const x = 1;" },
        ]);
    });

    it("reports an unterminated fenced code block", () => {
        const { document, errors } = parseMarkdown("```ts\nconst x = 1;");
        expect(errors).toEqual(["Unterminated code fence opened at line 1"]);
        expect(document.children).toEqual([
            { type: "code", lang: "ts", content: "const x = 1;" },
        ]);
    });

    it("parses blockquotes", () => {
        const { document } = parseMarkdown("> quoted text");
        expect(document.children).toEqual([
            {
                type: "blockquote",
                children: [
                    {
                        type: "paragraph",
                        children: [{ type: "text", value: "quoted text" }],
                    },
                ],
            },
        ]);
    });

    it("parses an unordered list", () => {
        const { document } = parseMarkdown("- one\n- two\n- three");
        expect(document.children).toEqual([
            {
                type: "list",
                ordered: false,
                start: undefined,
                items: [
                    {
                        children: [
                            {
                                type: "paragraph",
                                children: [{ type: "text", value: "one" }],
                            },
                        ],
                    },
                    {
                        children: [
                            {
                                type: "paragraph",
                                children: [{ type: "text", value: "two" }],
                            },
                        ],
                    },
                    {
                        children: [
                            {
                                type: "paragraph",
                                children: [{ type: "text", value: "three" }],
                            },
                        ],
                    },
                ],
            },
        ]);
    });

    it("parses an ordered list preserving the start number", () => {
        const { document } = parseMarkdown("3. three\n4. four");
        const list = document.children[0];
        expect(list?.type).toBe("list");
        if (list?.type === "list") {
            expect(list.ordered).toBe(true);
            expect(list.start).toBe(3);
            expect(list.items).toHaveLength(2);
        }
    });

    it("parses a nested list via indentation", () => {
        const { document } = parseMarkdown("- parent\n  - child");
        const list = document.children[0];
        expect(list?.type).toBe("list");
        if (list?.type === "list") {
            const firstItem = list.items[0];
            expect(firstItem?.children).toHaveLength(2);
            expect(firstItem?.children[1]?.type).toBe("list");
        }
    });

    it("parses links and images", () => {
        const { document } = parseMarkdown(
            '[text](https://example.com "t") and ![alt](img.png)',
        );
        expect(document.children).toEqual([
            {
                type: "paragraph",
                children: [
                    {
                        type: "link",
                        url: "https://example.com",
                        title: "t",
                        children: [{ type: "text", value: "text" }],
                    },
                    { type: "text", value: " and " },
                    {
                        type: "image",
                        url: "img.png",
                        alt: "alt",
                        title: undefined,
                    },
                ],
            },
        ]);
    });

    it("parses a thematic break", () => {
        const { document } = parseMarkdown("---");
        expect(document.children).toEqual([{ type: "thematicBreak" }]);
    });

    it("unescapes backslash-escaped punctuation", () => {
        const { document } = parseMarkdown("\\*not emphasis\\*");
        expect(document.children).toEqual([
            {
                type: "paragraph",
                children: [{ type: "text", value: "*not emphasis*" }],
            },
        ]);
    });
});
