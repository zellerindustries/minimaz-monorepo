import { isIdentifierChar, isMemberName, tokenize } from './tokenize.js'
import type { Token } from './tokenize.js'

/** After these, a line break is never removed: ASI would (or might) act on it. */
const neverJoinAfterWords = new Set(['return', 'break', 'continue', 'throw', 'yield', 'async'])

/** After these keywords the next token always continues the statement. */
const joinAfterWords = new Set([
    'else',
    'do',
    'try',
    'finally',
    'typeof',
    'new',
    'delete',
    'void',
    'in',
    'instanceof',
    'case',
    'var',
    'const',
    'function',
    'class',
    'extends',
])

/** Punctuators that end an expression, so a line break after them can matter. */
const endsExpression = new Set([')', ']', '}', '++', '--'])

/** Tokens that can never begin a new statement, so a line break before them is not an ASI point. */
const joinBeforePunct = new Set(['(', '[', '.', '?.', ')', ']', ',', ';', ':', '}'])

const binaryOperators = new Set([
    '+',
    '-',
    '*',
    '/',
    '%',
    '**',
    '=',
    '+=',
    '-=',
    '*=',
    '/=',
    '%=',
    '**=',
    '<<=',
    '>>=',
    '>>>=',
    '&=',
    '|=',
    '^=',
    '&&=',
    '||=',
    '??=',
    '==',
    '!=',
    '===',
    '!==',
    '<',
    '>',
    '<=',
    '>=',
    '&&',
    '||',
    '??',
    '&',
    '|',
    '^',
    '<<',
    '>>',
    '>>>',
    '?',
    '=>',
])

/** Whether the line break between `tokens[index - 1]` and `tokens[index]` can be dropped without changing meaning. */
function canJoin(tokens: readonly Token[], index: number): boolean {
    const prev = tokens[index - 1]
    const token = tokens[index]
    if (prev === undefined || token === undefined) {
        return false
    }
    if (token.type === 'punct' && (token.value === '++' || token.value === '--')) {
        return false
    }
    // `i++` cannot be called, indexed or tagged, so ASI ends the statement before `(`, `[` or a
    // template on the next line; joined, `i++(…)` would be a syntax error. After a prefix
    // `++`/`--` the kept line break is harmless.
    if (
        prev.type === 'punct' &&
        (prev.value === '++' || prev.value === '--') &&
        (token.type === 'template' ||
            (token.type === 'punct' && (token.value === '(' || token.value === '[')))
    ) {
        return false
    }
    const prevIsKeyword = prev.type === 'word' && !isMemberName(tokens, index - 1)
    if (prevIsKeyword && neverJoinAfterWords.has(prev.value)) {
        return false
    }
    if (prev.type === 'punct' && !endsExpression.has(prev.value)) {
        return true
    }
    if (prevIsKeyword && joinAfterWords.has(prev.value)) {
        return true
    }
    if (token.type === 'template') {
        return true
    }
    return (
        token.type === 'punct' &&
        (joinBeforePunct.has(token.value) || binaryOperators.has(token.value))
    )
}

/** Whether `prev` and `token` would lex differently (or as one token) if written without a space. */
function needsSpace(prev: Token, token: Token): boolean {
    const last = prev.value.charAt(prev.value.length - 1)
    const first = token.value.charAt(0)
    if (isIdentifierChar(last) && isIdentifierChar(first)) {
        return true
    }
    if (prev.type === 'regex' && (token.type === 'word' || token.type === 'number')) {
        return true
    }
    if (prev.type === 'punct' && token.type === 'punct') {
        if ((last === '+' || last === '-') && first === last) {
            return true
        }
        if (prev.value === '<' && token.value === '!') {
            return true
        }
    }
    if (prev.type === 'punct' && prev.value === '/' && token.type === 'regex') {
        return true
    }
    if (prev.type === 'number' && !/[.exn]/i.test(prev.value) && first === '.') {
        return true
    }
    return prev.type === 'punct' && prev.value === '?' && first === '.'
}

/**
 * Minifies JavaScript by tokenizing it: comments are dropped and whitespace is
 * reduced to the minimum that keeps the token stream identical. A line break
 * is only removed where automatic semicolon insertion provably cannot apply
 * (after an operator or `,`/`;`/`(`/`[`/`{`, before `.`/`(`/`[`/`)` and so on);
 * everywhere else, including after `return`/`break`/`continue`/`throw` and
 * before `++`/`--`, it is kept. Strings, templates and regexes are copied
 * verbatim. Nothing is renamed, reordered or removed besides whitespace and
 * comments; a leading `#!` line is preserved. Source with an HTML-like comment
 * (`<!--`, or `-->` starting a line) is returned unchanged: it is a comment in a
 * script but operators in a module, and tokens alone cannot tell which.
 *
 * Regex-vs-division is decided from the preceding token (a heuristic, not a
 * parser), which is right for all ordinary code.
 *
 * @param {string} code - JavaScript source to minify
 * @returns {string} Minified JavaScript
 * @throws {Error} `minifyJs: …` if `code` is not a string or has an unterminated
 *   string, template literal, regex or block comment
 */
export function minifyTokens(code: string): string {
    if (typeof code !== 'string') {
        throw new Error('minifyJs: code must be a string')
    }

    const { hashbang, tokens, htmlLikeComment } = tokenize(code)
    if (htmlLikeComment === true) {
        return code
    }
    let body = ''
    for (const [index, token] of tokens.entries()) {
        const prev = tokens[index - 1]
        if (prev !== undefined) {
            if (token.newlineBefore && !canJoin(tokens, index)) {
                body += '\n'
            } else if (needsSpace(prev, token)) {
                body += ' '
            }
        }
        body += token.value
    }

    if (hashbang === '') {
        return body
    }
    return body === '' ? hashbang : `${hashbang}\n${body}`
}
