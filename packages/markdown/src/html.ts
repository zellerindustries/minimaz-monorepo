import type { RenderHtmlOptions, Block, Document, Inline } from './types.js'

const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
}

function escapeHtml(text: string): string {
    return text.replace(/[&<>"]/g, (char) => htmlEscapes[char] ?? char)
}

// Browsers strip ASCII tab/newline anywhere in a URL and leading C0
// controls/spaces before resolving its scheme, so "java\tscript:" still runs —
// normalize the same way before checking.
const unsafeLinkSchemeRe = /^(?:javascript|vbscript|data):/
// eslint-disable-next-line no-control-regex -- matching C0 controls is the point
const urlIgnoredCharsRe = /[\u0000- ]/g

function isUnsafeLinkUrl(url: string): boolean {
    return unsafeLinkSchemeRe.test(url.replace(urlIgnoredCharsRe, '').toLowerCase())
}

function renderInlineNode(node: Inline): string {
    switch (node.type) {
        case 'text':
            return escapeHtml(node.value)
        case 'strong':
            return `<strong>${renderInline(node.children)}</strong>`
        case 'emphasis':
            return `<em>${renderInline(node.children)}</em>`
        case 'inlineCode':
            return `<code>${escapeHtml(node.value)}</code>`
        case 'link': {
            if (isUnsafeLinkUrl(node.url)) {
                return renderInline(node.children)
            }
            const title = node.title !== undefined ? ` title="${escapeHtml(node.title)}"` : ''
            return `<a href="${escapeHtml(node.url)}"${title}>${renderInline(node.children)}</a>`
        }
        case 'image': {
            const title = node.title !== undefined ? ` title="${escapeHtml(node.title)}"` : ''
            return `<img src="${escapeHtml(node.url)}" alt="${escapeHtml(node.alt)}"${title} />`
        }
        case 'break':
            return '<br />\n'
    }
}

function renderInline(nodes: Inline[]): string {
    return nodes.map(renderInlineNode).join('')
}

// A list item containing only a single paragraph renders "tight" (no <p>
// wrapper around its text), matching how CommonMark renders lists whose
// items aren't separated by blank lines. Anything else (multiple blocks,
// e.g. a nested list) falls back to rendering each block normally.
function renderListItemContent(children: Block[]): string {
    const only = children.length === 1 ? children[0] : undefined
    if (only?.type === 'paragraph') {
        return renderInline(only.children)
    }
    return renderBlocks(children)
}

function renderBlock(block: Block): string {
    switch (block.type) {
        case 'heading':
            return `<h${String(block.level)}>${renderInline(block.children)}</h${String(block.level)}>`
        case 'paragraph':
            return `<p>${renderInline(block.children)}</p>`
        case 'code': {
            const cls =
                block.lang !== undefined ? ` class="language-${escapeHtml(block.lang)}"` : ''
            return `<pre><code${cls}>${escapeHtml(block.content)}</code></pre>`
        }
        case 'blockquote':
            return `<blockquote>\n${renderBlocks(block.children)}\n</blockquote>`
        case 'list': {
            const tag = block.ordered ? 'ol' : 'ul'
            const startAttr =
                block.ordered && block.start !== undefined && block.start !== 1
                    ? ` start="${String(block.start)}"`
                    : ''
            const items = block.items
                .map((item): string => `<li>${renderListItemContent(item.children)}</li>`)
                .join('\n')
            return `<${tag}${startAttr}>\n${items}\n</${tag}>`
        }
        case 'thematicBreak':
            return '<hr />'
    }
}

function renderBlocks(blocks: Block[]): string {
    return blocks.map(renderBlock).join('\n')
}

const defaultTitle = 'Document'

function fullPage(body: string, title: string): string {
    return [
        '<!DOCTYPE html>',
        '<html lang="en">',
        '<head>',
        '<meta charset="UTF-8" />',
        '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
        `<title>${escapeHtml(title)}</title>`,
        '</head>',
        '<body>',
        body,
        '</body>',
        '</html>',
        '',
    ].join('\n')
}

/**
 * Renders a parsed document to an HTML fragment, or a full page if `options.full` is true.
 *
 * @param {Document} document - Parsed Markdown document
 * @param {RenderHtmlOptions} [options] - Rendering options (full page vs fragment, page title)
 * @returns {string} Rendered HTML
 */
export function renderHtml(document: Document, options: RenderHtmlOptions = {}): string {
    const body = renderBlocks(document.children)
    return options.full === true ? fullPage(body, options.title ?? defaultTitle) : body
}
