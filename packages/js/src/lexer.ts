/** Thrown for any syntax error; `offset` is the source position the error points at. */
export class ParseError extends Error {
    readonly offset: number

    /**
     * @param message - What went wrong.
     * @param offset - Source offset the error points at.
     */
    constructor(message: string, offset: number) {
        super(message)
        this.name = 'ParseError'
        this.offset = offset
    }
}

export type TokenType =
    'name' | 'private' | 'punct' | 'num' | 'bigint' | 'string' | 'regex' | 'template' | 'eof'

/**
 * One token. `value` is the identifier/punctuator text, the cooked string, the regex pattern or the
 * raw template chunk. `num`/`big` hold numeric values, `flags` regex flags, `cooked`/`tail`
 * template data. A template token spans from the opening backtick (or the `}` of a continuation) to
 * the closing backtick or the `${` that ends the chunk.
 */
export interface LexToken {
    type: TokenType
    value: string
    start: number
    end: number
    nlBefore: boolean
    escaped: boolean
    num: number
    big: bigint
    flags: string
    cooked: string | null
    tail: boolean
}

const punct4 = new Set(['>>>='])
const punct3 = new Set(['...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??='])
const punct2 = new Set([
    '=>',
    '==',
    '!=',
    '<=',
    '>=',
    '&&',
    '||',
    '??',
    '?.',
    '++',
    '--',
    '+=',
    '-=',
    '*=',
    '/=',
    '%=',
    '&=',
    '|=',
    '^=',
    '<<',
    '>>',
    '**',
])
const punct1 = new Set('{}()[];,<>+-*/%&|^!~?:=.'.split(''))

const idStartRe = /^[$_\p{ID_Start}]$/u
const idPartRe = /^(?:[$\p{ID_Continue}]|‌|‍)$/u
const spaceRe = /^\p{Zs}$/u
const validFlags = new Set('dgimsuvy'.split(''))

function isIdStart(cp: number): boolean {
    if (cp < 128) {
        return (cp >= 97 && cp <= 122) || (cp >= 65 && cp <= 90) || cp === 36 || cp === 95
    }
    return idStartRe.test(String.fromCodePoint(cp))
}

function isIdPart(cp: number): boolean {
    if (cp < 128) {
        return isIdStart(cp) || (cp >= 48 && cp <= 57)
    }
    return idPartRe.test(String.fromCodePoint(cp))
}

function isDecimalDigit(ch: string): boolean {
    return ch >= '0' && ch <= '9' && ch.length === 1
}

function digitValue(ch: string): number {
    const c = ch.charCodeAt(0)
    if (ch.length !== 1) {
        return 99
    }
    if (c >= 48 && c <= 57) {
        return c - 48
    }
    if (c >= 97 && c <= 102) {
        return c - 87
    }
    if (c >= 65 && c <= 70) {
        return c - 55
    }
    return 99
}

function isLineTerminator(c: number): boolean {
    return c === 10 || c === 13 || c === 0x2028 || c === 0x2029
}

/**
 * On-demand JavaScript lexer. It never guesses whether `/` starts a regex: the parser passes
 * `regexAllowed` to {@link Lexer.next}, or re-reads a `/` token with {@link Lexer.rescanRegex} when
 * it finds itself in operand position. Template continuations (after the `}` closing a `${`) are
 * likewise requested by the parser through {@link Lexer.readTemplateContinuation}.
 */
export class Lexer {
    /**
     * Current read position; always the end of the last token returned unless the parser resets it.
     */
    pos = 0
    private readonly code: string
    private readonly htmlComments: boolean
    /** Where the first token may start (after a `#!` line): `-->` there opens a comment too. */
    private readonly inputStart: number

    /**
     * @param code - Source text.
     * @param htmlComments - Whether `<!--` and a `-->` that starts a line open single-line
     *   comments, as in scripts (Annex B); in modules they are operators.
     */
    constructor(code: string, htmlComments = false) {
        this.code = code
        this.htmlComments = htmlComments
        if (code.startsWith('#!')) {
            while (this.pos < code.length && !isLineTerminator(code.charCodeAt(this.pos))) {
                this.pos++
            }
        }
        this.inputStart = this.pos
    }

