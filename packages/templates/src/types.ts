/**
 * Persistent settings stored at `~/.minimaz/settings.json`.
 */
export interface Settings {
    createdAt: string
    templatesPath: string
    /** Best-effort, write-only; omitted when no absolute global path can be derived. */
    npmGlobalPath?: string
}
