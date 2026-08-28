import { describe, expect, it } from "vitest";
import { validateMd } from "./validate.js";

describe("validateMd", () => {
    it("reports valid for well-formed markdown", () => {
        expect(
            validateMd("# Title\n\nSome *text* with a [link](url)."),
        ).toEqual({
            valid: true,
            errors: [],
        });
    });

    it("reports invalid for an unterminated fenced code block", () => {
        const result = validateMd("```js\nconsole.log(1)");
        expect(result.valid).toBe(false);
        expect(result.errors).toEqual([
            "Unterminated code fence opened at line 1",
        ]);
    });
});
