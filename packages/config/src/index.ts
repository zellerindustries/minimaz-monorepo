import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { KnownError, log } from '@minimaz/logger'
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
        port: 4173,
        portDefaulted: true,
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
     * @param {string} [initCommand] - Command that scaffolds a config for the caller (e.g.
     *   `minimaz init`); appended as a hint when given.
     */
    constructor(configPath: string, initCommand?: string) {
        const hint = initCommand === undefined ? '' : ` Run "${initCommand}" first.`
        super(`No config file found at ${configPath}.${hint}`)
        this.name = 'ConfigNotFoundError'
    }
}

/** Thrown by `loadConfig` when `minimaz.config.json` exists but can't be read (e.g. `EISDIR`, `EACCES`). */
export class ConfigReadError extends KnownError {
    /**
     * @param {string} configPath - Absolute path of the config file that failed to read.
     * @param {unknown} cause - The underlying filesystem error.
     */
    constructor(configPath: string, cause: unknown) {
        const reason = cause instanceof Error ? cause.message : String(cause)
        super(`Could not read config file at ${configPath}: ${reason}`, { cause })
        this.name = 'ConfigReadError'
    }
}

/** Thrown by `loadConfig` when `minimaz.config.json` has wrongly-typed fields; lists every one in `errors`. */
export class ConfigValidationError extends KnownError {
    errors: string[]

    /**
     * @param {string} configPath - Absolute path of the invalid config file.
     * @param {string[]} errors - One message per invalid field.
     */
    constructor(configPath: string, errors: string[]) {
        super(`Invalid config file at ${configPath} (${String(errors.length)} error(s)):`)
        this.name = 'ConfigValidationError'
        this.errors = errors
    }
}

/** Options for {@link loadConfig}. */
export interface LoadConfigOptions {
    /** Command that scaffolds a config for this caller, shown as a hint when the file is missing. */
    initCommand?: string
}

type FieldRule = 'boolean' | 'port' | 'string' | 'stringArray' | 'stringRecord' | FieldSchema

interface FieldSchema {
    readonly [key: string]: FieldRule
}

const configSchema = {
    docs: {
        input: { dir: 'string' },
        output: { bundle: 'boolean', formats: 'stringArray' },
    },
    input: {
        dir: 'string',
        mapping: 'stringRecord',
        externals: 'stringRecord',
        exclude: 'stringArray',
    },
    output: {
        dir: 'string',
        replace: 'stringRecord',
        css: { bundling: 'boolean', minify: 'boolean' },
        html: { minify: 'boolean' },
        js: { bundling: 'boolean', minify: 'boolean' },
    },
    serve: {
        port: 'port',
        host: 'string',
        liveReload: 'boolean',
        cleanUrls: 'boolean',
        singlePageApp: 'boolean',
        directoryListing: 'boolean',
        cacheControl: 'boolean',
    },
} as const satisfies FieldSchema

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function describeType(value: unknown): string {
    if (value === null) {
        return 'null'
    }
    return Array.isArray(value) ? 'array' : typeof value
}

function checkRule(value: unknown, rule: Exclude<FieldRule, FieldSchema>): string | null {
    switch (rule) {
        case 'boolean':
            return typeof value === 'boolean' ? null : 'must be a boolean'
        case 'string':
            return typeof value === 'string' ? null : 'must be a string'
        case 'port':
            return typeof value === 'number' &&
                Number.isInteger(value) &&
                value >= 0 &&
                value <= 65535
                ? null
                : 'must be an integer port between 0 and 65535'
        case 'stringArray':
            return Array.isArray(value) && value.every((item) => typeof item === 'string')
                ? null
                : 'must be an array of strings'
        case 'stringRecord':
            return isRecord(value) && Object.values(value).every((item) => typeof item === 'string')
                ? null
                : 'must be an object of string values'
    }
}

function validateFields(
    value: Record<string, unknown>,
    schema: FieldSchema,
    prefix: string,
    errors: string[],
    unknownKeys: string[],
): void {
    for (const key of Object.keys(value)) {
        if (!Object.hasOwn(schema, key)) {
            unknownKeys.push(`${prefix}${key}`)
        }
    }

    for (const [key, rule] of Object.entries(schema)) {
        const field = value[key]
        const fieldPath = `${prefix}${key}`
        // An explicit null means "unset", as it always did: the parse* functions' `?.`/`??` default it.
        if (field === undefined || field === null) {
            continue
        }
        if (typeof rule === 'object') {
            if (!isRecord(field)) {
                errors.push(`"${fieldPath}" must be an object (got ${describeType(field)})`)
                continue
            }
            validateFields(field, rule, `${fieldPath}.`, errors, unknownKeys)
            continue
        }
        const problem = checkRule(field, rule)
        if (problem !== null) {
            errors.push(`"${fieldPath}" ${problem} (got ${describeType(field)})`)
        }
    }
}

