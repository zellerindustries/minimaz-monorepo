/**
 * Parses a JSON string, throwing a clear, consistent error (the original
 * `SyntaxError` chained as `cause`) rather than letting a raw parser
 * error bubble up. Returns `unknown` — cast at the call site
 * (`parseJson(code) as MyType`) if you know the shape.
 *
 * @param {string} code - JSON source to parse
 * @returns {unknown} The parsed value
 */
export function parseJson(code: string): unknown {
    if (typeof code !== 'string') {
        throw new Error('parseJson: code must be a string')
    }

    try {
        return JSON.parse(code)
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`parseJson: invalid JSON: ${message}`, {
            cause: error,
        })
    }
}

/**
 * Minifies JSON by round-tripping it through {@link parseJson} and
 * re-serializing with no whitespace — the most compact valid form.
 *
 * @param {string} code - JSON source to minify
 * @returns {string} Minified JSON
 */
export function minifyJson(code: string): string {
    return JSON.stringify(parseJson(code))
}

/**
 * Pretty-prints JSON by round-tripping it through {@link parseJson} and
 * re-serializing with `indent` spaces of indentation.
 *
 * @param {string} code - JSON source to format
 * @param {number} [indent=4] - Number of spaces per indentation level
 * @returns {string} Formatted JSON
 */
export function formatJson(code: string, indent = 4): string {
    return JSON.stringify(parseJson(code), null, indent)
}
