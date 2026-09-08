import { describe, expect, it } from 'vitest';
import { MdToHtml, MdToPdf, validateMd } from './index.js';

describe('public API', () => {
    it('MdToHtml converts markdown to an HTML fragment by default', () => {
        expect(MdToHtml('# Hi')).toBe('<h1>Hi</h1>');
    });

    it('MdToHtml can render a full page', () => {
        expect(MdToHtml('# Hi', { full: true })).toContain('<!DOCTYPE html>');
    });

    it('MdToPdf converts markdown to a PDF byte string', () => {
        const pdf = MdToPdf('# Hi');
        expect(pdf.startsWith('%PDF-1.4\n')).toBe(true);
    });

    it('validateMd validates a markdown string', () => {
        expect(validateMd('# Hi').valid).toBe(true);
        expect(validateMd('```\nunclosed').valid).toBe(false);
    });
});
