import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { log } from '@minimaz/logger';

/** Recurses into directories; warns and skips any file that isn't .md. */
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
