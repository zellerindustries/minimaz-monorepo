import ts from 'typescript'

/**
 * Transpiles TypeScript (or TSX, when `options.jsx` is true) to JavaScript
 * via the `typescript` package's single-file transpile — type-stripping
 * and JSX transform only, no type-checking (a file with a type error still
 * transpiles, matching the non-checking behavior of the esbuild-based
 * original this replaces).
 *
 * @param {string} code - TypeScript source to transpile
 * @param {{ jsx?: boolean }} [options] - Set `jsx: true` for `.tsx` input
 * @param {boolean} [options.jsx] - Whether the input is TSX
 * @returns {string} Transpiled JavaScript
 */
export function transpileTs(code: string, options?: { jsx?: boolean }): string {
    if (typeof code !== 'string') {
        throw new Error('transpileTs: code must be a string')
    }

    const compilerOptions: ts.CompilerOptions = {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        ...(options?.jsx === true ? { jsx: ts.JsxEmit.React } : {}),
    }

    const result = ts.transpileModule(code, {
        compilerOptions,
        reportDiagnostics: true,
    })

    if (result.diagnostics && result.diagnostics.length > 0) {
        const messages = result.diagnostics.map((diagnostic) =>
            ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        )
        throw new Error(`transpileTs: syntax error(s):\n${messages.join('\n')}`)
    }

    return result.outputText
}
