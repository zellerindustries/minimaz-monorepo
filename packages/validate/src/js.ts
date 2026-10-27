import ts from 'typescript'
import { transpileDiagnostics } from './diagnostics.js'
import { ValidationError } from './errors.js'

/**
 * Thrown by {@link validateJs} — carries every diagnostic found, not just
 * the first.
 */
export class JsValidationError extends ValidationError {
    constructor(errors: string[]) {
        super('JsValidationError', 'JavaScript validation error', errors)
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
    if (typeof code !== 'string') {
        throw new JsValidationError(['code must be a string'])
    }

    // A .js fileName makes the parser treat the input as JavaScript, so TS-only
    // syntax (type annotations, interfaces) is reported; the default .ts name accepts it.
    const errors = transpileDiagnostics(code, 'input.js', {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        allowJs: true,
    })

    if (errors.length > 0) {
        throw new JsValidationError(errors)
    }
}
