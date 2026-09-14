/**
 * Options for {@link startLocalServer}.
 */
export interface LocalServerOptions {
    /** The directory to serve. Must exist and be a directory. */
    dir: string
    /** Port to bind. Defaults to 0 (an OS-assigned ephemeral port). */
    port?: number
    /** Host to bind. Defaults to "127.0.0.1". */
    host?: string
    /** Injects a live-reload script into HTML responses and watches `dir` for changes. Defaults to true. */
    liveReload?: boolean
}

/**
 * A running local server, returned by {@link startLocalServer}.
 */
export interface LocalServerHandle {
    /** The server's base URL, e.g. "http://127.0.0.1:53241". */
    url: string
    /** The bound port (resolved even when `options.port` was 0 or omitted). */
    port: number
    /**
     * Stops the HTTP server and the file watcher (if any). Safe to call
     * more than once.
     *
     * @returns {Promise<void>} Resolves once the server has fully closed
     */
    close(): Promise<void>
}
