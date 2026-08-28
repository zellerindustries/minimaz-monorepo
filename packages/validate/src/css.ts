import { ValidationError } from "./errors.js";

/**
 * Thrown by {@link validateCss} — carries every problem found, not just
 * the first.
 */
export class CssValidationError extends ValidationError {
    constructor(errors: string[]) {
        super("CssValidationError", "CSS validation error", errors);
    }
}

/**
 * Validates CSS structurally: brace `{}` balance, parenthesis `()` balance
 * (covers `url()`/`calc()`/media-query conditions), and no unterminated
 * string literal or `/* *\/` comment at EOF. String-aware — brace/paren
 * characters inside a string literal never affect the balance count.
 *
 * This is a structural check only, not a full CSS grammar/semantic
 * validator: it cannot catch a `}` appearing before its matching `{` as
 * long as the net brace count still balances by EOF, and it does not
 * validate property names, values, or selector syntax.
 *
 * @param {string} code - CSS source to validate
 * @throws {CssValidationError} If any structural problem is found
 */
export function validateCss(code: string): void {
    if (typeof code !== "string") {
        throw new CssValidationError(["code must be a string"]);
    }

    const errors: string[] = [];
    let i = 0;
    const len = code.length;
    let inString: '"' | "'" | null = null;
    let braceDepth = 0;
    let parenDepth = 0;

    while (i < len) {
        const char = code.charAt(i);

        if (inString) {
            if (char === "\\" && i + 1 < len) {
                i += 2;
                continue;
            }
            if (char === inString) {
                inString = null;
            }
            i++;
            continue;
        }

        if (char === '"' || char === "'") {
            inString = char;
            i++;
            continue;
        }

        if (char === "/" && code.charAt(i + 1) === "*") {
            const end = code.indexOf("*/", i + 2);
            if (end === -1) {
                errors.push("unterminated comment");
                i = len;
                continue;
            }
            i = end + 2;
            continue;
        }

        if (char === "{") {
            braceDepth++;
            i++;
            continue;
        }
        if (char === "}") {
            braceDepth--;
            i++;
            continue;
        }
        if (char === "(") {
            parenDepth++;
            i++;
            continue;
        }
        if (char === ")") {
            parenDepth--;
            i++;
            continue;
        }

        i++;
    }

    if (inString) {
        errors.push("unterminated string literal");
    }
    if (braceDepth !== 0) {
        errors.push(`unbalanced braces (depth ${String(braceDepth)})`);
    }
    if (parenDepth !== 0) {
        errors.push(`unbalanced parentheses (depth ${String(parenDepth)})`);
    }

    if (errors.length > 0) {
        throw new CssValidationError(errors);
    }
}
