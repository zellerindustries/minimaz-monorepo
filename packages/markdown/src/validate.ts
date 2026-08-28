import type { ValidateMdResult } from "./types.js";
import { parseMarkdown } from "./parser.js";

/**
 * Lightweight structural validation, not full CommonMark conformance.
 * Markdown degrades gracefully by design (almost anything is "valid"
 * prose), so this only flags the one unambiguous authoring mistake the
 * parser can detect: a fenced code block that never closes and silently
 * swallows the rest of the document.
 */
export function validateMd(markdown: string): ValidateMdResult {
    const { errors } = parseMarkdown(markdown);
    return { valid: errors.length === 0, errors };
}
