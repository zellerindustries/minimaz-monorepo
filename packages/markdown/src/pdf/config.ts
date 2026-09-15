import type { Style } from './types.js'

export const pageWidth = 595
export const pageHeight = 842
export const margin = 56
export const lineHeightRatio = 1.4
export const headingSizes: Record<1 | 2 | 3 | 4 | 5 | 6, number> = {
    1: 20,
    2: 17,
    3: 14,
    4: 12,
    5: 11,
    6: 11,
}
export const bodySize = 11
export const codeSize = 10

export const fontResource: Record<Style, string> = {
    regular: '/F1',
    bold: '/F2',
    italic: '/F3',
    boldItalic: '/F4',
}

export const fontBasename: Record<Style, string> = {
    regular: 'Courier',
    bold: 'Courier-Bold',
    italic: 'Courier-Oblique',
    boldItalic: 'Courier-BoldOblique',
}
