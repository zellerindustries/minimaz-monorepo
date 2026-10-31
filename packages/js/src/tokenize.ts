import { punctuators2, punctuators3, punctuators4 } from './lexicon.js'

/** Kind of a lexical token. A template literal (including its `${}` expressions) is one token. */
export type TokenType = 'word' | 'number' | 'string' | 'template' | 'regex' | 'punct'

/** One lexical token of a JavaScript source. */
export interface Token {
    type: TokenType
    /** Verbatim source text of the token. */
    value: string
    /** Whether a line terminator (also one inside a block comment) separates it from the previous token. */
    newlineBefore: boolean
}

/** Result of {@link tokenize}. */
export interface TokenizeResult {
    /** The `#!…` first line without its line terminator, or `''`. */
    hashbang: string
    tokens: Token[]
    /**
     * Set (with no tokens) when the source has `<!--`, or `-->` at the start of a line, outside a
     * literal or comment: a comment in a script but operators in a module, so it cannot be
     * tokenized without knowing which one the source is.
     */
    htmlLikeComment?: true
}

/** Thrown by `scan` when it meets an HTML-like comment opener (see `TokenizeResult`). */
class HtmlLikeComment extends Error {}

const keywordsBeforeRegex = new Set([
    'return',
    'typeof',
    'instanceof',
    'in',
    'of',
    'new',
    'delete',
    'void',
    'throw',
    'yield',
    'case',
    'do',
    'else',
    'await',
    'default',
])

const parenHeaderKeywords = new Set(['if', 'while', 'for', 'with'])

