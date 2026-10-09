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

function isIdentifierPart(char: string): boolean {
    return /[A-Za-z0-9_$]/.test(char)
}

function isIdentifierStart(char: string): boolean {
    return /[A-Za-z_$]/.test(char)
}

/**
 * Minifies JavaScript by stripping comments, deliberately conservative
 * about whitespace: trims each line and collapses consecutive blank lines,
 * but never joins lines or collapses whitespace across a newline — JS's
 * automatic semicolon insertion means removing the newline after `return`
 * (or `break`/`continue`/`throw`/postfix `++`/`--`) can silently change
 * behavior (`return\n{ a: 1 }` returns `undefined`, not the object).
 *
 * Regex-literal-vs-division disambiguation uses a preceding-token
 * heuristic (regex allowed at start of input, after most punctuators, and
 * after keywords like `return`/`typeof`; division assumed after
 * identifiers, numbers, strings, and `)`/`]`). This is a known-imperfect
 * heuristic — the same approach every non-full-parser JS minifier uses —
 * and can misjudge unusual code, most notably a regex literal immediately
 * after a `)` that closes an `if`/`while`/`for` condition rather than a
 * function call (`if (x) /re/.test(y)` is treated as division, matching
 * the far more common `foo(x) / 2` case instead).
 *
 * @param {string} code - JavaScript source to minify
 * @returns {string} Minified JavaScript
 */
