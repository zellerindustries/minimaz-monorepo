import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
    BUNDLE_NAME,
    BUNDLE_SEPARATOR,
    EXTENSIONS,
    loadConfig,
    OUTPUT_DIRS,
} from '@minimaz/config';
import type { OutputFormat } from '@minimaz/config';
import { MdToHtml, MdToPdf } from '@minimaz/markdown';
import { findMarkdownFiles } from './walk.js';

/*
Orchestrator described in the original src/core.ts comment: load config,
walk docs.input.dir for .md files, then either bundle everything into one
converted output or convert each file individually, per docs.output.bundle.
Output paths (dist/html, dist/pdf) match the original src/markdown.ts
comment's stated targets, since @minimaz/markdown's MdToHtml/MdToPdf
only return strings — writing files is this orchestrator's job.
*/

async function convertAndWrite(
    markdown: string,
    outputName: string,
    formats: OutputFormat[],
    cwd: string,
): Promise<void> {
    await Promise.all(
        formats.map(async (format) => {
            const content =
                format === 'html'
                    ? MdToHtml(markdown, { full: true, title: outputName })
                    : MdToPdf(markdown);
            const outPath = path.join(
                cwd,
                OUTPUT_DIRS[format],
                `${outputName}${EXTENSIONS[format]}`,
            );
            await mkdir(path.dirname(outPath), { recursive: true });
            await writeFile(outPath, content, 'utf8');
        }),
    );
}

/**
 * Loads config, converts every Markdown file under `docs.input.dir`, and
 * writes the results to `dist/`.
 *
 * @param {string} cwd - Project directory containing `minimaz.config.json`
 * @returns {Promise<void>} Resolves once every output file has been written
 */
export async function buildDocs(cwd: string): Promise<void> {
    const config = await loadConfig(cwd);
    const inputDir = path.join(cwd, config.docs.input.dir);
    const files = await findMarkdownFiles(inputDir);
    const formats = config.docs.output.formats;

    if (config.docs.output.bundle) {
        const contents = await Promise.all(
            files.map((file): Promise<string> => readFile(file, 'utf8')),
        );
        await convertAndWrite(contents.join(BUNDLE_SEPARATOR), BUNDLE_NAME, formats, cwd);
        return;
    }

    await Promise.all(
        files.map(async (file) => {
            const markdown = await readFile(file, 'utf8');
            const relative = path.relative(inputDir, file);
            const outputName = relative.slice(0, relative.length - path.extname(relative).length);
            await convertAndWrite(markdown, outputName, formats, cwd);
        }),
    );
}
