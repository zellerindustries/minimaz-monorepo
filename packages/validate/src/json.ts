import { ValidationError } from './errors.js'

/**
 * Thrown by {@link validateJson} — carries the single parse error found.
 */
export class JsonValidationError extends ValidationError {
    constructor(errors: string[]) {
        super('JsonValidationError', 'JSON validation error', errors)
    }
}

/**
 * Validates JSON syntax via `JSON.parse`.
 *
 * @param {string} code - JSON source to validate
 * @throws {JsonValidationError} If the source has a syntax error
 */
export function validateJson(code: string): void {
    if (typeof code !== 'string') {
        throw new JsonValidationError(['code must be a string'])
    }

    try {
        JSON.parse(code)
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        throw new JsonValidationError([message])
    }
}