const hexNumber = /0[xX][0-9a-fA-F_]*n?/y
const binOctNumber = /0[bBoO][0-9_]*n?/y
const decimalNumber = /(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?n?/y

function isLineTerminator(char: string): boolean {
    const code = char.charCodeAt(0)
    return code === 10 || code === 13 || code === 0x2028 || code === 0x2029
}

function isWhitespace(char: string): boolean {
    return /\s/.test(char)
}

function isDigit(char: string): boolean {
    return char >= '0' && char <= '9'
}

/**
 * Whether `char` can be part of an identifier (or start/continue a number or
 * regex flag run): ASCII word characters, `$`, any non-ASCII non-space code
 * unit, and the `\` / `#` that introduce escapes and private names.
 *
 * @param {string} char - A single UTF-16 code unit (or '')
 * @returns {boolean} True for an identifier-like character
 */
export function isIdentifierChar(char: string): boolean {
    if (char === '') {
        return false
    }
    if (char.charCodeAt(0) > 0x7f) {
        return !isWhitespace(char)
    }
    return /[A-Za-z0-9_$\\#]/.test(char)
}

/**
 * Whether `tokens[index]` is a property name, i.e. directly follows `.` or `?.`.
 *
 * @param {readonly Token[]} tokens - Token stream to inspect
 * @param {number} index - Index of the candidate token
 * @returns {boolean} True if the token follows `.` or `?.`
 */
export function isMemberName(tokens: readonly Token[], index: number): boolean {
    const before = tokens[index - 1]
    return before?.type === 'punct' && (before.value === '.' || before.value === '?.')
}

function matchSticky(pattern: RegExp, code: string, index: number): number {
    pattern.lastIndex = index
    const match = pattern.exec(code)
    return match === null ? -1 : index + match[0].length
}

function scanNumber(code: string, start: number): number {
    const next = code.charAt(start + 1)
    if (code.charAt(start) === '0' && (next === 'x' || next === 'X')) {
        return matchSticky(hexNumber, code, start)
    }
    if (code.charAt(start) === '0' && /[bBoO]/.test(next)) {
        return matchSticky(binOctNumber, code, start)
    }
    return matchSticky(decimalNumber, code, start)
}

function scanWord(code: string, start: number): number {
    let j = start
    if (code.charAt(j) === '#') {
        j++
    }
    while (j < code.length) {
        const char = code.charAt(j)
        if (char === '\\' && code.charAt(j + 1) === 'u') {
            if (code.charAt(j + 2) === '{') {
                const close = code.indexOf('}', j + 3)
                j = close === -1 ? code.length : close + 1
            } else {
                j = Math.min(j + 6, code.length)
            }
        } else if (char !== '\\' && isIdentifierChar(char)) {
            j++
        } else {
            break
        }
    }
    return Math.max(j, start + 1)
}

function scanString(code: string, start: number): number {
    const quote = code.charAt(start)
    let j = start + 1
    for (;;) {
        if (j >= code.length) {
            throw new Error(`minifyJs: unterminated string at offset ${String(start)}`)
        }
        const char = code.charAt(j)
        if (char === '\\') {
            j += code.charAt(j + 1) === '\r' && code.charAt(j + 2) === '\n' ? 3 : 2
            continue
        }
        if (char === quote) {
            return j + 1
        }
        if (char === '\n' || char === '\r') {
            throw new Error(`minifyJs: unterminated string at offset ${String(start)}`)
        }
        j++
    }
}

function scanRegex(code: string, start: number): number {
    let j = start + 1
    let inClass = false
    for (;;) {
        if (j >= code.length || isLineTerminator(code.charAt(j))) {
            throw new Error(`minifyJs: unterminated regex at offset ${String(start)}`)
        }
        const char = code.charAt(j)
        if (char === '\\') {
            if (isLineTerminator(code.charAt(j + 1))) {
                throw new Error(`minifyJs: unterminated regex at offset ${String(start)}`)
            }
            j += 2
            continue
        }
        if (char === '[') {
            inClass = true
        } else if (char === ']') {
            inClass = false
        } else if (char === '/' && !inClass) {
            break
        }
        j++
    }
    j++
    while (isIdentifierChar(code.charAt(j))) {
        j++
    }
    return j
}

/**
 * Scans a template literal starting at its opening backtick and returns the
 * index just past the closing one. `${}` expressions are only walked to find
 * where they end.
 */
function scanTemplate(code: string, start: number): number {
    let j = start + 1
    while (j < code.length) {
        const char = code.charAt(j)
        if (char === '\\') {
            j += 2
        } else if (char === '`') {
            return j + 1
        } else if (char === '$' && code.charAt(j + 1) === '{') {
            const end = scan(code, j + 2, [], true)
            if (end === -1) {
                break
            }
            j = end
        } else {
            j++
        }
    }
    throw new Error(`minifyJs: unterminated template literal at offset ${String(start)}`)
}

function scanPunct(code: string, index: number): string {
    const four = code.slice(index, index + 4)
    if (punctuators4.has(four)) {
        return four
    }
    const three = four.slice(0, 3)
    if (punctuators3.has(three)) {
        return three
    }
    const two = four.slice(0, 2)
    if (punctuators2.has(two) && !(two === '?.' && isDigit(code.charAt(index + 2)))) {
        return two
    }
    return code.charAt(index)
}

/**
 * Tokenizes from `start`, appending to `out`. With `untilBrace`, stops after
 * the `}` that closes an already-open `${` and returns the index past it (or
 * -1 when the input ends first); otherwise returns the end of input.
 */
function scan(code: string, start: number, out: Token[], untilBrace: boolean): number {
    const parenStack: boolean[] = []
    let lastParenWasHeader = false
    let braceDepth = 0
    let i = start
    let newlineBefore = false

    const regexAllowed = (): boolean => {
        const prev = out[out.length - 1]
        if (prev === undefined) {
            return true
        }
        switch (prev.type) {
            case 'word': {
                return !isMemberName(out, out.length - 1) && keywordsBeforeRegex.has(prev.value)
            }
            case 'number':
            case 'string':
            case 'template':
            case 'regex':
                return false
            case 'punct':
                if (prev.value === ')') {
                    return lastParenWasHeader
                }
                return prev.value !== ']' && prev.value !== '++' && prev.value !== '--'
        }
    }

    const push = (type: Token['type'], end: number): void => {
        out.push({ type, value: code.slice(i, end), newlineBefore })
        newlineBefore = false
        i = end
    }

    while (i < code.length) {
        const char = code.charAt(i)

        if (isWhitespace(char)) {
            if (isLineTerminator(char)) {
                newlineBefore = true
            }
            i++
            continue
        }

        if (char === '/' && code.charAt(i + 1) === '/') {
            while (i < code.length && !isLineTerminator(code.charAt(i))) {
                i++
            }
            continue
        }

        if (char === '/' && code.charAt(i + 1) === '*') {
            const close = code.indexOf('*/', i + 2)
            if (close === -1) {
                throw new Error(`minifyJs: unterminated block comment at offset ${String(i)}`)
            }
            for (let k = i; k < close; k++) {
                if (isLineTerminator(code.charAt(k))) {
                    newlineBefore = true
                    break
                }
            }
            i = close + 2
            continue
        }

        if (char === '"' || char === "'") {
            push('string', scanString(code, i))
            continue
        }

        if (char === '`') {
            push('template', scanTemplate(code, i))
            continue
        }

        if (isDigit(char) || (char === '.' && isDigit(code.charAt(i + 1)))) {
            push('number', scanNumber(code, i))
            continue
        }

        if (char === '/' && regexAllowed()) {
            push('regex', scanRegex(code, i))
            continue
        }

        if (isIdentifierChar(char)) {
            push('word', scanWord(code, i))
            continue
        }

        if (
            code.startsWith('<!--', i) ||
            ((newlineBefore || out.length === 0) && code.startsWith('-->', i))
        ) {
            throw new HtmlLikeComment()
        }
        const value = scanPunct(code, i)
        if (value === '(') {
            const prev = out[out.length - 1]
            parenStack.push(
                prev?.type === 'word' &&
                    !isMemberName(out, out.length - 1) &&
                    parenHeaderKeywords.has(prev.value),
            )
        } else if (value === ')') {
            lastParenWasHeader = parenStack.pop() ?? false
        } else if (value === '{') {
            braceDepth++
        } else if (value === '}') {
            if (untilBrace && braceDepth === 0) {
                return i + 1
            }
            braceDepth--
        }
        push('punct', i + value.length)
    }

    return untilBrace ? -1 : i
}

/**
 * Splits JavaScript source into tokens, dropping whitespace and comments but
 * recording whether a line terminator preceded each token. Regex-vs-division
 * is decided from the previous significant token (a heuristic, not a parser).
 *
 * @param {string} code - JavaScript source
 * @returns {TokenizeResult} The hashbang line (if any) and the tokens
 * @throws {Error} `minifyJs: …` on an unterminated string, template, regex or block comment
 */
export function tokenize(code: string): TokenizeResult {
    let hashbang = ''
    let start = 0
    if (code.startsWith('#!')) {
        while (start < code.length && !isLineTerminator(code.charAt(start))) {
            start++
        }
        hashbang = code.slice(0, start)
    }
    const tokens: Token[] = []
    try {
        scan(code, start, tokens, false)
    } catch (error) {
        if (error instanceof HtmlLikeComment) {
            return { hashbang, tokens: [], htmlLikeComment: true }
        }
        throw error
    }
    return { hashbang, tokens }
}
