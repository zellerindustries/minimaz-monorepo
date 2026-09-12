import { seedDefaults } from '@minimaz/templates'

/**
 * Seeds (or re-seeds) the global `~/.minimaz` directory with default
 * templates and settings.
 *
 * @param {string} globalDir - Global Minimaz directory
 * @param {string} templatesDir - Global templates directory
 * @param {boolean} overwrite - Replace existing seeded templates/settings when true
 */
export async function config(
    globalDir: string,
    templatesDir: string,
    overwrite: boolean,
): Promise<void> {
    await seedDefaults(globalDir, templatesDir, overwrite)
}
