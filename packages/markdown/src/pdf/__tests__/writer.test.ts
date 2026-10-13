import { describe, expect, it } from 'vitest'
import { escapePdfString, formatNumber, PdfWriter } from '../writer.js'

describe('escapePdfString', () => {
    it('escapes backslashes and parentheses', () => {
        expect(escapePdfString('a\\b(c)d')).toBe('a\\\\b\\(c\\)d')
    })

    it('leaves other text untouched', () => {
        expect(escapePdfString('plain text 123')).toBe('plain text 123')
    })
})

describe('formatNumber', () => {
    it('prints integers bare', () => {
        expect(formatNumber(42)).toBe('42')
        expect(formatNumber(0)).toBe('0')
    })

    it('prints non-integers with two decimals', () => {
        expect(formatNumber(1.5)).toBe('1.50')
        expect(formatNumber(2.346)).toBe('2.35')
    })
})

describe('PdfWriter', () => {
    it('numbers objects from 1 and lets a reserved object be filled later', () => {
        const writer = new PdfWriter()
        const reserved = writer.reserve()
        const added = writer.addObject('<< /A 1 >>')
        expect(reserved).toBe(1)
        expect(added).toBe(2)
        writer.setObject(reserved, '<< /B 2 >>')
        const pdf = writer.serialize(reserved)
        expect(pdf).toContain('1 0 obj\n<< /B 2 >>\nendobj\n')
        expect(pdf).toContain('2 0 obj\n<< /A 1 >>\nendobj\n')
    })

    it('serializes an empty reserved object as an empty body', () => {
        const writer = new PdfWriter()
        writer.reserve()
        expect(writer.serialize(1)).toContain('1 0 obj\n\nendobj\n')
    })

    it('writes a trailer with size, root and a correct startxref offset', () => {
        const writer = new PdfWriter()
        writer.addObject('<< /Type /Catalog >>')
        writer.addObject('<< /X 1 >>')
        const pdf = writer.serialize(1)
        expect(pdf.startsWith('%PDF-1.4\n')).toBe(true)
        expect(pdf).toContain('trailer\n<< /Size 3 /Root 1 0 R >>')
        expect(pdf.endsWith('%%EOF')).toBe(true)
        const startxref = /startxref\n(\d+)\n%%EOF$/.exec(pdf)
        expect(startxref).not.toBeNull()
        expect(pdf.slice(Number(startxref?.[1])).startsWith('xref\n0 3\n')).toBe(true)
    })

    it('writes xref entries of exactly 20 bytes pointing at each object', () => {
        const writer = new PdfWriter()
        writer.addObject('<< /A 1 >>')
        writer.addObject('<< /B 2 >>')
        const pdf = writer.serialize(1)
        const xref = pdf.slice(pdf.indexOf('xref\n'), pdf.indexOf('trailer'))
        const entries = xref.split('\n').slice(2, -1)
        expect(entries).toHaveLength(3)
        expect(entries[0]).toBe('0000000000 65535 f ')
        for (const [idx, entry] of entries.entries()) {
            expect(`${entry}\n`).toHaveLength(20)
            if (idx > 0) {
                const offset = Number(entry.slice(0, 10))
                expect(pdf.slice(offset).startsWith(`${String(idx)} 0 obj\n`)).toBe(true)
            }
        }
    })
})
