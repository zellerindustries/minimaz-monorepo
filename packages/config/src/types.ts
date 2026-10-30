/** Output format the `docs` command can render to. */
export type OutputFormat = 'html' | 'pdf'

export interface DocsInputConfig {
    dir: string
}

export interface DocsOutputConfig {
    bundle: boolean
    formats: OutputFormat[]
}

/** The `docs` section of `minimaz.config.json`, defaulted by `parseDocsConfig`/`defaultConfig`. */
export interface DocsConfig {
    docs: {
        input: DocsInputConfig
        output: DocsOutputConfig
    }
}

/** Bundling/minify toggle shared by the CSS and JS build-output options. */
export interface BuildBundleOptions {
    bundling: boolean
    minify: boolean
}

export interface BuildInputConfig {
    dir: string
    mapping: Record<string, string>
    externals: Record<string, string>
    exclude: string[]
}

export interface BuildOutputConfig {
    dir: string
    replace: Record<string, string>
    css: BuildBundleOptions
    html: { minify: boolean }
    js: BuildBundleOptions
}

/** The build (`input`/`output`) section of `minimaz.config.json`, defaulted by `parseBuildConfig`/`defaultBuildConfig`. */
export interface BuildConfig {
    input: BuildInputConfig
    output: BuildOutputConfig
}

/** The `serve` section of `minimaz.config.json`, defaulted by `parseServeConfig`/`defaultServeConfig`. */
export interface ServeConfig {
    serve: {
        port: number
        /** True when `port` fell back to the default because the config file did not set it. */
        portDefaulted: boolean
        host: string
        liveReload: boolean
        cleanUrls: boolean
        singlePageApp: boolean
        directoryListing: boolean
        cacheControl: boolean
    }
}

/** Full config shape `loadConfig` returns: `docs`, build, and `serve` sections are all always present, independently defaulted. */
export interface MinimazConfig extends DocsConfig, BuildConfig, ServeConfig {}

/** Shape of the untrusted JSON parsed from `minimaz.config.json`, before defaults are filled in and validated. */
export interface RawConfig {
    docs?: {
        input?: { dir?: string }
        output?: { bundle?: boolean; formats?: string[] }
    }
    input?: {
        dir?: string
        mapping?: Record<string, string>
        externals?: Record<string, string>
        exclude?: string[]
    }
    output?: {
        dir?: string
        replace?: Record<string, string>
        css?: { bundling?: boolean; minify?: boolean }
        html?: { minify?: boolean }
        js?: { bundling?: boolean; minify?: boolean }
    }
    serve?: {
        port?: number
        host?: string
        liveReload?: boolean
        cleanUrls?: boolean
        singlePageApp?: boolean
        directoryListing?: boolean
        cacheControl?: boolean
    }
}