export function minifyJs(code: string): string {
    if (typeof code !== 'string') {
        throw new Error('minifyJs: code must be a string')
    }

    let result = ''
    // Offsets in `result` of newlines inside a string or template literal body;
    // the trim/collapse pass must leave those untouched.
    const literalNewlines = new Set<number>()
    const appendLiteral = (text: string): void => {
        for (let k = text.indexOf('\n'); k !== -1; k = text.indexOf('\n', k + 1)) {
            literalNewlines.add(result.length + k)
        }
        result += text
    }
    let i = 0
    const len = code.length

    let inString: '"' | "'" | null = null
    const templateDepths: number[] = []
    let regexAllowed = true

    while (i < len) {
        const char = code.charAt(i)

        if (inString !== null) {
            appendLiteral(char)
            if (char === '\\' && i + 1 < len) {
                appendLiteral(code.charAt(i + 1))
                i += 2
                continue
            }
            if (char === inString) {
                inString = null
                regexAllowed = false
            }
            i++
            continue
        }

        if (templateDepths.length > 0 && templateDepths[templateDepths.length - 1] === 0) {
            if (char === '\\' && i + 1 < len) {
                appendLiteral(char + code.charAt(i + 1))
                i += 2
                continue
            }
            if (char === '`') {
                templateDepths.pop()
                result += char
                regexAllowed = false
                i++
                continue
            }
            if (char === '$' && code.charAt(i + 1) === '{') {
                templateDepths[templateDepths.length - 1] = 1
                result += '${'
                i += 2
                regexAllowed = true
                continue
            }
            appendLiteral(char)
            i++
            continue
        }

        if (char === '"' || char === "'") {
            inString = char
            result += char
            i++
            continue
        }

        if (char === '`') {
            templateDepths.push(0)
            result += char
            i++
            continue
        }

        if (
            char === '}' &&
            templateDepths.length > 0 &&
            (templateDepths[templateDepths.length - 1] ?? 0) > 0
        ) {
            const depth = templateDepths[templateDepths.length - 1] ?? 0
            templateDepths[templateDepths.length - 1] = depth === 1 ? 0 : depth - 1
            result += char
            regexAllowed = false
            i++
            continue
        }

        if (
            char === '{' &&
            templateDepths.length > 0 &&
            (templateDepths[templateDepths.length - 1] ?? 0) > 0
        ) {
            templateDepths[templateDepths.length - 1] =
                (templateDepths[templateDepths.length - 1] ?? 0) + 1
            result += char
            regexAllowed = true
            i++
            continue
        }

        if (char === '/' && !regexAllowed) {
            const next = code.charAt(i + 1)
            if (next === '/') {
                const end = code.indexOf('\n', i + 2)
                i = end === -1 ? len : end
                continue
            }
            if (next === '*') {
                const end = code.indexOf('*/', i + 2)
                i = end === -1 ? len : end + 2
                continue
            }
            result += char
            regexAllowed = true
            i++
            continue
        }

        if (char === '/' && regexAllowed) {
            const next = code.charAt(i + 1)
            if (next === '/') {
                const end = code.indexOf('\n', i + 2)
                i = end === -1 ? len : end
                continue
            }
            if (next === '*') {
                const end = code.indexOf('*/', i + 2)
                i = end === -1 ? len : end + 2
                continue
            }
            let j = i + 1
            let inClass = false
            while (j < len) {
                const c = code.charAt(j)
                if (c === '\\') {
                    j += 2
                    continue
                }
                if (c === '[') {
                    inClass = true
                } else if (c === ']') {
                    inClass = false
                } else if (c === '/' && !inClass) {
                    break
                } else if (c === '\n') {
                    break
                }
                j++
            }
            let flagsEnd = j + 1
            while (flagsEnd < len && isIdentifierPart(code.charAt(flagsEnd))) {
                flagsEnd++
            }
            result += code.slice(i, Math.min(flagsEnd, len))
            i = Math.min(flagsEnd, len)
            regexAllowed = false
            continue
        }

        if (/[0-9]/.test(char) || (char === '.' && /[0-9]/.test(code.charAt(i + 1)))) {
            let j = i
            if (char === '0' && (code.charAt(i + 1) === 'x' || code.charAt(i + 1) === 'X')) {
                j += 2
                while (j < len && /[0-9a-fA-F_]/.test(code.charAt(j))) {
                    j++
                }
            } else if (char === '0' && /[bBoO]/.test(code.charAt(i + 1))) {
                j += 2
                while (j < len && /[0-9_]/.test(code.charAt(j))) {
                    j++
                }
            } else {
                while (j < len && /[0-9_]/.test(code.charAt(j))) {
                    j++
                }
                if (code.charAt(j) === '.') {
                    j++
                    while (j < len && /[0-9_]/.test(code.charAt(j))) {
                        j++
                    }
                }
                if (code.charAt(j) === 'e' || code.charAt(j) === 'E') {
                    let k = j + 1
                    if (code.charAt(k) === '+' || code.charAt(k) === '-') {
                        k++
                    }
                    if (/[0-9]/.test(code.charAt(k))) {
                        j = k
                        while (j < len && /[0-9_]/.test(code.charAt(j))) {
                            j++
                        }
                    }
                }
            }
            if (code.charAt(j) === 'n') {
                j++
            }
            result += code.slice(i, j)
            i = j
            regexAllowed = false
            continue
        }

        if (isIdentifierStart(char)) {
            let j = i
            while (j < len && isIdentifierPart(code.charAt(j))) {
                j++
            }
            const word = code.slice(i, j)
            result += word
            regexAllowed = keywordsBeforeRegex.has(word)
            i = j
            continue
        }

        if (/\s/.test(char)) {
            result += char
            i++
            continue
        }

        result += char
        regexAllowed = !(char === ')' || char === ']')
        i++
    }

    const lines: string[] = []
    let lineStart = 0
    for (let k = result.indexOf('\n'); k !== -1; k = result.indexOf('\n', k + 1)) {
        if (!literalNewlines.has(k)) {
            lines.push(result.slice(lineStart, k).trim())
            lineStart = k + 1
        }
    }
    lines.push(result.slice(lineStart).trim())
    const collapsed: string[] = []
    let previousBlank = false
    for (const line of lines) {
        const isBlank = line === ''
        if (isBlank && previousBlank) {
            continue
        }
        collapsed.push(line)
        previousBlank = isBlank
    }

    return collapsed.join('\n').trim()
}
