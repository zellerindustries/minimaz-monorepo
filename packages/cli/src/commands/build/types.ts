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
