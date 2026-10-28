import { homedir } from 'node:os'
import { isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
    copy,
    dirname,
    getDirElements,
    join,
    outputFile,
    pathExists,
    readJsonFile,
    remove,
} from '@minimaz/core'
import { log } from '@minimaz/logger'
import { InvalidTemplateNameError, TemplateNotFoundError } from './errors.js'
import type { Settings } from './types.js'

/** Names of the templates bundled with this package and seeded on first `config` run. */
export const defaultTemplateNames = ['default', 'simple', 'docs'] as const

/**
 * Best-effort guess at the global npm `node_modules/@minimaz/sitekit`
 * directory (the package that publishes the `minimaz`/`mz` bin), for the
 * write-only `npmGlobalPath` settings field (kept for `minimaz-cli` schema
 * parity; nothing reads it back). Reads `npm_config_prefix` (set by npm on any
 * child process it spawns) rather than shelling out to `npm config get prefix` —
 * this function runs on every `config`/`postinstall`, and spawning npm from
 * there risks the same nested-npm-config-inheritance issues fixed in
 * `executeCommand`.
 *
 * @returns {string | undefined} An absolute guessed path, or `undefined` when no absolute prefix can be derived
 */
function guessNpmGlobalPath(): string | undefined {
    const isWindows = process.platform === 'win32'
    const prefix = process.env['npm_config_prefix']
    const appData = process.env['APPDATA']
    let base: string

    if (prefix !== undefined && prefix !== '') {
        base = isWindows ? prefix : join(prefix, 'lib')
    } else if (isWindows) {
        if (appData === undefined || appData === '') {
            return undefined
        }
        base = join(appData, 'npm')
    } else {
        base = '/usr/local/lib'
    }

    const result = join(base, 'node_modules', '@minimaz', 'sitekit')
    return isAbsolute(result) ? result : undefined
}

/**
 * Rejects template names that would escape the templates directory when
 * joined onto it (empty, `.`/`..`, or containing a path separator).
 *
 * @param {string} name - Template name to validate
 * @throws {InvalidTemplateNameError} If the name is invalid
 */
function assertValidTemplateName(name: string): void {
    if (name === '' || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
        throw new InvalidTemplateNameError(name)
    }
}

/**
 * Resolves the global Minimaz directory (`~/.minimaz`).
 *
 * @returns {string}
 */
export function getGlobalDir(): string {
    return join(homedir(), '.minimaz')
}

/**
 * Resolves the global templates directory given the global dir.
 *
 * @param {string} globalDir - Result of {@link getGlobalDir}
 * @returns {string}
 */
export function getTemplatesDir(globalDir: string): string {
    return join(globalDir, 'templates')
}

/**
 * Resolves a named template's directory, verifying it exists.
 *
 * @param {string} templatesDir - Result of {@link getTemplatesDir}
 * @param {string} name - Template name
 * @returns {Promise<string>}
 * @throws {TemplateNotFoundError} If the template doesn't exist
 */
export async function getTemplatePath(templatesDir: string, name: string): Promise<string> {
    assertValidTemplateName(name)
    const dir = join(templatesDir, name)

    if (!(await pathExists(dir))) {
        throw new TemplateNotFoundError(name)
    }

    return dir
}

/**
 * Creates or updates `<globalDir>/settings.json`. On first creation (or when
 * `overwrite` is true) it writes a fresh file; otherwise it patches in any
 * keys missing from an existing file (forward compatibility) and warns
 * about unrecognized keys, without touching values the caller already set.
 *
 * @param {string} globalDir - Result of {@link getGlobalDir}
 * @param {string} templatesDir - Result of {@link getTemplatesDir}
 * @param {boolean} [overwrite=false] - Replace the file entirely when true
 */
