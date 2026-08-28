import type { Style } from "./types.js";

export const PAGE_WIDTH = 595;
export const PAGE_HEIGHT = 842;
export const MARGIN = 56;
export const LINE_HEIGHT_RATIO = 1.4;
export const HEADING_SIZES: Record<1 | 2 | 3 | 4 | 5 | 6, number> = {
    1: 20,
    2: 17,
    3: 14,
    4: 12,
    5: 11,
    6: 11,
};
export const BODY_SIZE = 11;
export const CODE_SIZE = 10;

export const FONT_RESOURCE: Record<Style, string> = {
    regular: "/F1",
    bold: "/F2",
    italic: "/F3",
    boldItalic: "/F4",
};

export const FONT_BASENAME: Record<Style, string> = {
    regular: "Courier",
    bold: "Courier-Bold",
    italic: "Courier-Oblique",
    boldItalic: "Courier-BoldOblique",
};
