import type { Block, Document, Inline } from '../types.js'
import {
    BODY_SIZE,
    CODE_SIZE,
    FONT_BASENAME,
    FONT_RESOURCE,
    HEADING_SIZES,
    PAGE_HEIGHT,
    PAGE_WIDTH,
} from './config.js'
import { LayoutEngine } from './layout.js'
import type { Op, Style, Token, Word } from './types.js'
import { escapePdfString, formatNumber, PdfWriter } from './writer.js'

/*
Renders the shared Markdown AST straight to PDF bytes, with no HTML step
and no external dependencies. Everything is drawn in Courier (a fixed-pitch
base-14 font every PDF viewer already has) so line-wrapping math is exact
without embedding font metrics. Known limitations, by design:
  - ASCII-only text; non-ASCII characters are replaced with "?" so the
    whole output stays byte-safe as a plain JS string.
  - Links/images render as inline text with the URL in parentheses —
    there are no clickable annotations or embedded images.
  - List item continuation lines are not hanging-indented under the
    marker (they wrap back to the item's left margin).
*/

function sanitizeText(text: string): string {
    let out = ''
    for (const ch of text) {
        const code = ch.codePointAt(0) ?? 0
        out += code >= 0x20 && code <= 0x7e ? ch : '?'
    }
    return out
}

function combine(base: Style, add: 'bold' | 'italic'): Style {
    if (add === 'bold') {
        return base === 'italic' || base === 'boldItalic' ? 'boldItalic' : 'bold'
    }
    return base === 'bold' || base === 'boldItalic' ? 'boldItalic' : 'italic'
}

function flattenInline(nodes: Inline[], style: Style): Token[] {
    const out: Token[] = []
    for (const node of nodes) {
        switch (node.type) {
            case 'text':
                out.push({
                    type: 'text',
                    text: sanitizeText(node.value),
                    style,
                })
                break
            case 'strong':
                out.push(...flattenInline(node.children, combine(style, 'bold')))
                break
            case 'emphasis':
                out.push(...flattenInline(node.children, combine(style, 'italic')))
                break
            case 'inlineCode':
                out.push({
                    type: 'text',
                    text: sanitizeText(node.value),
                    style,
                })
                break
            case 'link':
                out.push(...flattenInline(node.children, style))
                out.push({
                    type: 'text',
                    text: sanitizeText(` (${node.url})`),
                    style,
                })
                break
            case 'image':
                out.push({
                    type: 'text',
                    text: sanitizeText(`[image: ${node.alt}] (${node.url})`),
                    style,
                })
                break
            case 'break':
                out.push({ type: 'break' })
                break
        }
    }
    return out
}

function tokensToWords(tokens: Token[]): (Word | 'break')[] {
    const out: (Word | 'break')[] = []
    for (const token of tokens) {
        if (token.type === 'break') {
            out.push('break')
            continue
        }
        for (const word of token.text.split(/\s+/)) {
            if (word.length > 0) out.push({ text: word, style: token.style })
        }
    }
    return out
}

// Standard greedy word-wrap: keep adding words to the current line while
// they fit (tracking length as "words so far" + one space per gap), and
// start a new line once the next word wouldn't fit. An explicit 'break'
// forces a new line regardless of remaining width.
function wrapWords(words: (Word | 'break')[], maxChars: number): Word[][] {
    const lines: Word[][] = []
    let current: Word[] = []
    let currentLen = 0
    for (const word of words) {
        if (word === 'break') {
            lines.push(current)
            current = []
            currentLen = 0
            continue
        }
        if (current.length > 0 && currentLen + 1 + word.text.length > maxChars) {
            lines.push(current)
            current = []
            currentLen = 0
        }
        if (current.length > 0) currentLen += 1
        current.push(word)
        currentLen += word.text.length
    }
    if (current.length > 0 || lines.length === 0) lines.push(current)
    return lines
}

function renderParagraphLike(
    engine: LayoutEngine,
    nodes: Inline[],
    size: number,
    indent: number,
    baseStyle: Style,
): void {
    const words = tokensToWords(flattenInline(nodes, baseStyle))
    const maxChars = engine.maxCharsFor(size, indent)
    for (const line of wrapWords(words, maxChars)) {
        engine.addWordLine(line, size, indent)
    }
}

function renderListItem(
    engine: LayoutEngine,
    children: Block[],
    indent: number,
    marker: string,
): void {
    const first = children.length > 0 ? children[0] : undefined
    if (first?.type === 'paragraph') {
        const tokens: Token[] = [
            { type: 'text', text: sanitizeText(marker), style: 'regular' },
            ...flattenInline(first.children, 'regular'),
        ]
        const words = tokensToWords(tokens)
        const maxChars = engine.maxCharsFor(BODY_SIZE, indent)
        for (const line of wrapWords(words, maxChars)) {
            engine.addWordLine(line, BODY_SIZE, indent)
        }
        for (const rest of children.slice(1)) renderBlock(engine, rest, indent + 12)
    } else {
        engine.addRawLine(sanitizeText(marker.trimEnd()), BODY_SIZE, indent, 'regular')
        for (const child of children) renderBlock(engine, child, indent + 12)
    }
}

