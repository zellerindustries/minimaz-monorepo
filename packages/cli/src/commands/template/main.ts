import { basename, join, pathExists } from '@minimaz/core'
import { KnownError, log } from '@minimaz/logger'
import {
    deleteTemplate,
    listTemplates,
    saveTemplate,
    seedDefaults,
    updateTemplateFrom,
} from '@minimaz/templates'
import { askQuestion } from '../../cli/index.js'
import type { TemplateCommandOptions } from './types.js'

/**
 * Handles the `template` command: list, save, delete, or update global
 * templates. `list`/`delete`/`update`/default-save are mutually exclusive.
 *
 * @param {string} globalDir - Global Minimaz directory
 * @param {string} templatesDir - Global templates directory
 * @param {TemplateCommandOptions} options - Parsed CLI flags
 * @param {string} sourcePath - Already-resolved current/target directory
 */
export async function template(
    globalDir: string,
    templatesDir: string,
    options: TemplateCommandOptions,
    sourcePath: string,
): Promise<void> {
    if (options.list === true) {
        const names = await listTemplates(templatesDir)

        if (names.length === 0) {
            log.info('No global templates available')
            return
        }

        log.info('Available global templates:')
        for (const name of names) {
            log.default(name)
        }
        return
    }

    if (options.delete !== undefined && options.delete !== '') {
        const name = options.delete
        const confirmed = (await askQuestion(`Confirm delete "${name}"? [y/N]:`, 'n'))
            .toLowerCase()
            .startsWith('y')

        if (!confirmed) {
            log.info('Delete cancelled')
            return
        }

        await deleteTemplate(templatesDir, name)
        return
    }

    if (options.update !== undefined && options.update !== false && options.update !== '') {
        if (typeof options.update === 'string' && options.update.trim() !== '') {
            const name = options.update.trim()
            const confirmed = (
                await askQuestion(`Update "${name}" with current directory? [Y/n]:`, 'y')
            )
                .toLowerCase()
                .startsWith('y')

            if (!confirmed) {
                log.info('Update cancelled')
                return
            }

            await updateTemplateFrom(templatesDir, name, sourcePath)
            return
        }

        const confirmed = (
            await askQuestion('Update local templates, overwriting them with defaults? [Y/n]:', 'y')
        )
            .toLowerCase()
            .startsWith('y')

        if (!confirmed) {
            log.info('Update cancelled')
            return
        }

        await seedDefaults(globalDir, templatesDir, true)
        return
    }

    // Default action: save sourcePath as a new template.
    let source = sourcePath

    if (!(await pathExists(source))) {
        log.warn(`Not found: ${source}`)
        const useCwd = (await askQuestion('Use current directory? [Y/n]:', 'y'))
            .toLowerCase()
            .startsWith('y')

        if (!useCwd) {
            throw new KnownError('Operation cancelled')
        }

        source = process.env['CLI_WORKDIR'] ?? process.cwd()
    }

    const name = basename(source)
    const dest = join(templatesDir, name)
    let overwrite = true

    if (await pathExists(dest)) {
        overwrite = (await askQuestion(`Template "${name}" exists. Overwrite? [y/N]:`, 'n'))
            .toLowerCase()
            .startsWith('y')

        if (!overwrite) {
            log.info('Save cancelled')
            return
        }
    }

    await saveTemplate(templatesDir, source, name, overwrite)
}
