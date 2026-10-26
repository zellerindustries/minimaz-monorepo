/**
 * Thrown by `@minimaz/bundler` for user-facing resolution failures (an
 * unresolvable relative import, an unsupported dynamic import). A distinct
 * class lets callers translate these into their own error type without this
 * package depending on a logger.
 */
export class BundlerError extends Error {
    public constructor(message: string) {
        super(message)
        this.name = 'BundlerError'
    }
}
