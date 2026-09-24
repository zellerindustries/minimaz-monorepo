import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { KnownError } from '@minimaz/logger'
import { parseJson } from '@minimaz/json'
import type {
    BuildConfig,
    DocsConfig,
    MinimazConfig,
    OutputFormat,
    RawConfig,
    ServeConfig,
} from './types.js'

/*
This module understands both the docs-builder config shape (`docs.input`/
`docs.output`) and the build-oriented shape (`input`/`output`) ported from
minimaz-cli — see `loadConfig` below for how the two are merged.
*/

/** Filename `loadConfig` looks for in the project's `cwd`. */
export const configFileName = 'minimaz.config.json'

/** Defaults for the `docs` section of `MinimazConfig`, used to fill in whatever the config file omits. */
export const defaultConfig: DocsConfig = {
    docs: {
        input: { dir: 'docs' },
        output: { bundle: false, formats: ['html'] },
    },
}

/** Defaults for the build (`input`/`output`) section of `MinimazConfig`, used to fill in whatever the config file omits. */
export const defaultBuildConfig: BuildConfig = {
    input: { dir: './src', mapping: {}, externals: {}, exclude: [] },
    output: {
        dir: './dist',
        replace: {},
        css: { bundling: true, minify: true },
        html: { minify: true },
        js: { bundling: false, minify: true },
    },
}

/** Defaults for the `serve` section of `MinimazConfig`, used to fill in whatever the config file omits. */
export const defaultServeConfig: ServeConfig = {
    serve: {
        port: 0,
        host: '127.0.0.1',
        liveReload: true,
        cleanUrls: false,
        singlePageApp: false,
        directoryListing: false,
        cacheControl: false,
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
    const inputDir = parsed.docs?.input?.dir ?? defaultConfig.docs.input.dir
    const bundle = parsed.docs?.output?.bundle ?? defaultConfig.docs.output.bundle
    const rawFormats = parsed.docs?.output?.formats
    const formats = Array.isArray(rawFormats) ? rawFormats.filter(isOutputFormat) : []

    return {
        docs: {
            input: { dir: inputDir },
            output: {
                bundle,
                formats: formats.length > 0 ? formats : defaultConfig.docs.output.formats,
            },
        },
    }
}

function parseBuildConfig(parsed: RawConfig): BuildConfig {
    const input = parsed.input
    const output = parsed.output

    return {
        input: {
            dir: input?.dir ?? defaultBuildConfig.input.dir,
            mapping: input?.mapping ?? defaultBuildConfig.input.mapping,
            externals: input?.externals ?? defaultBuildConfig.input.externals,
            exclude: input?.exclude ?? defaultBuildConfig.input.exclude,
        },
        output: {
            dir: output?.dir ?? defaultBuildConfig.output.dir,
            replace: output?.replace ?? defaultBuildConfig.output.replace,
            css: {
                bundling: output?.css?.bundling ?? defaultBuildConfig.output.css.bundling,
                minify: output?.css?.minify ?? defaultBuildConfig.output.css.minify,
            },
            html: {
                minify: output?.html?.minify ?? defaultBuildConfig.output.html.minify,
            },
            js: {
                bundling: output?.js?.bundling ?? defaultBuildConfig.output.js.bundling,
                minify: output?.js?.minify ?? defaultBuildConfig.output.js.minify,
            },
        },
    }
}

function parseServeConfig(parsed: RawConfig): ServeConfig {
    const serve = parsed.serve

    return {
        serve: {
            port: serve?.port ?? defaultServeConfig.serve.port,
            host: serve?.host ?? defaultServeConfig.serve.host,
            liveReload: serve?.liveReload ?? defaultServeConfig.serve.liveReload,
            cleanUrls: serve?.cleanUrls ?? defaultServeConfig.serve.cleanUrls,
            singlePageApp: serve?.singlePageApp ?? defaultServeConfig.serve.singlePageApp,
            directoryListing: serve?.directoryListing ?? defaultServeConfig.serve.directoryListing,
            cacheControl: serve?.cacheControl ?? defaultServeConfig.serve.cacheControl,
        },
    }
}

function parseConfig(raw: unknown): MinimazConfig {
    const parsed: RawConfig = typeof raw === 'object' && raw !== null ? raw : {}
    return {
        ...parseDocsConfig(parsed),
        ...parseBuildConfig(parsed),
        ...parseServeConfig(parsed),
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
    const configPath = path.join(cwd, configFileName)
    let raw: string
    try {
        raw = await readFile(configPath, 'utf8')
    } catch {
        throw new ConfigNotFoundError(configPath)
    }
    return parseConfig(parseJson(raw))
}

/** HTML comment inserted between docs pages when they're bundled into a single output file. */
export const bundleSeparator = '\n\n<!-- ============================== -->\n\n'

/** Base filename (without extension) used for a bundled docs output file. */
export const bundleName = 'bundle'

/** Output directory for each docs `OutputFormat`, relative to the configured build output dir. */
export const outputDirs: Record<OutputFormat, string> = {
    html: 'dist/html',
    pdf: 'dist/pdf',
}

/** File extension for each docs `OutputFormat`. */
export const outputExtensions: Record<OutputFormat, string> = {
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
    ServeConfig,
} from './types.js'
