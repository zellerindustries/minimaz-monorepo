import { ValidationError } from './errors.js'

const voidElements = new Set([
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

// Contents are text, not markup: a `<` inside them never starts a tag.
const rawTextElements = new Set(['script', 'style', 'textarea', 'title'])

const blockStarts = [
    'address',
    'article',
    'aside',
    'blockquote',
    'details',
    'div',
    'dl',
    'fieldset',
    'figcaption',
    'figure',
    'footer',
    'form',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'header',
    'hgroup',
    'hr',
    'main',
    'menu',
    'nav',
    'ol',
    'p',
    'pre',
    'section',
    'table',
    'ul',
    'li',
    'dt',
    'dd',
    'tr',
    'td',
    'th',
    'thead',
    'tbody',
    'tfoot',
]

const tableSections = ['thead', 'tbody', 'tfoot']

// Elements whose end tag HTML5 lets authors omit, mapped to the start tags that
// implicitly close them when they are the innermost open element.
const implicitlyClosedBy = new Map<string, Set<string>>([
    ['li', new Set(['li'])],
    ['dt', new Set(['dt', 'dd'])],
    ['dd', new Set(['dt', 'dd'])],
    ['p', new Set(blockStarts)],
    ['option', new Set(['option', 'optgroup'])],
    ['optgroup', new Set(['optgroup'])],
    ['rb', new Set(['rb', 'rt', 'rp'])],
    ['rt', new Set(['rb', 'rt', 'rp'])],
    ['rp', new Set(['rb', 'rt', 'rp'])],
    ['caption', new Set(['colgroup', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th'])],
    ['colgroup', new Set(['thead', 'tbody', 'tfoot', 'tr', 'td', 'th'])],
    ['thead', new Set(['tbody', 'tfoot'])],
    ['tbody', new Set(['tbody', 'tfoot'])],
    ['tfoot', new Set(['tbody'])],
    ['tr', new Set(['tr', ...tableSections])],
    ['td', new Set(['td', 'th', 'tr', ...tableSections])],
    ['th', new Set(['td', 'th', 'tr', ...tableSections])],
])

const optionalEndTags = new Set(implicitlyClosedBy.keys())

/**
 * Pops every innermost open element whose optional end tag the start tag
 * `name` implicitly closes.
 *
 * @param {string[]} stack - Open-element stack, mutated in place
 * @param {string} name - Lowercased name of the start tag being opened
 */
function closeImplicitly(stack: string[], name: string): void {
    for (;;) {
        const top = stack[stack.length - 1]
        if (top === undefined || implicitlyClosedBy.get(top)?.has(name) !== true) {
            return
        }
        stack.pop()
    }
}

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
 * HTML5 optional end tags (`li`, `p`, `td`, `tr`, `dt`, `dd`, `option`, ...) are
 * closed implicitly by the start/end tags that HTML5 says close them. A
 * mismatched closing tag is reported once; if it matches an outer open tag,
 * the tags in between are dropped so no follow-up errors cascade.
 * Also flags an unterminated quoted attribute and a `<` with no matching
 * `>`. The contents of `script`, `style`, `textarea` and `title` are treated
 * as text, so a `<` inside them is never read as a tag.
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
            if (quote !== null) {
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

        if (quote !== null) {
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

        if (name === undefined) {
            errors.push(`malformed tag: <${tagContent}>`)
            continue
        }

        if (isClosing) {
            const top = stack[stack.length - 1]
            if (top === undefined) {
                errors.push(`closing tag </${name}> has no matching opening tag`)
                continue
            }
            const index = stack.lastIndexOf(name)
            if (index === -1) {
                // Stray closing tag: report once and leave the stack alone.
                errors.push(`closing tag </${name}> does not match open tag <${top}>`)
                continue
            }
            // Everything above the match is implicitly closed; only a tag that
            // may not omit its end tag is worth reporting, and only once.
            const blocker = stack.slice(index + 1).findLast((open) => !optionalEndTags.has(open))
            if (blocker !== undefined) {
                errors.push(`closing tag </${name}> does not match open tag <${blocker}>`)
            }
            stack.length = index
            continue
        }

        closeImplicitly(stack, name)

        if (voidElements.has(name) || isSelfClosing) {
            continue
        }

        if (rawTextElements.has(name)) {
            const closePattern = new RegExp(`</${name}[\\t\\n\\f\\r />]`, 'gi')
            closePattern.lastIndex = i
            const closeMatch = closePattern.exec(code)
            if (closeMatch === null) {
                errors.push(`unclosed tag <${name}>`)
                i = len
                continue
            }
            i = closeMatch.index
        }

        stack.push(name)
    }

    for (const unclosed of stack) {
        if (!optionalEndTags.has(unclosed)) {
            errors.push(`unclosed tag <${unclosed}>`)
        }
    }

    if (errors.length > 0) {
        throw new HtmlValidationError(errors)
    }
}
