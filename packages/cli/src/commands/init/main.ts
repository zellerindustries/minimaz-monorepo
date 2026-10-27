import { defaultBuildConfig } from '@minimaz/config'
import type { BuildConfig } from '@minimaz/config'
import { copy, join, outputFile, pathExists } from '@minimaz/core'
import { KnownError, log } from '@minimaz/logger'
import { getTemplatePath } from '@minimaz/templates'
import { askYesNo } from '../prompts.js'
import { initGit, initNpm } from './core.js'
import type { InitCommandOptions } from './types.js'

// The build defaults, with `mapping` prefilled so a new project sees the folders it can remap.
const minimazConfigTemplate: BuildConfig = {
    ...defaultBuildConfig,
    input: {
        ...defaultBuildConfig.input,
        mapping: { pages: '', scripts: '', styles: '', public: '' },
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
 * @throws {KnownError} If `targetDir` already exists
 * @throws {KnownError} If the npm/git step fails; the project is left in `targetDir`
 */
export async function init(
    projectName: string,
    options: InitCommandOptions,
    targetDir: string,
    templatesDir: string,
): Promise<void> {
    if (await pathExists(targetDir)) {
        throw new KnownError(`Target directory "${targetDir}" already exists`)
    }

    const templateDir = await getTemplatePath(templatesDir, options.template)

    log.debug(`Copying template from "${templateDir}" to "${targetDir}"`)
    await copy(templateDir, targetDir)

    const configPath = join(targetDir, 'minimaz.config.json')
    if (!(await pathExists(configPath))) {
        log.debug('Initializing minimaz.config.json')
        await outputFile(configPath, `${JSON.stringify(minimazConfigTemplate, null, 2)}\n`)
    }

    try {
        const useNpm = options.npm ?? (await askYesNo('Init NPM? [Y/n]:', 'y'))
        if (useNpm) {
            await initNpm(targetDir, projectName)
        }

        const useGit = options.git ?? (await askYesNo('Init Git repository? [Y/n]:', 'y'))
        if (useGit) {
            await initGit(projectName, targetDir, options.gitprovider)
        }
    } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : String(error)
        throw new KnownError(
            `${reason}
Project left in ${targetDir}; fix the problem and run the failed step manually (npm i / git init)`,
            { cause: error },
        )
    }

    log.success(`Project "${projectName}" created using template "${options.template}"`)
}
