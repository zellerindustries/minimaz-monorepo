export type OutputFormat = "html" | "pdf";

export interface DocsInputConfig {
    dir: string;
}

export interface DocsOutputConfig {
    bundle: boolean;
    formats: OutputFormat[];
}

export interface DocsConfig {
    docs: {
        input: DocsInputConfig;
        output: DocsOutputConfig;
    };
}

export interface BuildBundleOptions {
    bundling: boolean;
    minify: boolean;
}

export interface BuildInputConfig {
    dir: string;
    mapping: Record<string, string>;
    externals: Record<string, string>;
    exclude: string[];
}

export interface BuildOutputConfig {
    dir: string;
    replace: Record<string, string>;
    css: BuildBundleOptions;
    html: { minify: boolean };
    js: BuildBundleOptions;
}

export interface BuildConfig {
    input: BuildInputConfig;
    output: BuildOutputConfig;
}

export interface MinimazConfig extends DocsConfig, BuildConfig {}

/** Shape of the untrusted JSON parsed from `minimaz.config.json`, before defaults are filled in and validated. */
export interface RawConfig {
    docs?: {
        input?: { dir?: string };
        output?: { bundle?: boolean; formats?: string[] };
    };
    input?: {
        dir?: string;
        mapping?: Record<string, string>;
        externals?: Record<string, string>;
        exclude?: string[];
    };
    output?: {
        dir?: string;
        replace?: Record<string, string>;
        css?: { bundling?: boolean; minify?: boolean };
        html?: { minify?: boolean };
        js?: { bundling?: boolean; minify?: boolean };
    };
}