    /**
     * Reads the next token.
     * @param regexAllowed - Whether a `/` here starts a regular expression literal rather than
     * dividing.
     * @returns The token (type `eof` at the end of input).
     */
    next(regexAllowed: boolean): LexToken {
        const nl = this.skipSpace()
        const start = this.pos
        if (start >= this.code.length) {
            return this.make('eof', '', start, this.pos, nl)
        }
        const ch = this.code.charAt(start)
        const cp = this.code.codePointAt(start) ?? 0
        if (isIdStart(cp) || ch === '\\') {
            const word = this.readWord()
            return this.make('name', word.text, start, this.pos, nl, { escaped: word.escaped })
        }
        if (isDecimalDigit(ch) || (ch === '.' && isDecimalDigit(this.code.charAt(start + 1)))) {
            return this.readNumber(nl)
        }
        if (ch === '"' || ch === "'") {
            return this.readString(ch, nl)
        }
        if (ch === '`') {
            return this.readTemplateChunk(start, nl)
        }
        if (ch === '#') {
            this.pos++
            const nameCp = this.code.codePointAt(this.pos) ?? 0
            if (!isIdStart(nameCp) && nameCp !== 92) {
                throw new ParseError('invalid private name', start)
            }
            const word = this.readWord()
            return this.make('private', word.text, start, this.pos, nl)
        }
        if (ch === '/' && regexAllowed) {
            return this.readRegex(nl)
        }
        return this.readPunct(nl)
    }

    /**
     * Reads the next token without consuming it.
     * @param regexAllowed - See {@link Lexer.next}.
     * @returns The token that `next` would return.
     */
    peek(regexAllowed: boolean): LexToken {
        const saved = this.pos
        try {
            return this.next(regexAllowed)
        } finally {
            this.pos = saved
        }
    }

    /**
     * Re-reads a `/` or `/=` punctuator token as a regular expression literal.
     * @param token - The `/` or `/=` token to re-read.
     * @returns The regex token, keeping the original `nlBefore`.
     */
    rescanRegex(token: LexToken): LexToken {
        this.pos = token.start
        return this.readRegex(token.nlBefore)
    }

    /**
     * Reads a template chunk that continues after a `${ ... }` substitution.
     * @param from - Offset of the `}` that closed the substitution.
     * @returns The template token covering `}` through the next `${` or closing backtick.
     */
    readTemplateContinuation(from: number): LexToken {
        return this.readTemplateChunk(from, false)
    }

    private make(
        type: LexToken['type'],
        value: string,
        start: number,
        end: number,
        nlBefore: boolean,
        extra: Partial<LexToken> = {},
    ): LexToken {
        return {
            type,
            value,
            start,
            end,
            nlBefore,
            escaped: false,
            num: 0,
            big: 0n,
            flags: '',
            cooked: null,
            tail: false,
            ...extra,
        }
    }

    private skipSpace(): boolean {
        const code = this.code
        let nl = false
        // Only whitespace and comments have been skipped since the start of the input.
        const atInputStart = this.pos === this.inputStart
        for (;;) {
            const c = code.charCodeAt(this.pos)
            if (c === 32 || c === 9 || c === 11 || c === 12 || c === 0xa0 || c === 0xfeff) {
                this.pos++
            } else if (isLineTerminator(c)) {
                nl = true
                this.pos++
            } else if (
                this.htmlComments &&
                (code.startsWith('<!--', this.pos) ||
                    ((nl || atInputStart) && code.startsWith('-->', this.pos)))
            ) {
                while (this.pos < code.length && !isLineTerminator(code.charCodeAt(this.pos))) {
                    this.pos++
                }
            } else if (c === 47) {
                const n = code.charCodeAt(this.pos + 1)
                if (n === 47) {
                    this.pos += 2
                    while (this.pos < code.length && !isLineTerminator(code.charCodeAt(this.pos))) {
                        this.pos++
                    }
                } else if (n === 42) {
                    const close = code.indexOf('*/', this.pos + 2)
                    if (close === -1) {
                        throw new ParseError('unterminated comment', this.pos)
                    }
                    for (let i = this.pos + 2; i < close; i++) {
                        if (isLineTerminator(code.charCodeAt(i))) {
                            nl = true
                            break
                        }
                    }
                    this.pos = close + 2
                } else {
                    return nl
                }
            } else if (c > 127 && spaceRe.test(String.fromCharCode(c))) {
                this.pos++
            } else {
                return nl
            }
        }
    }

