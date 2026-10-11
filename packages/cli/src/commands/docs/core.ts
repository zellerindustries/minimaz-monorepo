import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
    bundleName,
    bundleSeparator,
    outputExtensions,
    loadConfig,
    resolveDocsOutputDirs,
} from '@minimaz/config'
import type { OutputFormat } from '@minimaz/config'
import { KnownError } from '@minimaz/logger'
import { mdToHtml, mdToPdf, validateMd } from '@minimaz/markdown'
import { findMarkdownFiles } from './walk.js'

/*
Orchestrator described in the original src/core.ts comment: load config,
walk docs.input.dir for .md files, then either bundle everything into one
converted output or convert each file individually, per docs.output.bundle.
Output goes to a sibling of output.dir (`<output.dir>-docs/{html,pdf}`, e.g.
dist-docs/html), never inside it, since build/clear wipe output.dir wholesale.
@minimaz/markdown's mdToHtml/mdToPdf only return strings — writing files is
this orchestrator's job.
*/

interface DocsSource {
    /** Path relative to `docs.input.dir`, used in error messages and output names. */
    relative: string
    markdown: string
}

// mdToHtml/mdToPdf are deliberately lenient (an unterminated fence just
// swallows the rest of the file), so check every file up front — per file,
// so line numbers stay meaningful even when bundling — and fail before
// writing anything.
function assertValidMarkdown(sources: DocsSource[]): void {
    const errors: string[] = []
    for (const { relative, markdown } of sources) {
        for (const error of validateMd(markdown).errors) {
            errors.push(`${relative}: ${error}`)
        }
    }
    if (errors.length > 0) {
        throw new KnownError(['Invalid Markdown in docs:', ...errors].join('\n  '))
    }
}

async function convertAndWrite(
    markdown: string,
    outputName: string,
    formats: OutputFormat[],
    outputDirs: Record<OutputFormat, string>,
    cwd: string,
): Promise<void> {
    await Promise.all(
        formats.map(async (format) => {
            const content =
                format === 'html'
                    ? mdToHtml(markdown, { full: true, title: outputName })
                    : mdToPdf(markdown)
            const outPath = path.resolve(
                cwd,
                outputDirs[format],
                `${outputName}${outputExtensions[format]}`,
            )
            await mkdir(path.dirname(outPath), { recursive: true })
            await writeFile(outPath, content, 'utf8')
        }),
    )
}

/**
 * Loads config, converts every Markdown file under `docs.input.dir`, and
 * writes the results to `<output.dir>-docs/html` and `<output.dir>-docs/pdf`
 * (`dist-docs/` by default).
 *
 * @param {string} cwd - Project directory containing `minimaz.config.json`
 * @returns {Promise<void>} Resolves once every output file has been written
 * @throws {KnownError} When any file has a structural Markdown error (e.g. an
 *   unterminated code fence); lists every one as `<file>: <error>`, and nothing is written
 */
export async function buildDocs(cwd: string): Promise<void> {
    const config = await loadConfig(cwd, { initCommand: 'minimaz docs init' })
    const inputDir = path.join(cwd, config.docs.input.dir)
    const files = await findMarkdownFiles(inputDir)
    const formats = config.docs.output.formats
    const outputDirs = resolveDocsOutputDirs(config.output.dir)

    const sources = await Promise.all(
        files.map(async (file): Promise<DocsSource> => ({
            relative: path.relative(inputDir, file),
            markdown: await readFile(file, 'utf8'),
        })),
    )
    assertValidMarkdown(sources)

    if (config.docs.output.bundle) {
        const bundled = sources.map((source): string => source.markdown).join(bundleSeparator)
        await convertAndWrite(bundled, bundleName, formats, outputDirs, cwd)
        return
    }

    await Promise.all(
        sources.map(async ({ relative, markdown }) => {
            const outputName = relative.slice(0, relative.length - path.extname(relative).length)
            await convertAndWrite(markdown, outputName, formats, outputDirs, cwd)
        }),
    )
}
