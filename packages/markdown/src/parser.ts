import type { ListMarkerInfo, Block, Document, Inline, ListItem } from './types.js'

/*
A hand-rolled Markdown parser — intentionally dependency-free.

Known, deliberate deviations from CommonMark (documented rather than fixed,
to keep this implementation's scope bounded):
  - No setext headings ("Title\n===="); a line of "===" or "---" after a
    paragraph is parsed as a thematic break, not a heading underline.
  - No lazy continuation lines in blockquotes: every line of a blockquote
    must start with "> ".
  - Emphasis/strong delimiter matching is a simplified approximation of
    CommonMark's flanking-delimiter algorithm, not the full run algorithm.
  - Link/image destinations may not contain unescaped, unbalanced
    parentheses unless wrapped in "<...>".
  - No tables, footnotes, raw HTML blocks, or link reference definitions.
*/

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*(\S+)?[ \t]*$/
const HR_RE = /^ {0,3}([-*_])( *\1){2,} *$/
const HEADING_RE = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*#*[ \t]*$/
const BLOCKQUOTE_RE = /^ {0,3}>/
const ESCAPABLE = new Set('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'.split(''))

// Matches a single list-item marker line ("- foo", "12. foo", or a bare
// "-"/"12." with no text yet). `contentColumn` tells the list-parsing loop
// in parseBlocks how far to dedent each of the item's continuation lines —
// a line only continues the item if it's indented at least that far.
function matchListMarker(line: string): ListMarkerInfo | null {
    const unordered = /^( {0,3})([-*+])(?:( )(.*))?$/.exec(line)
    if (unordered !== null) {
        const indent = unordered[1]?.length ?? 0
        const hasSpace = unordered[3] !== undefined
        return {
            ordered: false,
            start: undefined,
            contentColumn: indent + 1 + (hasSpace ? 1 : 0),
            rest: hasSpace ? (unordered[4] ?? '') : '',
        }
    }
    const ordered = /^( {0,3})(\d{1,9})([.)])(?:( )(.*))?$/.exec(line)
    if (ordered !== null) {
        const indent = ordered[1]?.length ?? 0
        const num = ordered[2] ?? '0'
        const hasSpace = ordered[4] !== undefined
        return {
            ordered: true,
            start: Number(num),
            contentColumn: indent + num.length + 1 + (hasSpace ? 1 : 0),
            rest: hasSpace ? (ordered[5] ?? '') : '',
        }
    }
    return null
}

function isBlockStart(line: string): boolean {
    return (
        FENCE_RE.test(line) ||
        HR_RE.test(line) ||
        HEADING_RE.test(line) ||
        BLOCKQUOTE_RE.test(line) ||
        matchListMarker(line) !== null
    )
}

// Joins a paragraph's source lines into one string for parseInline. Soft
// breaks (an ordinary line wrap) become a plain space; hard breaks (a
// trailing "  " or "\") become a U+0000 sentinel, which can't otherwise
// appear in Markdown source — parseInline looks for that exact character
// to emit a `break` node, then discards it.
function joinParagraphLines(lines: string[]): string {
    const parts: string[] = []
    for (let idx = 0; idx < lines.length; idx++) {
        const raw = lines[idx] ?? ''
        const isLast = idx === lines.length - 1
        let line = raw
        let hardBreak = false
        if (!isLast) {
            if (/ {2,}$/.test(line)) {
                hardBreak = true
                line = line.replace(/ +$/, '')
            } else if (line.endsWith('\\')) {
                hardBreak = true
                line = line.replace(/\\$/, '')
            }
        }
        parts.push(line)
        if (!isLast) parts.push(hardBreak ? '\u0000' : ' ')
    }
    return parts.join('')
}

