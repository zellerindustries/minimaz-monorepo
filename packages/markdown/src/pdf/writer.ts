/*
Minimal, dependency-free PDF object/xref serializer. Callers build object
bodies (dictionaries/streams) as plain strings and this handles object
numbering, byte offsets, and the xref table + trailer.

Every object body must be plain ASCII (0x20-0x7E plus "\n") — the whole
file is assembled as a single JS string and returned as-is, relying on
that ASCII-only guarantee so the string's length equals its byte length
and encoding it as UTF-8 later can't corrupt anything.
*/

const pdfEscapes: Record<string, string> = {
    '\\': '\\\\',
    '(': '\\(',
    ')': '\\)',
}

/**
 * Escapes `\` and unbalanced-risk `(`/`)` characters for use inside a PDF literal string `(...)`.
 *
 * @param {string} text - Text to escape
 * @returns {string} Text safe to place between `(` and `)` in a PDF string object
 */
export function escapePdfString(text: string): string {
    return text.replace(/[\\()]/g, (char) => pdfEscapes[char] ?? char)
}

/**
 * Formats a number for PDF content streams: integers print bare, everything else to 2 decimals.
 *
 * @param {number} value - Number to format
 * @returns {string} PDF-safe numeric literal
 */
export function formatNumber(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

/** Accumulates indirect PDF objects and serializes them into a complete file (header, objects, xref, trailer). */
export class PdfWriter {
    private objects: string[] = []

    /**
     * Reserves the next object number without setting its body yet, so forward references
     * (e.g. a Pages dict that must cite Page object numbers created after it) can be resolved.
     *
     * @returns {number} The reserved 1-based object number
     */
    reserve(): number {
        this.objects.push('')
        return this.objects.length
    }

    /**
     * Sets (or overwrites) the body of a previously reserved object number.
     *
     * @param {number} objectNumber - Object number, as returned by `reserve`/`addObject`
     * @param {string} body - Object body (dictionary/stream text, without the `obj`/`endobj` wrapper)
     * @returns {void}
     */
    setObject(objectNumber: number, body: string): void {
        this.objects[objectNumber - 1] = body
    }

    /**
     * Reserves and immediately fills a new object.
     *
     * @param {string} body - Object body (dictionary/stream text, without the `obj`/`endobj` wrapper)
     * @returns {number} The new object's 1-based object number
     */
    addObject(body: string): number {
        const objectNumber = this.reserve()
        this.setObject(objectNumber, body)
        return objectNumber
    }

    /**
     * Serializes all accumulated objects into a complete PDF file string, with a matching xref
     * table and trailer.
     *
     * @param {number} rootObjectNumber - Object number of the document's `/Catalog`
     * @returns {string} Complete PDF file contents (ASCII-only, safe to encode as UTF-8 bytes)
     */
    serialize(rootObjectNumber: number): string {
        let out = '%PDF-1.4\n'
        const offsets: number[] = [0]
        for (let idx = 0; idx < this.objects.length; idx++) {
            offsets.push(out.length)
            out += `${String(idx + 1)} 0 obj\n${this.objects[idx] ?? ''}\nendobj\n`
        }
        const count = this.objects.length + 1
        const xrefOffset = out.length
        // Every xref entry must be exactly 20 bytes: 10-digit offset, space,
        // 5-digit generation, space, "n"/"f", space, then a 2-byte EOL — the
        // PDF spec fixes this width so readers can seek by record number.
        let xref = `xref\n0 ${String(count)}\n0000000000 65535 f \n`
        for (let i = 1; i < count; i++) {
            const offset = offsets[i] ?? 0
            xref += `${String(offset).padStart(10, '0')} 00000 n \n`
        }
        out += xref
        out += `trailer\n<< /Size ${String(count)} /Root ${String(rootObjectNumber)} 0 R >>\nstartxref\n${String(xrefOffset)}\n%%EOF`
        return out
    }
}
