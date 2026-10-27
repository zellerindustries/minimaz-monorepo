import ts from 'typescript'

/**
 * Runs `ts.transpileModule` with diagnostics on and returns each diagnostic's
 * flattened message (empty when the source is syntactically valid).
 *
 * @param {string} code - Source to transpile
 * @param {string | undefined} fileName - File name deciding how the source is parsed; when
 *   `undefined`, `transpileModule` picks its own default (`module.ts`, or `module.tsx` with `jsx` set)
 * @param {ts.CompilerOptions} compilerOptions - Compiler options for the transpile
 * @returns {string[]} The diagnostic messages, in reported order
 */
export function transpileDiagnostics(
    code: string,
    fileName: string | undefined,
    compilerOptions: ts.CompilerOptions,
): string[] {
    const result = ts.transpileModule(code, {
        ...(fileName === undefined ? {} : { fileName }),
        compilerOptions,
        reportDiagnostics: true,
    })

    return (result.diagnostics ?? []).map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    )
}
