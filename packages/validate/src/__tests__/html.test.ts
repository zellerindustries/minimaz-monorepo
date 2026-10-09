import { describe, expect, it } from 'vitest'
import { HtmlValidationError, validateHtml } from '../html.js'

function errorsFor(code: string): string[] {
    try {
        validateHtml(code)
    } catch (error: unknown) {
        if (error instanceof HtmlValidationError) {
            return error.errors
        }
        throw error
    }
    return []
}

describe('validateHtml', () => {
    it('accepts properly nested tags', () => {
        expect(errorsFor('<div><p>x</p></div>')).toEqual([])
    })

    it('accepts void elements without a closing tag', () => {
        expect(errorsFor('<br><img src="a"><input>')).toEqual([])
    })

    it('accepts self-closing tags', () => {
        expect(errorsFor('<svg><path /></svg>')).toEqual([])
    })

    it('skips DOCTYPE declarations', () => {
        expect(errorsFor('<!DOCTYPE html><html></html>')).toEqual([])
    })

    it('matches tag names case-insensitively', () => {
        expect(errorsFor('<DIV></div>')).toEqual([])
    })

    it('ignores > inside a quoted attribute value', () => {
        expect(errorsFor('<div title="a > b"></div>')).toEqual([])
    })

    it('reports a mismatched closing tag and every tag left open', () => {
        expect(errorsFor('<div><span>x</div>')).toEqual([
            'closing tag </div> does not match open tag <span>',
        ])
    })

    it('reports a mismatched closing tag once, without a cascade', () => {
        expect(errorsFor('<div><b><i>x</b></div>')).toEqual([
            'closing tag </b> does not match open tag <i>',
        ])
        expect(errorsFor('<div></span></div>')).toEqual([
            'closing tag </span> does not match open tag <div>',
        ])
    })

    it.each([
        '<ul><li>a<li>b</ul>',
        '<ul><li>a</li><li>b</ul>',
        '<ul><li>a<ul><li>b</ul><li>c</ul>',
        '<table><tr><td>a<td>b<tr><td>c</table>',
        '<table><thead><tr><th>a<th>b<tbody><tr><td>1<td>2<tfoot><tr><td>3</table>',
        '<dl><dt>a<dd>b<dt>c<dd>d</dl>',
        '<select><optgroup label="g"><option>a<option>b<optgroup label="h"><option>c</select>',
        '<div><p>x</div>',
        '<p>a<p>b<div>c</div>',
        '<p>unterminated at EOF',
    ])('accepts HTML5 optional end tags: %s', (code) => {
        expect(errorsFor(code)).toEqual([])
    })

    it('still reports a non-optional tag left open inside an optional one', () => {
        expect(errorsFor('<ul><li><b>a</ul>')).toEqual([
            'closing tag </ul> does not match open tag <b>',
        ])
    })

    it('reports an unclosed tag at the end of input', () => {
        expect(errorsFor('<div>')).toEqual(['unclosed tag <div>'])
    })

    it('reports a closing tag with no opening tag', () => {
        expect(errorsFor('</div>')).toEqual(['closing tag </div> has no matching opening tag'])
    })

    it('reports an unterminated attribute quote', () => {
        expect(errorsFor('<a href="x>')).toEqual([
            'unterminated attribute quote in tag starting at index 0',
        ])
    })

    it('reports a tag missing its closing >', () => {
        expect(errorsFor('<div')).toEqual(['unclosed tag starting at index 0'])
    })

    it('reports an unterminated comment', () => {
        expect(errorsFor('<!-- open')).toEqual(['unterminated comment'])
    })

    it('rejects a non-string input', () => {
        expect(errorsFor(1 as unknown as string)).toEqual(['code must be a string'])
    })

    it.each([
        '<script>if (a < b) { x() }</script>',
        '<script>if (a<b) { x() }</script>',
        '<style>a<b{}</style>',
        '<textarea>1 < 2</textarea>',
        '<title>a < b</title>',
        '<SCRIPT>a<b</SCRIPT>',
    ])('treats the contents of a raw-text element as text: %s', (code) => {
        expect(errorsFor(code)).toEqual([])
    })

    it('still reports a raw-text element that is never closed', () => {
        expect(errorsFor('<script>a < b')).toEqual(['unclosed tag <script>'])
    })

    it('ignores a near-match end tag inside raw-text content', () => {
        expect(errorsFor('<script>a</scriptx>b</script>')).toEqual([])
    })

    it('accepts whitespace before the > of a raw-text end tag', () => {
        expect(errorsFor('<script>a < b</script >')).toEqual([])
    })

    it('does not treat a non-breaking space as ending a raw-text end tag name', () => {
        expect(errorsFor('<script>a</script\u00a0b>c</script>')).toEqual([])
    })
})
