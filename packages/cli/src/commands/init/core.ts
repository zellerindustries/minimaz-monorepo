import { join, outputFile } from '@minimaz/core'
import { log } from '@minimaz/logger'
import { askQuestion, executeCommand } from '../../cli/index.js'
import { createPkgTemplate, GITIGNORE_TEMPLATE } from './constants.js'

/**
 * Writes `package.json` and runs `npm install` in the target directory.
 *
 * @param {string} targetDir - Project directory
 * @param {string} projectName - Name to write into `package.json`
 */
export async function initNpm(targetDir: string, projectName: string): Promise<void> {
    log.info('npm: initializing')
    await outputFile(
        join(targetDir, 'package.json'),
        `${JSON.stringify(createPkgTemplate(projectName), null, 2)}\n`,
    )
    await executeCommand('npm', ['i'], targetDir)
}

/**
 * Creates or connects a remote Git repository. Does not create commits.
 *
 * @param {string} repoName - Repository name
 * @param {string} targetDir - Local repository directory
 * @param {string} provider - "local" | "github" | "gitlab" | an existing remote URL
 */
async function linkRemoteRepo(
    repoName: string,
    targetDir: string,
    provider: string,
): Promise<void> {
    const remoteName = 'origin'

    if (provider === 'local') {
        log.info('Using local Git repository')
        return
    }

    if (/^https?:\/\//.test(provider) || provider.startsWith('git@')) {
        log.info(`Connecting existing remote "${provider}"`)
        await executeCommand('git', ['remote', 'add', remoteName, provider], targetDir)
        return
    }

    if (provider === 'github') {
        log.info(`Creating GitHub repository "${repoName}"`)
        await executeCommand(
            'gh',
            ['repo', 'create', repoName, '--private', '--source=.', '--remote', remoteName],
            targetDir,
        )
        return
    }

    if (provider === 'gitlab') {
        log.info(`Creating GitLab repository "${repoName}"`)

        const gitlabUser = process.env['GITLAB_USER']
        if (!gitlabUser) {
            throw new Error('GITLAB_USER not set')
        }

        await executeCommand('glab', ['repo', 'create', repoName, '--source=.'], targetDir)
        await executeCommand(
            'git',
            ['remote', 'add', remoteName, `git@gitlab.com:${gitlabUser}/${repoName}.git`],
            targetDir,
        )
        return
    }

    throw new Error(`Unsupported git provider or remote: "${provider}"`)
}

/**
 * Initializes a Git repository in the target directory, optionally linking
 * a remote, and writes `.gitignore`.
 *
 * @param {string} projectName - Project name (used as the remote repo name)
 * @param {string} targetDir - Directory to initialize Git in
 * @param {string} [provider] - "local" | "github" | "gitlab" | a remote URL; asked interactively if omitted
 */
export async function initGit(
    projectName: string,
    targetDir: string,
    provider?: string,
): Promise<void> {
    const resolvedProvider =
        provider ??
        (
            await askQuestion(
                'Select a provider or paste a url to connect your existing repo (cli tools needed) [LOCAL/github/gitlab]:',
                'local',
            )
        )
            .toLowerCase()
            .trim()

    log.info('Initializing Git repository')
    await executeCommand('git', ['init'], targetDir)

    if (resolvedProvider && resolvedProvider !== 'local') {
        await linkRemoteRepo(projectName, targetDir, resolvedProvider)
    } else {
        log.info('Git repository initialized locally')
    }

    await outputFile(join(targetDir, '.gitignore'), GITIGNORE_TEMPLATE)
    log.success('Git repository initialized')
}
