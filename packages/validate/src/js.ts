import ts from "typescript";
import { ValidationError } from "./errors.js";

/**
 * Thrown by {@link validateJs} — carries every diagnostic found, not just
 * the first.
 */
export class JsValidationError extends ValidationError {
    constructor(errors: string[]) {
        super("JsValidationError", "JavaScript validation error", errors);
    }
}

/**
 * Validates JavaScript syntax via the `typescript` package's
 * `transpileModule` diagnostics — the TS parser accepts plain JS, so this
 * only ever reports genuine syntax errors, never type errors (there is no
 * type-checker/program context in single-file transpile mode).
 *
 * @param {string} code - JavaScript source to validate
 * @throws {JsValidationError} If the source has a syntax error
 */
export function validateJs(code: string): void {
    if (typeof code !== "string") {
        throw new JsValidationError(["code must be a string"]);
    }

    const result = ts.transpileModule(code, {
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
        },
        reportDiagnostics: true,
    });

    if (result.diagnostics && result.diagnostics.length > 0) {
        const errors = result.diagnostics.map((diagnostic) =>
            ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        );
        throw new JsValidationError(errors);
    }
}
