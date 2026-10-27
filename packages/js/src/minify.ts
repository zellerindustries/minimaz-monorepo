import { minifyTokens } from './minify-tokens.js'
import { parse, ParseError } from './parse.js'
import { print } from './print.js'
import { rename } from './rename.js'
import { analyze, ScopeError } from './scope.js'

/** Options for {@link minifyJs}. */
export interface MinifyOptions {
    /** Rename local bindings to short names (default `true`). */
    mangle?: boolean
}

/**
 * Minifies JavaScript: parses it, renames local bindings to the shortest safe names (unless
 * `mangle` is `false`) and prints the program with no optional whitespace, `;` only where needed
 * and minimal parentheses. Comments are dropped; a leading `#!` line is kept. Top-level bindings
 * are renamed only in files with `import`/`export`/`import.meta` (and never exported ones);
 * scopes that can see a direct `eval` or a `with` are left as they are.
 *
 * When the source cannot be parsed (a syntax error or an unsupported construct), or uses top-level
 * `await` without any other module syntax (it might be a sloppy script calling a function named
 * `await`), or is nested too deeply to process (a stack overflow), the token minifier is used
 * instead: it only strips comments and whitespace.
 *
 * @param code - JavaScript source to minify
 * @param options - See {@link MinifyOptions}
 * @returns Minified JavaScript
 * @throws {Error} `minifyJs: …` if `code` is not a string, or if it cannot be parsed and the token
 *   minifier then finds an unterminated string, template literal, regex or block comment (which can
 *   also be a misread regex-vs-division in valid code) or template literals nested too deeply
 */
export function minifyJs(code: string, options?: MinifyOptions): string {
    if (typeof code !== 'string') {
        throw new Error('minifyJs: code must be a string')
    }

    try {
        const program = parse(code)
        const analysis = analyze(program)
        // A module reached through `await` alone may really be a sloppy script that calls a
        // function named `await`: printing `await(x)` as `await x` would break it there.
        if (program.sourceType === 'module' && !analysis.hasModuleSyntax) {
            return minifyTokens(code)
        }
        if (options?.mangle !== false) {
            rename(analysis)
        }
        return print(program, { unresolved: analysis.unresolved })
    } catch (error) {
        if (error instanceof ParseError || error instanceof ScopeError || isStackOverflow(error)) {
            return minifyTokens(code)
        }
        throw error
    }
}

/**
 * Whether `error` is a stack overflow (V8: "Maximum call stack size exceeded", SpiderMonkey: "too
 * much recursion"), which deeply nested input causes since parsing, analysis and printing are
 * recursive. Any other `RangeError` is a bug and must propagate.
 */
function isStackOverflow(error: unknown): boolean {
    return error instanceof RangeError && /call stack|too much recursion/i.test(error.message)
}