    private readWord(): { text: string; escaped: boolean } {
        let text = ''
        let escaped = false
        let first = true
        for (;;) {
            const cp = this.code.codePointAt(this.pos)
            if (cp === undefined) {
                break
            }
            if (cp === 92) {
                const at = this.pos
                if (this.code.charCodeAt(this.pos + 1) !== 117) {
                    throw new ParseError('invalid escape in identifier', at)
                }
                this.pos += 2
                const value = this.readCodePointEscape()
                if (value < 0 || !(first ? isIdStart(value) : isIdPart(value))) {
                    throw new ParseError('invalid escape in identifier', at)
                }
                text += String.fromCodePoint(value)
                escaped = true
            } else if (first ? isIdStart(cp) : isIdPart(cp)) {
                text += String.fromCodePoint(cp)
                this.pos += cp > 0xffff ? 2 : 1
            } else {
                break
            }
            first = false
        }
        return { text, escaped }
    }

    /**
     * Reads the part of a `\u` escape after the `u`; returns -1 (after consuming what it saw) if
     * invalid.
     */
    private readCodePointEscape(): number {
        if (this.code.charAt(this.pos) === '{') {
            this.pos++
            let value = 0
            let digits = 0
            for (;;) {
                const d = digitValue(this.code.charAt(this.pos))
                if (d >= 16) {
                    break
                }
                value = value * 16 + d
                digits++
                this.pos++
                if (value > 0x10ffff) {
                    return -1
                }
            }
            if (digits === 0 || this.code.charAt(this.pos) !== '}') {
                return -1
            }
            this.pos++
            return value
        }
        let value = 0
        for (let i = 0; i < 4; i++) {
            const d = digitValue(this.code.charAt(this.pos))
            if (d >= 16) {
                return -1
            }
            value = value * 16 + d
            this.pos++
        }
        return value
    }

    private readDigitSeq(radix: number): string {
        let out = ''
        let last = ''
        for (;;) {
            const ch = this.code.charAt(this.pos)
            if (ch === '_') {
                if (out === '' || last === '_') {
                    throw new ParseError('invalid numeric separator', this.pos)
                }
            } else if (digitValue(ch) >= radix) {
                break
            } else {
                out += ch
            }
            last = ch
            this.pos++
        }
        if (last === '_') {
            throw new ParseError('invalid numeric separator', this.pos - 1)
        }
        return out
    }

    private readNumber(nl: boolean): LexToken {
        const start = this.pos
        const code = this.code
        const c0 = code.charAt(start)
        const c1 = code.charAt(start + 1).toLowerCase()
        let result: LexToken
        const radix = c1 === 'x' ? 16 : c1 === 'o' ? 8 : c1 === 'b' ? 2 : 0
        if (c0 === '0' && radix !== 0) {
            this.pos += 2
            const digits = this.readDigitSeq(radix)
            if (digits === '') {
                throw new ParseError('expected digits after numeric prefix', this.pos)
            }
            const prefix = code.slice(start, start + 2)
            if (code.charAt(this.pos) === 'n') {
                this.pos++
                result = this.make('bigint', code.slice(start, this.pos), start, this.pos, nl, {
                    big: BigInt(prefix + digits),
                })
            } else {
                result = this.make('num', code.slice(start, this.pos), start, this.pos, nl, {
                    num: Number(prefix + digits),
                })
            }
        } else if (c0 === '0' && c1 === '_') {
            throw new ParseError('numeric separator not allowed after a leading 0', start + 1)
        } else if (c0 === '0' && isDecimalDigit(c1)) {
            let end = start + 1
            while (isDecimalDigit(code.charAt(end))) {
                end++
            }
            const digits = code.slice(start, end)
            this.pos = end
            if (/^[0-7]+$/.test(digits)) {
                result = this.make('num', digits, start, end, nl, { num: parseInt(digits, 8) })
            } else {
                const decimal = this.readDecimalTail(digits)
                result = this.make('num', code.slice(start, this.pos), start, this.pos, nl, {
                    num: Number(decimal.text),
                })
            }
        } else {
            const intDigits = this.readDigitSeq(10)
            const decimal = this.readDecimalTail(intDigits)
            if (decimal.isInt && code.charAt(this.pos) === 'n') {
                this.pos++
                result = this.make('bigint', code.slice(start, this.pos), start, this.pos, nl, {
                    big: BigInt(intDigits),
                })
            } else {
                result = this.make('num', code.slice(start, this.pos), start, this.pos, nl, {
                    num: Number(decimal.text),
                })
            }
        }
        const after = this.code.codePointAt(this.pos)
        if (after !== undefined && (isIdStart(after) || (after >= 48 && after <= 57))) {
            throw new ParseError('identifier directly after number', this.pos)
        }
        return result
    }