function renderBlock(engine: LayoutEngine, block: Block, indent: number): void {
    switch (block.type) {
        case 'heading':
            engine.addGap(6)
            renderParagraphLike(engine, block.children, HEADING_SIZES[block.level], indent, 'bold')
            engine.addGap(6)
            break
        case 'paragraph':
            renderParagraphLike(engine, block.children, BODY_SIZE, indent, 'regular')
            engine.addGap(BODY_SIZE * 0.6)
            break
        case 'code': {
            const lines = block.content.length > 0 ? block.content.split('\n') : []
            for (const line of lines) {
                engine.addRawLine(sanitizeText(line), CODE_SIZE, indent + 12, 'regular')
            }
            engine.addGap(CODE_SIZE * 0.6)
            break
        }
        case 'blockquote':
            for (const child of block.children) renderBlock(engine, child, indent + 16)
            break
        case 'list':
            block.items.forEach((item, idx): void => {
                const marker = block.ordered ? `${String((block.start ?? 1) + idx)}. ` : '- '
                renderListItem(engine, item.children, indent, marker)
            })
            engine.addGap(BODY_SIZE * 0.4)
            break
        case 'thematicBreak':
            engine.addRule(indent)
            break
    }
}

function buildContentStream(ops: Op[]): string {
    const parts: string[] = []
    for (const op of ops) {
        if (op.type === 'text') {
            parts.push('BT')
            parts.push(`${FONT_RESOURCE[op.style]} ${String(op.size)} Tf`)
            parts.push(`1 0 0 1 ${formatNumber(op.x)} ${formatNumber(op.y)} Tm`)
            parts.push(`(${escapePdfString(op.text)}) Tj`)
            parts.push('ET')
        } else {
            parts.push('1 w')
            parts.push(`${formatNumber(op.x1)} ${formatNumber(op.y1)} m`)
            parts.push(`${formatNumber(op.x2)} ${formatNumber(op.y2)} l`)
            parts.push('S')
        }
    }
    return parts.join('\n')
}

/**
 * Renders the shared Markdown AST directly to PDF bytes (see the module-level comment
 * above for scope/limitations).
 *
 * @param {Document} document - Parsed Markdown document
 * @returns {string} Complete PDF file contents as a byte string
 */
export function renderPdf(document: Document): string {
    const engine = new LayoutEngine()
    for (const block of document.children) {
        renderBlock(engine, block, 0)
    }
    engine.finish()

    const writer = new PdfWriter()
    const styles: Style[] = ['regular', 'bold', 'italic', 'boldItalic']
    const fontObjNums = new Map<Style, number>()
    for (const style of styles) {
        fontObjNums.set(
            style,
            writer.addObject(
                `<< /Type /Font /Subtype /Type1 /BaseFont /${FONT_BASENAME[style]} >>`,
            ),
        )
    }
    const fontDict = styles
        .map(
            (style): string => `${FONT_RESOURCE[style]} ${String(fontObjNums.get(style) ?? 0)} 0 R`,
        )
        .join(' ')
    const resourcesObjNum = writer.addObject(`<< /Font << ${fontDict} >> >>`)

    const pagesObjNum = writer.reserve()
    const pageObjNums: number[] = []
    for (const page of engine.pages) {
        const contentStream = buildContentStream(page.ops)
        const contentObjNum = writer.addObject(
            `<< /Length ${String(contentStream.length)} >>\nstream\n${contentStream}\nendstream`,
        )
        const pageObjNum = writer.addObject(
            `<< /Type /Page /Parent ${String(pagesObjNum)} 0 R /MediaBox [0 0 ${String(PAGE_WIDTH)} ${String(PAGE_HEIGHT)}] /Resources ${String(resourcesObjNum)} 0 R /Contents ${String(contentObjNum)} 0 R >>`,
        )
        pageObjNums.push(pageObjNum)
    }
    writer.setObject(
        pagesObjNum,
        `<< /Type /Pages /Kids [${pageObjNums.map((n): string => `${String(n)} 0 R`).join(' ')}] /Count ${String(pageObjNums.length)} >>`,
    )
    const catalogObjNum = writer.addObject(`<< /Type /Catalog /Pages ${String(pagesObjNum)} 0 R >>`)

    return writer.serialize(catalogObjNum)
}
