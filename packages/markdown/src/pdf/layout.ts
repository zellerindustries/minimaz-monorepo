import { LINE_HEIGHT_RATIO, MARGIN, PAGE_HEIGHT, PAGE_WIDTH } from './config.js';
import type { Op, Page, Style, Word } from './types.js';

/**
 * Courier is fixed-pitch: every glyph is exactly 0.6em wide, at any size.
 *
 * @param {number} size - Font size in points
 * @returns {number} Width of one glyph, in points
 */
export function charWidth(size: number): number {
    return size * 0.6;
}

// Tracks a single top-down cursor (`y`) down the current page; every
// add* method advances it and starts a new page automatically once
// there's no room left (`ensureSpace`). Callers never think in pages —
// they just keep calling add* methods and pages happen as a side effect.
export class LayoutEngine {
    pages: Page[] = [];
    private currentOps: Op[] = [];
    private y = PAGE_HEIGHT - MARGIN;

    private newPage(): void {
        this.pages.push({ ops: this.currentOps });
        this.currentOps = [];
        this.y = PAGE_HEIGHT - MARGIN;
    }

    private ensureSpace(height: number): void {
        if (this.y - height < MARGIN) {
            this.newPage();
        }
    }

    /**
     * @param {number} size - Font size in points
     * @param {number} indent - Left indent in points
     * @returns {number} Max characters that fit on one line at this size/indent, within the page margins
     */
    maxCharsFor(size: number, indent: number): number {
        const available = PAGE_WIDTH - MARGIN - indent - MARGIN;
        return Math.max(1, Math.floor(available / charWidth(size)));
    }

    /**
     * Draws one already-wrapped line of words, advancing the cursor by one line height.
     *
     * @param {Word[]} line - Words to draw, left to right
     * @param {number} size - Font size in points
     * @param {number} indent - Left indent in points
     * @returns {void}
     */
    addWordLine(line: Word[], size: number, indent: number): void {
        const lineHeight = size * LINE_HEIGHT_RATIO;
        this.ensureSpace(lineHeight);
        const cw = charWidth(size);
        let x = MARGIN + indent;
        for (let idx = 0; idx < line.length; idx++) {
            const word = line[idx];
            if (word === undefined) continue;
            if (idx > 0) x += cw;
            this.currentOps.push({
                type: 'text',
                x,
                y: this.y,
                style: word.style,
                size,
                text: word.text,
            });
            x += cw * word.text.length;
        }
        this.y -= lineHeight;
    }

    /**
     * Draws one line of raw (already-final) text, advancing the cursor by one line height.
     *
     * @param {string} text - Text to draw
     * @param {number} size - Font size in points
     * @param {number} indent - Left indent in points
     * @param {Style} style - Font style to draw with
     * @returns {void}
     */
    addRawLine(text: string, size: number, indent: number, style: Style): void {
        const lineHeight = size * LINE_HEIGHT_RATIO;
        this.ensureSpace(lineHeight);
        if (text.length > 0) {
            this.currentOps.push({
                type: 'text',
                x: MARGIN + indent,
                y: this.y,
                style,
                size,
                text,
            });
        }
        this.y -= lineHeight;
    }

    /**
     * Advances the cursor by a blank vertical gap, starting a new page if it runs out of room.
     *
     * @param {number} height - Gap height in points
     * @returns {void}
     */
    addGap(height: number): void {
        this.y -= height;
        if (this.y < MARGIN) {
            this.newPage();
        }
    }

    /**
     * Draws a horizontal rule (used for a Markdown thematic break) and advances the cursor.
     *
     * @param {number} indent - Left indent in points
     * @returns {void}
     */
    addRule(indent: number): void {
        const h = 12;
        this.ensureSpace(h);
        const yPos = this.y - h / 2;
        this.currentOps.push({
            type: 'line',
            x1: MARGIN + indent,
            y1: yPos,
            x2: PAGE_WIDTH - MARGIN,
            y2: yPos,
        });
        this.y -= h;
    }

    /**
     * Flushes the in-progress page's ops into `pages`. Must be called once after the last
     * add* call, since pages are otherwise only pushed lazily when a new one starts.
     *
     * @returns {void}
     */
    finish(): void {
        this.pages.push({ ops: this.currentOps });
    }
}
