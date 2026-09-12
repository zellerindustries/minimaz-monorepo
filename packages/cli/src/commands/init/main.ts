import { copy, join, outputFile, pathExists, remove } from '@minimaz/core'
import { log } from '@minimaz/logger'
import { getTemplatePath } from '@minimaz/templates'
import { askQuestion } from '../../cli/index.js'
import { initGit, initNpm } from './core.js'
import type { InitCommandOptions } from './types.js'

const MINIMAZ_CONFIG_TEMPLATE = {
    input: {
        dir: './src',
        mapping: { pages: '', scripts: '', styles: '', public: '' },
        externals: {},
        exclude: [],
    },
    output: {
        dir: './dist',
        replace: {},
        css: { bundling: true, minify: true },
        html: { minify: true },
        js: { bundling: true, minify: true },
    },
}

/**
 * Scaffolds a new project: copies the chosen template, writes
 * `minimaz.config.json`, and optionally runs `npm install` / `git init`.
 *
 * @param {string} projectName - Name of the project (used for `package.json` and remote repo naming)
 * @param {InitCommandOptions} options - Parsed CLI flags
 * @param {string} targetDir - Already-resolved directory to create the project in
 * @param {string} templatesDir - Already-resolved global templates directory
 * @throws {Error} If `targetDir` already exists
 */
export async function init(
    projectName: string,
    options: InitCommandOptions,
    targetDir: string,
    templatesDir: string,
): Promise<void> {
    if (await pathExists(targetDir)) {
        throw new Error(`Target directory "${targetDir}" already exists`)
    }

    const templateDir = await getTemplatePath(templatesDir, options.template)

    log.debug(`Copying template from "${templateDir}" to "${targetDir}"`)
    await copy(templateDir, targetDir)

    const configPath = join(targetDir, 'minimaz.config.json')
    if (!(await pathExists(configPath))) {
        log.debug('Initializing minimaz.config.json')
        await outputFile(configPath, `${JSON.stringify(MINIMAZ_CONFIG_TEMPLATE, null, 2)}\n`)
    }

    try {
        const useNpm =
            options.npm ??
            (await askQuestion('Init NPM? [Y/n]:', 'y')).toLowerCase().startsWith('y')
        if (useNpm) {
            await initNpm(targetDir, projectName)
        }

        const useGit =
            options.git ??
            (await askQuestion('Init Git repository? [Y/n]:', 'y')).toLowerCase().startsWith('y')
        if (useGit) {
            await initGit(projectName, targetDir, options.gitprovider)
        }
    } catch (error) {
        // Roll back the partially-scaffolded directory so a failed npm/git step
        // doesn't leave a half-created project behind for the user to clean up.
        await remove(targetDir)
        throw error
    }

    log.success(`Project "${projectName}" created using template "${options.template}"`)
}