    /**
     * Reads `.frac` and `e+exp` after the integer digits; returns the numeric text and whether it
     * is integral.
     */
    private readDecimalTail(intDigits: string): { text: string; isInt: boolean } {
        let text = intDigits
        let isInt = true
        if (this.code.charAt(this.pos) === '.') {
            this.pos++
            isInt = false
            text += `.${this.readDigitSeq(10)}`
        }
        const e = this.code.charAt(this.pos)
        if (e === 'e' || e === 'E') {
            const at = this.pos
            this.pos++
            let sign = ''
            const s = this.code.charAt(this.pos)
            if (s === '+' || s === '-') {
                sign = s
                this.pos++
            }
            const digits = this.readDigitSeq(10)
            if (digits === '') {
                throw new ParseError('invalid exponent', at)
            }
            isInt = false
            text += `e${sign}${digits}`
        }
        return { text, isInt }
    }

    private readString(quote: string, nl: boolean): LexToken {
        const code = this.code
        const start = this.pos
        this.pos++
        let out = ''
        let chunk = this.pos
        for (;;) {
            if (this.pos >= code.length) {
                throw new ParseError('unterminated string', start)
            }
            const ch = code.charAt(this.pos)
            if (ch === quote) {
                out += code.slice(chunk, this.pos)
                this.pos++
                break
            }
            if (ch === '\\') {
                out += code.slice(chunk, this.pos)
                this.pos++
                out += this.readEscape(false) ?? ''
                chunk = this.pos
            } else if (ch === '\n' || ch === '\r') {
                throw new ParseError('unterminated string', start)
            } else {
                this.pos++
            }
        }
        return this.make('string', out, start, this.pos, nl)
    }

    /**
     * Reads an escape sequence (position just after the backslash).
     * In a template an invalid escape yields `null` (cooked value undefined) instead of throwing.
     */
    private readEscape(template: boolean): string | null {
        const code = this.code
        const at = this.pos - 1
        const c = code.charAt(this.pos)
        this.pos++
        switch (c) {
            case 'n':
                return '\n'
            case 't':
                return '\t'
            case 'r':
                return '\r'
            case 'b':
                return '\b'
            case 'f':
                return '\f'
            case 'v':
                return '\v'
            case '\r':
                if (code.charAt(this.pos) === '\n') {
                    this.pos++
                }
                return ''
            case '\n':
            case ' ':
            case ' ':
                return ''
            case 'x': {
                const h1 = digitValue(code.charAt(this.pos))
                const h2 = digitValue(code.charAt(this.pos + 1))
                if (h1 >= 16 || h2 >= 16) {
                    return this.invalidEscape(template, at)
                }
                this.pos += 2
                return String.fromCharCode(h1 * 16 + h2)
            }
            case 'u': {
                const value = this.readCodePointEscape()
                return value < 0 ? this.invalidEscape(template, at) : String.fromCodePoint(value)
            }
            case '0':
            case '1':
            case '2':
            case '3':
            case '4':
            case '5':
            case '6':
            case '7': {
                if (c === '0' && !isDecimalDigit(code.charAt(this.pos))) {
                    return '\0'
                }
                if (template) {
                    return null
                }
                let value = Number(c)
                const max = c <= '3' ? 2 : 1
                for (let i = 0; i < max; i++) {
                    const d = code.charAt(this.pos)
                    if (d < '0' || d > '7' || d.length !== 1) {
                        break
                    }
                    value = value * 8 + Number(d)
                    this.pos++
                }
                return String.fromCharCode(value)
            }
            case '8':
            case '9':
                return template ? null : c
            default:
                return c
        }
    }

