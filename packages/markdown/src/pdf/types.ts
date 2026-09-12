export type Style = 'regular' | 'bold' | 'italic' | 'boldItalic'

export interface Word {
    text: string
    style: Style
}

export interface TextOp {
    type: 'text'
    x: number
    y: number
    style: Style
    size: number
    text: string
}

export interface LineOp {
    type: 'line'
    x1: number
    y1: number
    x2: number
    y2: number
}

/** A single drawing instruction in a PDF content stream: styled text, or a plain line. */
export type Op = TextOp | LineOp

export interface Page {
    ops: Op[]
}

/**
 * Intermediate form between the Markdown AST and layout: inline formatting (strong/emphasis)
 * has already been flattened into per-run `style`, and an explicit `'break'` token marks a
 * forced line break (from a Markdown hard break) for `wrapWords` to honor regardless of width.
 */
export type Token =
    | {
          type: 'text'
          text: string
          style: Style
      }
    | { type: 'break' }