function parseBlocks(lines: string[], startLine: number, errors: string[]): Block[] {
    const blocks: Block[] = []
    let i = 0

    while (i < lines.length) {
        const line = lines[i] ?? ''

        if (line.trim() === '') {
            i++
            continue
        }

        const fenceMatch = FENCE_RE.exec(line)
        if (fenceMatch !== null) {
            const marker = fenceMatch[1] ?? ''
            const fenceChar = marker[0] ?? '`'
            const fenceLen = marker.length
            const lang = fenceMatch[2]
            const openLine = startLine + i
            const content: string[] = []
            i++
            let closed = false
            while (i < lines.length) {
                const candidate = lines[i] ?? ''
                const closeMatch = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(candidate)
                const closeMarker = closeMatch?.[1] ?? ''
                if (
                    closeMatch !== null &&
                    closeMarker.startsWith(fenceChar) &&
                    closeMarker.length >= fenceLen
                ) {
                    closed = true
                    i++
                    break
                }
                content.push(candidate)
                i++
            }
            if (!closed) {
                errors.push(`Unterminated code fence opened at line ${String(openLine)}`)
            }
            blocks.push({ type: 'code', lang, content: content.join('\n') })
            continue
        }

        if (HR_RE.test(line)) {
            blocks.push({ type: 'thematicBreak' })
            i++
            continue
        }

        const headingMatch = HEADING_RE.exec(line)
        if (headingMatch !== null) {
            const level = (headingMatch[1] ?? '#').length
            const text = (headingMatch[2] ?? '').trim()
            blocks.push({
                type: 'heading',
                level: level as 1 | 2 | 3 | 4 | 5 | 6,
                children: parseInline(text),
            })
            i++
            continue
        }

        if (BLOCKQUOTE_RE.test(line)) {
            const bqLines: string[] = []
            const bqStart = startLine + i
            while (i < lines.length && BLOCKQUOTE_RE.test(lines[i] ?? '')) {
                bqLines.push((lines[i] ?? '').replace(/^ {0,3}> ?/, ''))
                i++
            }
            blocks.push({
                type: 'blockquote',
                children: parseBlocks(bqLines, bqStart, errors),
            })
            continue
        }

        const marker = matchListMarker(line)
        if (marker !== null) {
            const ordered = marker.ordered
            const items: ListItem[] = []
            while (i < lines.length) {
                const itemMarker = matchListMarker(lines[i] ?? '')
                if (itemMarker?.ordered !== ordered) break
                const itemStart = startLine + i
                const contentColumn = itemMarker.contentColumn
                const itemLines: string[] = [itemMarker.rest]
                i++
                while (i < lines.length) {
                    const candidate = lines[i] ?? ''
                    if (candidate.trim() === '') {
                        itemLines.push('')
                        i++
                        continue
                    }
                    const indentLen = /^ */.exec(candidate)?.[0].length ?? 0
                    if (indentLen >= contentColumn) {
                        itemLines.push(candidate.slice(contentColumn))
                        i++
                    } else {
                        break
                    }
                }
                while (
                    itemLines.length > 0 &&
                    (itemLines[itemLines.length - 1] ?? '').trim() === ''
                ) {
                    itemLines.pop()
                }
                items.push({
                    children: parseBlocks(itemLines, itemStart, errors),
                })
            }
            blocks.push({ type: 'list', ordered, start: marker.start, items })
            continue
        }

        const paraLines: string[] = []
        while (
            i < lines.length &&
            (lines[i] ?? '').trim() !== '' &&
            !isBlockStart(lines[i] ?? '')
        ) {
            paraLines.push(lines[i] ?? '')
            i++
        }
        blocks.push({
            type: 'paragraph',
            children: parseInline(joinParagraphLines(paraLines)),
        })
    }

    return blocks
}

// Simplified stand-in for CommonMark's flanking-delimiter algorithm: a run
// of `*`/`_` can open emphasis if it's not followed by whitespace, and
// (for `_` only) not preceded by a word character — this is what stops
// "snake_case_var" from being read as emphasis while still allowing
// "*italic*" mid-word, matching how `*` and `_` differ in practice.
function isWordChar(ch: string | undefined): boolean {
    return ch !== undefined && /[A-Za-z0-9]/.test(ch)
}

function canOpenRun(text: string, i: number, runLen: number, allowIntraword: boolean): boolean {
    const after = text[i + runLen]
    if (after === undefined || after === ' ' || after === '\t') return false
    if (!allowIntraword && isWordChar(text[i - 1])) return false
    return true
}

function findClosingRun(
    text: string,
    from: number,
    ch: string,
    runLen: number,
    allowIntraword: boolean,
): number | null {
    let j = from
    while (j < text.length) {
        if (text[j] === ch) {
            let len = 1
            while (text[j + len] === ch) len++
            if (len >= runLen) {
                const before = text[j - 1]
                const after = text[j + len]
                const contentOk = j > from
                const closeValid = allowIntraword || !isWordChar(after)
                if (contentOk && before !== ' ' && before !== '\t' && closeValid) {
                    return j
                }
            }
            j += len
            continue
        }
        j++
    }
    return null
}

function findBacktickClose(text: string, from: number, runLen: number): number {
    let j = from
    while (j < text.length) {
        if (text[j] === '`') {
            let len = 1
            while (text[j + len] === '`') len++
            if (len === runLen) return j
            j += len
            continue
        }
        j++
    }
    return -1
}

interface LinkParseResult {
    url: string
    title: string | undefined
    label: string
    end: number
}