    private invalidEscape(template: boolean, at: number): null {
        if (template) {
            return null
        }
        throw new ParseError('invalid escape sequence', at)
    }

    private readTemplateChunk(start: number, nl: boolean): LexToken {
        const code = this.code
        this.pos = start + 1
        const rawStart = this.pos
        let cooked: string | null = ''
        let raw: string
        let tail: boolean
        for (;;) {
            if (this.pos >= code.length) {
                throw new ParseError('unterminated template', start)
            }
            const ch = code.charAt(this.pos)
            if (ch === '`') {
                raw = code.slice(rawStart, this.pos)
                this.pos++
                tail = true
                break
            }
            if (ch === '$' && code.charAt(this.pos + 1) === '{') {
                raw = code.slice(rawStart, this.pos)
                this.pos += 2
                tail = false
                break
            }
            if (ch === '\\') {
                this.pos++
                const escape = this.readEscape(true)
                cooked = escape === null || cooked === null ? null : cooked + escape
            } else if (ch === '\r') {
                this.pos++
                if (code.charAt(this.pos) === '\n') {
                    this.pos++
                }
                cooked = cooked === null ? null : `${cooked}\n`
            } else {
                this.pos++
                cooked = cooked === null ? null : cooked + ch
            }
        }
        return this.make('template', raw.replace(/\r\n?/g, '\n'), start, this.pos, nl, {
            cooked,
            tail,
        })
    }

    private readRegex(nl: boolean): LexToken {
        const code = this.code
        const start = this.pos
        this.pos++
        let inClass = false
        for (;;) {
            if (this.pos >= code.length || isLineTerminator(code.charCodeAt(this.pos))) {
                throw new ParseError('unterminated regular expression', start)
            }
            const ch = code.charAt(this.pos)
            if (ch === '\\') {
                this.pos++
                if (this.pos >= code.length || isLineTerminator(code.charCodeAt(this.pos))) {
                    throw new ParseError('unterminated regular expression', start)
                }
            } else if (ch === '[') {
                inClass = true
            } else if (ch === ']') {
                inClass = false
            } else if (ch === '/' && !inClass) {
                break
            }
            this.pos++
        }
        const pattern = code.slice(start + 1, this.pos)
        this.pos++
        const flagsStart = this.pos
        for (;;) {
            const cp = code.codePointAt(this.pos)
            if (cp === undefined || !isIdPart(cp)) {
                break
            }
            this.pos += cp > 0xffff ? 2 : 1
        }
        const flags = code.slice(flagsStart, this.pos)
        const seen = new Set<string>()
        for (const flag of flags) {
            if (!validFlags.has(flag) || seen.has(flag)) {
                throw new ParseError('invalid regular expression flags', flagsStart)
            }
            seen.add(flag)
        }
        if (seen.has('u') && seen.has('v')) {
            throw new ParseError('invalid regular expression flags', flagsStart)
        }
        if (code.charAt(this.pos) === '\\') {
            throw new ParseError('invalid regular expression flags', this.pos)
        }
        return this.make('regex', pattern, start, this.pos, nl, { flags })
    }

    private readPunct(nl: boolean): LexToken {
        const start = this.pos
        const code = this.code
        for (const [len, set] of [
            [4, punct4],
            [3, punct3],
            [2, punct2],
            [1, punct1],
        ] as const) {
            const text = code.slice(start, start + len)
            if (text.length === len && set.has(text)) {
                if (text === '?.' && isDecimalDigit(code.charAt(start + 2))) {
                    continue
                }
                this.pos = start + len
                return this.make('punct', text, start, this.pos, nl)
            }
        }
        throw new ParseError(`unexpected character ${JSON.stringify(code.charAt(start))}`, start)
    }
}
