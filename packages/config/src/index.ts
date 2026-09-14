import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { KnownError } from '@minimaz/errors'
import { parseJson } from '@minimaz/json'
import type { BuildConfig, DocsConfig, MinimazConfig, OutputFormat, RawConfig } from './types.js'

/*
This module understands both the docs-builder config shape (`docs.input`/
`docs.output`) and the build-oriented shape (`input`/`output`) ported from
minimaz-cli — see `loadConfig` below for how the two are merged.
*/

/** Filename `loadConfig` looks for in the project's `cwd`. */
export const CONFIG_FILE_NAME = 'minimaz.config.json'

/** Defaults for the `docs` section of `MinimazConfig`, used to fill in whatever the config file omits. */
export const DEFAULT_CONFIG: DocsConfig = {
    docs: {
        input: { dir: 'docs' },
        output: { bundle: false, formats: ['html'] },
    },
}

/** Defaults for the build (`input`/`output`) section of `MinimazConfig`, used to fill in whatever the config file omits. */
export const DEFAULT_BUILD_CONFIG: BuildConfig = {
    input: { dir: './src', mapping: {}, externals: {}, exclude: [] },
    output: {
        dir: './dist',
        replace: {},
        css: { bundling: true, minify: true },
        html: { minify: true },
        js: { bundling: false, minify: true },
    },
}

/** Thrown by `loadConfig` when `minimaz.config.json` is missing from the target directory. */
export class ConfigNotFoundError extends KnownError {
    /**
     * @param {string} configPath - Absolute path where the config file was expected.
     */
    constructor(configPath: string) {
        super(`No config file found at ${configPath}. Run "minimaz docs init" first.`)
        this.name = 'ConfigNotFoundError'
    }
}

function isOutputFormat(value: string): value is OutputFormat {
    return value === 'html' || value === 'pdf'
}

function parseDocsConfig(parsed: RawConfig): DocsConfig {
    const inputDir = parsed.docs?.input?.dir ?? DEFAULT_CONFIG.docs.input.dir
    const bundle = parsed.docs?.output?.bundle ?? DEFAULT_CONFIG.docs.output.bundle
    const rawFormats = parsed.docs?.output?.formats
    const formats = Array.isArray(rawFormats) ? rawFormats.filter(isOutputFormat) : []

    return {
        docs: {
            input: { dir: inputDir },
            output: {
                bundle,
                formats: formats.length > 0 ? formats : DEFAULT_CONFIG.docs.output.formats,
            },
        },
    }
}

function parseBuildConfig(parsed: RawConfig): BuildConfig {
    const input = parsed.input
    const output = parsed.output

    return {
        input: {
            dir: input?.dir ?? DEFAULT_BUILD_CONFIG.input.dir,
            mapping: input?.mapping ?? DEFAULT_BUILD_CONFIG.input.mapping,
            externals: input?.externals ?? DEFAULT_BUILD_CONFIG.input.externals,
            exclude: input?.exclude ?? DEFAULT_BUILD_CONFIG.input.exclude,
        },
        output: {
            dir: output?.dir ?? DEFAULT_BUILD_CONFIG.output.dir,
            replace: output?.replace ?? DEFAULT_BUILD_CONFIG.output.replace,
            css: {
                bundling: output?.css?.bundling ?? DEFAULT_BUILD_CONFIG.output.css.bundling,
                minify: output?.css?.minify ?? DEFAULT_BUILD_CONFIG.output.css.minify,
            },
            html: {
                minify: output?.html?.minify ?? DEFAULT_BUILD_CONFIG.output.html.minify,
            },
            js: {
                bundling: output?.js?.bundling ?? DEFAULT_BUILD_CONFIG.output.js.bundling,
                minify: output?.js?.minify ?? DEFAULT_BUILD_CONFIG.output.js.minify,
            },
        },
    }
}

function parseConfig(raw: unknown): MinimazConfig {
    const parsed: RawConfig = typeof raw === 'object' && raw !== null ? raw : {}
    return {
        ...parseDocsConfig(parsed),
        ...parseBuildConfig(parsed),
    }
}

/**
 * Reads `minimaz.config.json` from `cwd`, filling in defaults for missing/invalid fields in the
 * `docs` and build (`input`/`output`) sections independently — both are always present in the
 * result regardless of which sections the file provided.
 *
 * @param {string} cwd - Directory to look for `minimaz.config.json` in.
 * @returns {Promise<MinimazConfig>} The parsed config with defaults filled in.
 * @throws {ConfigNotFoundError} When `minimaz.config.json` does not exist in `cwd`.
 */
export async function loadConfig(cwd: string): Promise<MinimazConfig> {
    const configPath = path.join(cwd, CONFIG_FILE_NAME)
    let raw: string
    try {
        raw = await readFile(configPath, 'utf8')
    } catch {
        throw new ConfigNotFoundError(configPath)
    }
    return parseConfig(parseJson(raw))
}

/** HTML comment inserted between docs pages when they're bundled into a single output file. */
export const BUNDLE_SEPARATOR = '\n\n<!-- ============================== -->\n\n'

/** Base filename (without extension) used for a bundled docs output file. */
export const BUNDLE_NAME = 'bundle'

/** Output directory for each docs `OutputFormat`, relative to the configured build output dir. */
export const OUTPUT_DIRS: Record<OutputFormat, string> = {
    html: 'dist/html',
    pdf: 'dist/pdf',
}

/** File extension for each docs `OutputFormat`. */
export const EXTENSIONS: Record<OutputFormat, string> = {
    html: '.html',
    pdf: '.pdf',
}

export type {
    BuildBundleOptions,
    BuildConfig,
    BuildInputConfig,
    BuildOutputConfig,
    DocsConfig,
    DocsInputConfig,
    DocsOutputConfig,
    MinimazConfig,
    OutputFormat,
    RawConfig,
} from './types.js'
