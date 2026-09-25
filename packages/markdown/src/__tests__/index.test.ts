import { describe, expect, it } from 'vitest'
import { mdToHtml, mdToPdf, validateMd } from '../index.js'

describe('public API', () => {
    it('mdToHtml converts markdown to an HTML fragment by default', () => {
        expect(mdToHtml('# Hi')).toBe('<h1>Hi</h1>')
    })

    it('mdToHtml can render a full page', () => {
        expect(mdToHtml('# Hi', { full: true })).toContain('<!DOCTYPE html>')
    })

    it('mdToPdf converts markdown to a PDF byte string', () => {
        const pdf = mdToPdf('# Hi')
        expect(pdf.startsWith('%PDF-1.4\n')).toBe(true)
    })

    it('validateMd validates a markdown string', () => {
        expect(validateMd('# Hi').valid).toBe(true)
        expect(validateMd('```\nunclosed').valid).toBe(false)
    })
})
