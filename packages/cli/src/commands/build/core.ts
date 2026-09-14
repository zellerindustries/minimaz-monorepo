import { readFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import type { MinimazConfig } from '@minimaz/config'
import {
    applyReplacements,
    copy,
    ensureDir,
    getDirElements,
    isDirectory,
    outputFile,
    pathExists,
    remove,
} from '@minimaz/core'
import { bundleCss } from '@minimaz/css'
import { log } from '@minimaz/logger'
import { processCss } from './processors/css.js'
import { processHtml } from './processors/html.js'
import { processJs, processTs } from './processors/javascript.js'
import type { File } from './types.js'

const PROCESSABLE_EXTENSIONS = new Set(['.css', '.js', '.ts', '.tsx', '.html'])

/**
 * Removes and recreates the build output directory, so every build starts
 * from a clean slate.
 *
 * @param {string} path - Absolute path to the output directory
 */
export async function reCreateOutDir(path: string): Promise<void> {
    await remove(path)
    await ensureDir(path)
}

/**
 * Discovery pass: walks `currentDir`, and for each `.css` file where
 * `output.css.bundling` is enabled, resolves its `@import` graph via
 * `bundleCss` and adds every non-entry input path to `ignoredFiles` — so
 * the processing pass (`walkFolder`) skips them instead of emitting them
 * as standalone output files. JS/TS files are never added, since JS/TS
 * bundling isn't supported.
 *
 * @param {string} currentDir - Directory to scan (recurses into subdirectories)
 * @param {MinimazConfig} config - The loaded build configuration
 * @param {Set<string>} ignoredFiles - Mutated in place with resolved absolute paths to skip
 */
export async function runDiscovery(
    currentDir: string,
    config: MinimazConfig,
    ignoredFiles: Set<string>,
): Promise<void> {
    const items = await getDirElements(currentDir)

    for (const item of items) {
        if (config.input.exclude.includes(item)) {
            continue
        }

        const fullPath = join(currentDir, item)

        if (await isDirectory(fullPath)) {
            await runDiscovery(fullPath, config, ignoredFiles)
            continue
        }

        const ext = extname(fullPath).toLowerCase()
        if (ext === '.css' && config.output.css.bundling) {
            const { inputs } = await bundleCss(fullPath)
            const entry = resolve(fullPath)

            for (const inputPath of inputs) {
                const resolvedInput = resolve(inputPath)
                if (resolvedInput !== entry) {
                    ignoredFiles.add(resolvedInput)
                }
            }
        }
    }
}

/**
 * Dispatches a single file to the processor matching its extension, then
 * writes the result to `file.dest` (or, for `.ts`/`.tsx`, to `file.dest`
 * with the extension swapped to `.js`). Unrecognized extensions are
 * copied as-is.
 *
 * @param {File} file - The file to process
 * @param {MinimazConfig} config - The loaded build configuration
 * @param {Set<string>} ignoredFiles - Unused by processing itself, threaded through for interface symmetry with the discovery pass
 */
export async function processFile(
    file: File,
    config: MinimazConfig,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ignoredFiles: Set<string>,
): Promise<void> {
    switch (file.ext) {
        case '.css': {
            const content = await processCss(file, config)
            await outputFile(file.dest, content)
            break
        }
        case '.js': {
            const content = processJs(file, config)
            await outputFile(file.dest, content)
            break
        }
        case '.ts':
        case '.tsx': {
            const content = processTs(file, config)
            const jsDest = file.dest.replace(/\.(ts|tsx)$/i, '.js')
            await outputFile(jsDest, content)
            break
        }
        case '.html': {
            const content = await processHtml(file, config)
            await outputFile(file.dest, content)
            break
        }
        default:
            await ensureDir(dirname(file.dest))
            await copy(file.src, file.dest)
    }
}

/**
 * Processing pass: recursively walks `from`, applying `input.mapping`
 * (redirecting a top-level folder's contents to a different destination
 * under `to`, when `from` is `rootDir`) and `input.exclude` (skipping
 * matching names), reading + replacement-applying each processable
 * file's content, and dispatching it to `processFile`. Files in
 * `ignoredFiles` (populated by `runDiscovery`) are skipped.
 *
 * @param {string} from - Current source directory
 * @param {string} to - Current destination directory
 * @param {MinimazConfig} config - The loaded build configuration
 * @param {Set<string>} ignoredFiles - Absolute source paths to skip
 * @param {string} rootDir - The build's top-level input directory (mapping only applies at this level)
 */
export async function walkFolder(
    from: string,
    to: string,
    config: MinimazConfig,
    ignoredFiles: Set<string>,
    rootDir: string,
): Promise<void> {
    const items = await getDirElements(from)
    const isRootLevel = resolve(from) === resolve(rootDir)

    for (const item of items) {
        if (config.input.exclude.includes(item)) {
            continue
        }

        const fromPath = join(from, item)
        const resolvedFromPath = resolve(fromPath)

        if (ignoredFiles.has(resolvedFromPath)) {
            log.debug(`Skipping bundled dependency: ${resolvedFromPath}`)
            continue
        }

        const mappedValue = config.input.mapping[item]
        const nextToPath =
            isRootLevel && typeof mappedValue === 'string' ? join(to, mappedValue) : join(to, item)

        if (await isDirectory(fromPath)) {
            await walkFolder(fromPath, nextToPath, config, ignoredFiles, rootDir)
            continue
        }

        const ext = extname(fromPath).toLowerCase()
        let content = ''

        if (PROCESSABLE_EXTENSIONS.has(ext)) {
            const raw = await readFile(fromPath, 'utf8')
            content = applyReplacements(raw, config.output.replace)
        }

        await processFile({ src: fromPath, dest: nextToPath, content, ext }, config, ignoredFiles)
    }
}

/**
 * Processes `input.externals`: remote (`http`-prefixed) sources are
 * logged and skipped; local sources not already in `ignoredFiles` are
 * copied/processed into `outDirPath` at their configured destination
 * (recursing via `walkFolder` when the source is a directory).
 *
 * @param {string} cwd - Directory externals' relative paths are resolved against
 * @param {string} rootDir - The build's real top-level input directory, so
 *   `input.mapping` (meant only for the main input tree) never fires
 *   inside an external directory
 * @param {string} outDirPath - The build output directory
 * @param {Record<string, string>} externals - Map of local-path-or-URL to destination
 * @param {MinimazConfig} config - The loaded build configuration
 * @param {Set<string>} ignoredFiles - Absolute source paths to skip
 */
export async function processExternals(
    cwd: string,
    rootDir: string,
    outDirPath: string,
    externals: Record<string, string>,
    config: MinimazConfig,
    ignoredFiles: Set<string>,
): Promise<void> {
    for (const [source, destination] of Object.entries(externals)) {
        if (source.startsWith('http')) {
            log.info(`Remote external: ${source} -> ${destination}`)
            continue
        }

        const fullPath = resolve(cwd, source)

        if (ignoredFiles.has(fullPath)) {
            continue
        }

        if (!(await pathExists(fullPath))) {
            log.warn(`External not found: ${source}`)
            continue
        }

        const targetPath = join(outDirPath, destination)

        if (await isDirectory(fullPath)) {
            await walkFolder(fullPath, targetPath, config, ignoredFiles, rootDir)
            continue
        }

        const ext = extname(fullPath).toLowerCase()
        let content = ''

        if (PROCESSABLE_EXTENSIONS.has(ext)) {
            const raw = await readFile(fullPath, 'utf8')
            content = applyReplacements(raw, config.output.replace)
        }

        await processFile({ src: fullPath, dest: targetPath, content, ext }, config, ignoredFiles)
    }
}
