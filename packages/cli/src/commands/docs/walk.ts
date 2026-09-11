import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { log } from '@minimaz/logger';

/**
 * Recursively collects Markdown files under `dir`; warns and skips any file
 * that isn't `.md` rather than silently dropping it, so an accidental
 * non-Markdown file in the docs tree surfaces instead of vanishing.
 *
 * @param {string} dir - Directory to walk
 * @returns {Promise<string[]>} Absolute paths of every `.md` file found
 */
export async function findMarkdownFiles(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await findMarkdownFiles(fullPath)));
            continue;
        }
        if (entry.name.toLowerCase().endsWith('.md')) {
            files.push(fullPath);
        } else {
            log.warn(`Skipping non-Markdown file: ${fullPath}`);
        }
    }
    return files;
}
