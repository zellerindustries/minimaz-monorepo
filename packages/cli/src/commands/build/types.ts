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
