import ts from 'typescript'
import { ValidationError } from './errors.js'

/**
 * Thrown by {@link validateTs} — carries every diagnostic found, not just
 * the first.
 */
export class TsValidationError extends ValidationError {
    constructor(errors: string[]) {
        super('TsValidationError', 'TypeScript validation error', errors)
    }
}

/**
 * Validates TypeScript (or TSX, when `options.jsx` is true) syntax via the
 * `typescript` package's `transpileModule` diagnostics. Only ever reports
 * genuine syntax errors — never type errors, since single-file transpile
 * mode has no type-checker/program context (a type error validates
 * successfully, matching `@minimaz/ts`'s `transpileTs` behavior).
 *
 * `compilerOptions.jsx` is omitted entirely when `options?.jsx` is falsy,
 * never set to `undefined` — `transpileModule`'s options validation
 * treats an explicitly-present `jsx: undefined` key as an invalid
 * `--jsx` value (verified empirically while building `@minimaz/ts`).
 *
 * @param {string} code - TypeScript source to validate
 * @param {{ jsx?: boolean }} [options] - Set `jsx: true` for `.tsx` input
 * @throws {TsValidationError} If the source has a syntax error
 */
export function validateTs(code: string, options?: { jsx?: boolean }): void {
    if (typeof code !== 'string') {
        throw new TsValidationError(['code must be a string'])
    }

    const compilerOptions: ts.CompilerOptions = {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        ...(options?.jsx ? { jsx: ts.JsxEmit.React } : {}),
    }

    const result = ts.transpileModule(code, {
        compilerOptions,
        reportDiagnostics: true,
    })

    if (result.diagnostics && result.diagnostics.length > 0) {
        const errors = result.diagnostics.map((diagnostic) =>
            ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        )
        throw new TsValidationError(errors)
    }
}