/*
Type-checks the untrusted parsed JSON against `configSchema`, collecting every
bad field before throwing once. Unknown keys only warn (matching minimaz-cli),
so a config carrying extra keys like `$schema` still loads.
*/
function validateRawConfig(raw: unknown, configPath: string): RawConfig {
    if (!isRecord(raw)) {
        throw new ConfigValidationError(configPath, [
            `the config root must be an object (got ${describeType(raw)})`,
        ])
    }

    const errors: string[] = []
    const unknownKeys: string[] = []
    validateFields(raw, configSchema, '', errors, unknownKeys)

    if (errors.length > 0) {
        throw new ConfigValidationError(configPath, errors)
    }

    for (const key of unknownKeys) {
        log.warn(`Unknown key "${key}" in ${configPath} — ignored.`)
    }

    // Sound only because validateFields above has type-checked every RawConfig field.
    return raw
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
            portDefaulted: typeof serve?.port !== 'number',
            host: serve?.host ?? defaultServeConfig.serve.host,
            liveReload: serve?.liveReload ?? defaultServeConfig.serve.liveReload,
            cleanUrls: serve?.cleanUrls ?? defaultServeConfig.serve.cleanUrls,
            singlePageApp: serve?.singlePageApp ?? defaultServeConfig.serve.singlePageApp,
            directoryListing: serve?.directoryListing ?? defaultServeConfig.serve.directoryListing,
            cacheControl: serve?.cacheControl ?? defaultServeConfig.serve.cacheControl,
        },
    }
}

function parseConfig(parsed: RawConfig): MinimazConfig {
    return {
        ...parseDocsConfig(parsed),
        ...parseBuildConfig(parsed),
        ...parseServeConfig(parsed),
    }
}

function isMissingFileError(error: unknown): boolean {
    if (!(error instanceof Error) || !('code' in error)) {
        return false
    }
    return error.code === 'ENOENT' || error.code === 'ENOTDIR'
}

/**
 * Reads `minimaz.config.json` from `cwd`, type-checks it, and fills in defaults for missing
 * fields in the `docs`, build (`input`/`output`) and `serve` sections independently — all are
 * always present in the result regardless of which sections the file provided. Unknown keys are
 * logged as warnings and ignored.
 *
 * @param {string} cwd - Directory to look for `minimaz.config.json` in.
 * @param {LoadConfigOptions} [options] - `initCommand` adds a "Run ... first." hint to a
 *   `ConfigNotFoundError`.
 * @returns {Promise<MinimazConfig>} The parsed config with defaults filled in.
 * @throws {ConfigNotFoundError} When `minimaz.config.json` does not exist in `cwd`.
 * @throws {ConfigReadError} When the file exists but can't be read (e.g. it's a directory).
 * @throws {ConfigValidationError} When any field has the wrong type; lists every bad field.
 */
export async function loadConfig(
    cwd: string,
    options: LoadConfigOptions = {},
): Promise<MinimazConfig> {
    const configPath = path.join(cwd, configFileName)
    let raw: string
    try {
        raw = await readFile(configPath, 'utf8')
    } catch (error: unknown) {
        if (isMissingFileError(error)) {
            throw new ConfigNotFoundError(configPath, options.initCommand)
        }
        throw new ConfigReadError(configPath, error)
    }
    return parseConfig(validateRawConfig(parseJson(raw), configPath))
}

/**
 * Markdown thematic break inserted between docs pages when they're bundled into a single
 * output file — renders as `<hr />` in HTML and a rule in PDF. (@minimaz/markdown has no
 * raw-HTML support, so an HTML comment here would render as visible text.)
 */
export const bundleSeparator = '\n\n---\n\n'

/** Base filename (without extension) used for a bundled docs output file. */
export const bundleName = 'bundle'

/**
 * Derives the docs output directory for each `OutputFormat` from the build `output.dir`. Docs go
 * to a sibling `<output.dir>-docs/` directory, never inside `output.dir` itself, because `build`
 * and `clear` wipe `output.dir` wholesale.
 *
 * @param {string} buildOutputDir - The build `output.dir` (relative to the project, or absolute).
 * @returns {Record<OutputFormat, string>} Forward-slash paths, e.g. `out-docs/html` for `./out`.
 * @throws {KnownError} When `buildOutputDir` has no directory name to derive a sibling from
 *   (`.`, `..`, a filesystem root).
 */
export function resolveDocsOutputDirs(buildOutputDir: string): Record<OutputFormat, string> {
    const normalized = path.posix.normalize(buildOutputDir.replaceAll('\\', '/'))
    const name = path.posix.basename(normalized)
    if (name === '' || name === '.' || name === '..' || /^[A-Za-z]:$/.test(name)) {
        throw new KnownError(
            `Cannot derive a docs output directory from output.dir "${buildOutputDir}": it has no directory name.`,
        )
    }
    const docsDir = path.posix.join(path.posix.dirname(normalized), `${name}-docs`)
    return {
        html: `${docsDir}/html`,
        pdf: `${docsDir}/pdf`,
    }
}

/**
 * Docs output directory for each `OutputFormat` under the default build `output.dir` (`./dist`):
 * `dist-docs/html` and `dist-docs/pdf`. Use {@link resolveDocsOutputDirs} for a configured
 * `output.dir`.
 */
export const outputDirs: Record<OutputFormat, string> = resolveDocsOutputDirs(
    defaultBuildConfig.output.dir,
)

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