export async function writeSettings(
    globalDir: string,
    templatesDir: string,
    overwrite = false,
): Promise<void> {
    const settingsPath = join(globalDir, 'settings.json')
    const npmGlobalPath = guessNpmGlobalPath()
    const template: Settings = {
        createdAt: new Date().toISOString(),
        templatesPath: templatesDir,
        ...(npmGlobalPath === undefined ? {} : { npmGlobalPath }),
    }

    if (!(await pathExists(settingsPath)) || overwrite) {
        await outputFile(settingsPath, `${JSON.stringify(template, null, 2)}\n`)
        log.success(
            overwrite
                ? `Overwrote settings.json at ${settingsPath}`
                : `Created settings.json at ${settingsPath}`,
        )
        return
    }

    let current: Partial<Settings>

    try {
        current = await readJsonFile<Partial<Settings>>(settingsPath)
    } catch {
        log.warn('Failed to read settings.json, recreating from template')
        await outputFile(settingsPath, `${JSON.stringify(template, null, 2)}\n`)
        return
    }

    let updated = false

    for (const key of Object.keys(template) as (keyof Settings)[]) {
        if (key === 'npmGlobalPath') {
            continue
        }

        if (!(key in current)) {
            current[key] = template[key]
            log.warn(`Added missing key "${key}" to settings.json`)
            updated = true
        }
    }

    for (const key of Object.keys(current)) {
        if (!(key in template) && key !== 'npmGlobalPath') {
            log.warn(`Unknown key "${key}" found in settings.json`)
        }
    }

    if (updated) {
        await outputFile(settingsPath, `${JSON.stringify(current, null, 2)}\n`)
        log.success('Updated settings.json')
    } else {
        log.info('settings.json is valid and up-to-date')
    }
}

/**
 * Seeds every bundled template (`defaultTemplateNames`) into the global templates
 * directory and ensures `settings.json` exists — what the `config` command
 * calls. Safe to call repeatedly: skips templates that already exist
 * unless `overwrite` is true.
 *
 * @param {string} globalDir - Result of {@link getGlobalDir}
 * @param {string} templatesDir - Result of {@link getTemplatesDir}
 * @param {boolean} [overwrite=false] - Replace existing seeded templates and settings
 */
export async function seedDefaults(
    globalDir: string,
    templatesDir: string,
    overwrite = false,
): Promise<void> {
    const seedsDir = join(dirname(fileURLToPath(import.meta.url)), 'seeds')

    if (!(await pathExists(seedsDir))) {
        throw new Error(`Seed templates not found at "${seedsDir}" — run "npm run build" first`)
    }

    for (const name of defaultTemplateNames) {
        const src = join(seedsDir, name)
        const dest = join(templatesDir, name)
        const exists = await pathExists(dest)

        if (exists && !overwrite) {
            log.info(`Template "${name}" already exists, skipping`)
            continue
        }

        await copy(src, dest, overwrite)
        log.success(exists ? `Template "${name}" overwritten` : `Template "${name}" seeded`)
    }

    await writeSettings(globalDir, templatesDir, overwrite)
}

/**
 * Lists the names of every template in the global templates directory.
 *
 * @param {string} templatesDir - Result of {@link getTemplatesDir}
 * @returns {Promise<string[]>}
 */
export async function listTemplates(templatesDir: string): Promise<string[]> {
    return getDirElements(templatesDir)
}

/**
 * Saves a source directory as a new global template.
 *
 * @param {string} templatesDir - Result of {@link getTemplatesDir}
 * @param {string} sourceDir - Directory to copy from
 * @param {string} name - Name to save the template under
 * @param {boolean} overwrite - Replace an existing template with this name
 * @throws {Error} If `name` already exists and `overwrite` is false
 */
export async function saveTemplate(
    templatesDir: string,
    sourceDir: string,
    name: string,
    overwrite: boolean,
): Promise<void> {
    assertValidTemplateName(name)
    const dest = join(templatesDir, name)

    if ((await pathExists(dest)) && !overwrite) {
        throw new Error(`Template "${name}" already exists`)
    }

    await copy(sourceDir, dest, overwrite)
    log.success(`Template saved to ${dest}`)
}

/**
 * Deletes a global template by name.
 *
 * @param {string} templatesDir - Result of {@link getTemplatesDir}
 * @param {string} name - Template name to delete
 * @throws {TemplateNotFoundError} If the template doesn't exist
 */
export async function deleteTemplate(templatesDir: string, name: string): Promise<void> {
    const target = await getTemplatePath(templatesDir, name)

    await remove(target)
    log.success(`Template "${name}" deleted`)
}

/**
 * Replaces an existing named template's contents with a source directory.
 *
 * @param {string} templatesDir - Result of {@link getTemplatesDir}
 * @param {string} name - Existing template name to update
 * @param {string} sourceDir - Directory to copy from
 * @throws {TemplateNotFoundError} If `name` doesn't already exist
 */
export async function updateTemplateFrom(
    templatesDir: string,
    name: string,
    sourceDir: string,
): Promise<void> {
    const target = await getTemplatePath(templatesDir, name)

    await copy(sourceDir, target, true)
    log.success(`Template "${name}" updated`)
}
