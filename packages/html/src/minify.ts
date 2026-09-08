import { minify } from 'html-minifier-terser';

/**
 * Minifies HTML via `html-minifier-terser`: collapses whitespace, strips
 * comments, removes redundant attributes, and minifies inline
 * `<script>`/`<style>` content using that library's own bundled minifiers.
 *
 * Throws on minification failure (with the original error chained as
 * `cause`) rather than silently returning the unminified input — unlike
 * `minimaz-cli`'s original, which caught the error, logged it, and
 * returned the original code as a fallback.
 *
 * @param {string} code - HTML source to minify
 * @returns {Promise<string>} Minified HTML, or `''` for empty/whitespace-only input
 */
export async function minifyHtml(code: string): Promise<string> {
    if (typeof code !== 'string') {
        throw new Error('minifyHtml: code must be a string');
    }

    const input = code.trim();
    if (!input) {
        return '';
    }

    try {
        return await minify(input, {
            collapseWhitespace: true,
            removeComments: true,
            removeRedundantAttributes: true,
            removeScriptTypeAttributes: true,
            removeStyleLinkTypeAttributes: true,
            useShortDoctype: true,
            minifyJS: true,
            minifyCSS: true,
            processConditionalComments: true,
            ignoreCustomComments: [/^!/],
            caseSensitive: true,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`minifyHtml: failed to minify HTML: ${message}`, {
            cause: error,
        });
    }
}
