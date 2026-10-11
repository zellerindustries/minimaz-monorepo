/**
 * A single file being processed by the `build` command: its source path,
 * destination path, already-read (and replacement-applied, where
 * applicable) content, and lowercased extension.
 */
export interface File {
    src: string
    dest: string
    content: string
    ext: string
}

/**
 * A CSS entry's resolved `@import` bundle, as returned by `bundleCss`.
 */
export interface CssBundleResult {
    code: string
    inputs: string[]
}

/**
 * Caches `bundleCss` results by resolved entry path, so the discovery
 * pass's bundle (needed for `inputs`, to populate `ignoredFiles`) can be
 * reused by the processing pass (needed for `code`) instead of resolving
 * and reading the same `@import` graph from disk twice per entry.
 */
export type CssBundleCache = Map<string, CssBundleResult>

/**
 * Renames a directory, `fs.promises.rename`-shaped. Injectable so tests can
 * simulate Windows' transient EPERM/EACCES/EBUSY rename failures.
 */
export type RenameDir = (from: string, to: string) => Promise<void>

/**
 * Options for `replaceOutDir`.
 */
export interface ReplaceOutDirOptions {
    /** Rename implementation (default: `fs.promises.rename`) */
    renameDir?: RenameDir
    /** Base backoff between retries of a transiently failing rename, in ms (default: 100) */
    retryDelayMs?: number
}
