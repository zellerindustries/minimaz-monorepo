/** Options controlling `renderHtml`/`MdToHtml` output. */
export interface RenderHtmlOptions {
    /** Render a full `<html>` document instead of a bare fragment. */
    full?: boolean

    /** Page `<title>`, used only when `full` is true. */
    title?: string
}

/** Result of `validateMd`: whether the input is valid, and any errors found. */
export interface ValidateMdResult {
    valid: boolean
    errors: string[]
}

export interface ListMarkerInfo {
    ordered: boolean
    start: number | undefined
    /** Column where the item's content begins (indent + marker + one space). */
    contentColumn: number
    rest: string
}

/*
Discriminated unions keyed on `type`, produced by parser.ts and consumed
by html.ts and pdf/render.ts. Fields like `title: string | undefined`
are written as explicit unions rather than optional (`title?: string`)
because exactOptionalPropertyTypes forbids assigning a possibly-undefined
value to an optional property — and the parser always sets every field
explicitly (e.g. a link with no title still assigns `title: undefined`),
so the explicit union matches how these nodes actually get built.
*/

export type Inline =
    | { type: 'text'; value: string }
    | { type: 'strong'; children: Inline[] }
    | { type: 'emphasis'; children: Inline[] }
    | { type: 'inlineCode'; value: string }
    | {
          type: 'link'
          url: string
          title: string | undefined
          children: Inline[]
      }
    | { type: 'image'; url: string; alt: string; title: string | undefined }
    | { type: 'break' }

export interface ListItem {
    children: Block[]
}

export type Block =
    | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; children: Inline[] }
    | { type: 'paragraph'; children: Inline[] }
    | { type: 'code'; lang: string | undefined; content: string }
    | { type: 'blockquote'; children: Block[] }
    | {
          type: 'list'
          ordered: boolean
          start: number | undefined
          items: ListItem[]
      }
    | { type: 'thematicBreak' }

export interface Document {
    type: 'document'
    children: Block[]
}
