import { KnownError } from '@minimaz/errors'

/**
 * Thrown by {@link getTemplatePath} when the named template doesn't exist
 * under the global templates directory.
 */
export class TemplateNotFoundError extends KnownError {
    constructor(name: string) {
        super(`Template "${name}" not found. Run "minimaz config" to seed default templates.`)
        this.name = 'TemplateNotFoundError'
    }
}

/**
 * Thrown when a template name fails validation (empty, `.`/`..`, or
 * contains a path separator) before it's joined onto the templates
 * directory, to prevent path traversal outside `~/.minimaz/templates`.
 */
export class InvalidTemplateNameError extends KnownError {
    constructor(name: string) {
        super(`Invalid template name: "${name}"`)
        this.name = 'InvalidTemplateNameError'
    }
}
