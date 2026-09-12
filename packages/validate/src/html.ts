import { ValidationError } from './errors.js'

const VOID_ELEMENTS = new Set([
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'link',
    'meta',
    'source',
    'track',
    'wbr',
])

/**
 * Thrown by {@link validateHtml} — carries every problem found, not just
 * the first.
 */
export class HtmlValidationError extends ValidationError {
    constructor(errors: string[]) {
        super('HtmlValidationError', 'HTML validation error', errors)
    }
}

/**
 * Validates HTML structurally via stack-based tag matching: an opening tag
 * pushes onto the stack, a closing tag must match the top of the stack
 * (mismatch or an unclosed tag remaining at EOF is an error). Void elements
 * (`br`, `img`, `input`, etc.) never need a closing tag and never push.
 * Also flags an unterminated quoted attribute and a `<` with no matching
 * `>`.
 *
 * This is a structural check only: it does not validate attribute
 * grammar, DOCTYPE correctness, or anything semantic.
 *
 * @param {string} code - HTML source to validate
 * @throws {HtmlValidationError} If any structural problem is found
 */
export function validateHtml(code: string): void {
    if (typeof code !== 'string') {
        throw new HtmlValidationError(['code must be a string'])
    }

    const errors: string[] = []
    const stack: string[] = []
    let i = 0
    const len = code.length

    while (i < len) {
        const char = code.charAt(i)

        if (char !== '<') {
            i++
            continue
        }

        if (code.slice(i, i + 4) === '<!--') {
            const end = code.indexOf('-->', i + 4)
            if (end === -1) {
                errors.push('unterminated comment')
                i = len
                continue
            }
            i = end + 3
            continue
        }

        let j = i + 1
        let quote: '"' | "'" | null = null
        while (j < len) {
            const c = code.charAt(j)
            if (quote) {
                if (c === quote) {
                    quote = null
                }
                j++
                continue
            }
            if (c === '"' || c === "'") {
                quote = c
                j++
                continue
            }
            if (c === '>') {
                break
            }
            j++
        }

        if (quote) {
            errors.push(`unterminated attribute quote in tag starting at index ${String(i)}`)
            i = len
            continue
        }
        if (j >= len) {
            errors.push(`unclosed tag starting at index ${String(i)}`)
            i = len
            continue
        }

        const tagContent = code.slice(i + 1, j)
        i = j + 1

        if (tagContent.startsWith('!') || tagContent.startsWith('?')) {
            continue
        }

        const isClosing = tagContent.startsWith('/')
        const isSelfClosing = tagContent.endsWith('/')
        const nameMatch = /^\/?\s*([a-zA-Z][a-zA-Z0-9-]*)/.exec(tagContent)
        const name = nameMatch?.[1]?.toLowerCase()

        if (!name) {
            errors.push(`malformed tag: <${tagContent}>`)
            continue
        }

        if (isClosing) {
            const top = stack[stack.length - 1]
            if (top === undefined) {
                errors.push(`closing tag </${name}> has no matching opening tag`)
            } else if (top !== name) {
                errors.push(`closing tag </${name}> does not match open tag <${top}>`)
            } else {
                stack.pop()
            }
            continue
        }

        if (VOID_ELEMENTS.has(name) || isSelfClosing) {
            continue
        }

        stack.push(name)
    }

    for (const unclosed of stack) {
        errors.push(`unclosed tag <${unclosed}>`)
    }

    if (errors.length > 0) {
        throw new HtmlValidationError(errors)
    }
}
