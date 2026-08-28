/**
 * Base for this package's per-format validation errors — carries every
 * problem found, not just the first.
 */
export class ValidationError extends Error {
    errors: string[];

    constructor(name: string, message: string, errors: string[]) {
        super(message);
        this.name = name;
        this.errors = errors;
    }
}
