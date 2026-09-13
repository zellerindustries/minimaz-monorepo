/**
 * Minimal shape of a `package.json` this tool reads. Only the fields the
 * bundler actually consumes.
 */
export interface PackageManifest {
    name: string
    main?: string
    bin?: string | Record<string, string>
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
}

/**
 * A single `esbuild` entry point resolved from a package's `main`/`bin`
 * fields: the `src/*.ts` file to bundle, and the exact `dist/*.js` path the
 * bundle must land at (matching what `package.json` already declares).
 */
export interface EntryPoint {
    srcPath: string
    outfile: string
}
