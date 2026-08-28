import { describe, expect, it } from "vitest";
import { parseMarkdown } from "../parser.js";
import { renderPdf } from "./render.js";

function toPdf(markdown: string): string {
    const { document } = parseMarkdown(markdown);
    return renderPdf(document);
}

describe("renderPdf", () => {
    it("produces a well-formed single-page PDF for simple content", () => {
        const pdf = toPdf("# Title\n\nSome paragraph text.");
        expect(pdf.startsWith("%PDF-1.4\n")).toBe(true);
        expect(pdf.endsWith("%%EOF")).toBe(true);
        expect(pdf).toContain("/Type /Catalog");
        expect(pdf).toContain("/Type /Pages");
        expect((pdf.match(/\/Type \/Page\b/g) ?? []).length).toBe(1);
        expect(pdf).toContain("/BaseFont /Courier");
    });

    it("stays byte-safe ASCII (ready for utf8-encoded writes)", () => {
        const pdf = toPdf("Café — “fancy quotes” and emoji 🎉");
        for (let i = 0; i < pdf.length; i++) {
            expect(pdf.charCodeAt(i)).toBeLessThanOrEqual(0x7e);
        }
        expect(pdf).toContain("?");
    });

    it("escapes parentheses and backslashes inside text-show operators", () => {
        const pdf = toPdf("Look at this (parenthetical) and a \\backslash");
        expect(pdf).toContain("\\(parenthetical\\)");
    });

    it("breaks content across multiple pages when it overflows one page", () => {
        const longDoc = Array.from(
            { length: 200 },
            (_, i) => `Paragraph number ${String(i)}.`,
        ).join("\n\n");
        const pdf = toPdf(longDoc);
        const pageCount = (pdf.match(/\/Type \/Page\b/g) ?? []).length;
        expect(pageCount).toBeGreaterThan(1);
        const kidsMatch = /\/Kids \[([^\]]*)\]/.exec(pdf);
        expect(kidsMatch).not.toBeNull();
        const kidsCount = (kidsMatch?.[1]?.match(/\d+ 0 R/g) ?? []).length;
        expect(kidsCount).toBe(pageCount);
    });

    it("does not throw for headings, lists, blockquotes, code, links, images and hr", () => {
        const markdown = [
            "# Heading",
            "",
            "- one",
            "- two",
            "",
            "> a quote",
            "",
            "```js",
            "const x = 1;",
            "```",
            "",
            "[link](https://example.com) and ![alt](img.png)",
            "",
            "---",
        ].join("\n");
        expect(() => toPdf(markdown)).not.toThrow();
    });
});