function tryParseLinkOrImage(text: string, i: number): LinkParseResult | null {
    if (text[i] !== '[') return null
    let depth = 1
    let j = i + 1
    while (j < text.length) {
        if (text[j] === '\\') {
            j += 2
            continue
        }
        if (text[j] === '[') {
            depth++
            j++
            continue
        }
        if (text[j] === ']') {
            depth--
            j++
            if (depth === 0) break
            continue
        }
        j++
    }
    if (depth !== 0) return null
    const closeBracket = j - 1
    const label = text.slice(i + 1, closeBracket)
    if (text[j] !== '(') return null
    const rest = text.slice(j + 1)
    // Destination is either <angle-bracketed, can contain spaces> or a bare
    // run of non-space/non-paren characters; an optional "title" or 'title'
    // follows, then the closing ")". Capture groups: 1=<...> destination,
    // 2=bare destination, 3="..." title, 4='...' title.
    const match = /^\s*(?:<([^<>\n]*)>|([^()\s]*))(?:\s+"([^"]*)"|\s+'([^']*)')?\s*\)/.exec(rest)
    if (match === null) return null
    const url = match[1] ?? match[2] ?? ''
    const title = match[3] ?? match[4]
    return { url, title, label, end: j + 1 + match[0].length }
}

function parseInline(text: string): Inline[] {
    const nodes: Inline[] = []
    let buffer = ''
    let i = 0

    const flush = (): void => {
        if (buffer !== '') {
            nodes.push({ type: 'text', value: buffer })
            buffer = ''
        }
    }

    while (i < text.length) {
        const ch = text[i] ?? ''

        if (ch === '\u0000') {
            flush()
            nodes.push({ type: 'break' })
            i++
            continue
        }

        if (ch === '\\' && ESCAPABLE.has(text[i + 1] ?? '')) {
            buffer += text[i + 1] ?? ''
            i += 2
            continue
        }

        if (ch === '`') {
            let runLen = 1
            while (text[i + runLen] === '`') runLen++
            const closePos = findBacktickClose(text, i + runLen, runLen)
            if (closePos === -1) {
                buffer += text.slice(i, i + runLen)
                i += runLen
                continue
            }
            flush()
            let code = text.slice(i + runLen, closePos)
            if (
                code.length >= 2 &&
                code.startsWith(' ') &&
                code.endsWith(' ') &&
                code.trim() !== ''
            ) {
                code = code.slice(1, -1)
            }
            nodes.push({ type: 'inlineCode', value: code })
            i = closePos + runLen
            continue
        }

        if (ch === '!' && text[i + 1] === '[') {
            const parsed = tryParseLinkOrImage(text, i + 1)
            if (parsed !== null) {
                flush()
                nodes.push({
                    type: 'image',
                    url: parsed.url,
                    alt: parsed.label,
                    title: parsed.title,
                })
                i = parsed.end
                continue
            }
        }

        if (ch === '[') {
            const parsed = tryParseLinkOrImage(text, i)
            if (parsed !== null) {
                flush()
                nodes.push({
                    type: 'link',
                    url: parsed.url,
                    title: parsed.title,
                    children: parseInline(parsed.label),
                })
                i = parsed.end
                continue
            }
        }

        if (ch === '*' || ch === '_') {
            let runLen = 1
            while (text[i + runLen] === ch) runLen++
            const allowIntraword = ch === '*'
            if (canOpenRun(text, i, runLen, allowIntraword)) {
                // Try to consume the longest possible marker first, so "***x***"
                // matches as strong+emphasis together rather than leaving a
                // dangling single "*" once the double-marker case is tried.
                const tryLens = runLen >= 3 ? [3, 2, 1] : runLen === 2 ? [2, 1] : [1]
                let matched = false
                for (const L of tryLens) {
                    const closePos = findClosingRun(text, i + runLen, ch, L, allowIntraword)
                    if (closePos !== null) {
                        const extra = runLen - L
                        if (extra > 0) buffer += ch.repeat(extra)
                        flush()
                        const inner = text.slice(i + runLen, closePos)
                        const children = parseInline(inner)
                        if (L >= 3) {
                            nodes.push({
                                type: 'strong',
                                children: [{ type: 'emphasis', children }],
                            })
                        } else if (L === 2) {
                            nodes.push({ type: 'strong', children })
                        } else {
                            nodes.push({ type: 'emphasis', children })
                        }
                        i = closePos + L
                        matched = true
                        break
                    }
                }
                if (matched) continue
            }
            buffer += ch.repeat(runLen)
            i += runLen
            continue
        }

        buffer += ch
        i++
    }

    flush()
    return nodes
}

/** Result of a parse: the parsed document, plus any structural errors found (e.g. an unterminated fence). */
export interface ParseResult {
    document: Document
    errors: string[]
}

/**
 * Parses a Markdown string into the shared AST used by `html.ts` and `pdf/render.ts`.
 * See the module-level comment above for the deliberate CommonMark deviations.
 *
 * @param {string} input - Markdown source to parse
 * @returns {ParseResult} Parsed document and any structural errors found
 */
export function parseMarkdown(input: string): ParseResult {
    const lines = input.split(/\r\n|\r|\n/)
    const errors: string[] = []
    const children = parseBlocks(lines, 1, errors)
    return { document: { type: 'document', children }, errors }
}
