const noSpaceChars = '{};,'

function isWhitespace(char: string): boolean {
    return char === ' ' || char === '\t' || char === '\n' || char === '\r' || char === '\f'
}

/**
 * Minifies CSS by stripping `/* ... *\/` comments and collapsing whitespace,
 * while preserving string-literal contents verbatim and never removing the
 * space immediately before a `:` — removing it can change a descendant
 * combinator into a pseudo-class (`a :hover` must not become `a:hover`).
 *
 * @param {string} code - CSS source to minify
 * @returns {string} Minified CSS
 */
export function minifyCss(code: string): string {
    if (typeof code !== 'string') {
        throw new Error('minifyCss: code must be a string')
    }

    let result = ''
    let i = 0
    const len = code.length
    let inString: '"' | "'" | null = null
    let lastNonSpace = ''

    while (i < len) {
        const char = code.charAt(i)

        if (inString !== null) {
            result += char
            if (char === '\\' && i + 1 < len) {
                result += code.charAt(i + 1)
                i += 2
                continue
            }
            if (char === inString) {
                inString = null
                lastNonSpace = char
            }
            i++
            continue
        }

        if (char === '"' || char === "'") {
            inString = char
            result += char
            i++
            continue
        }

        if (char === '/' && code.charAt(i + 1) === '*') {
            const end = code.indexOf('*/', i + 2)
            i = end === -1 ? len : end + 2
            continue
        }

        if (isWhitespace(char)) {
            let j = i
            while (j < len && isWhitespace(code.charAt(j))) {
                j++
            }
            const nextChar: string | undefined = j < len ? code.charAt(j) : undefined

            const removeEntirely =
                lastNonSpace === '' ||
                noSpaceChars.includes(lastNonSpace) ||
                lastNonSpace === ':' ||
                (nextChar !== undefined && noSpaceChars.includes(nextChar))

            if (nextChar !== undefined && !removeEntirely) {
                result += ' '
            }
            i = j
            continue
        }

        if (char === '}' && result.endsWith(';')) {
            result = result.slice(0, -1)
        }

        result += char
        lastNonSpace = char
        i++
    }

    return result.trim()
}
