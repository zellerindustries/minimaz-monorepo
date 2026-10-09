import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { loadConfig } from '@minimaz/config'
import { pathExists } from '@minimaz/core'
import { KnownError } from '@minimaz/logger'
import { seedDefaults } from '@minimaz/templates'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { init } from '../main.js'

describe('init', () => {
    let root: string
    let templatesDir: string
    let targetDir: string

    beforeEach(async () => {
        root = await mkdtemp(path.join(tmpdir(), 'site-builder-init-'))
        templatesDir = path.join(root, 'templates')
        await mkdir(path.join(templatesDir, 'simple'), { recursive: true })
        await writeFile(path.join(templatesDir, 'simple', 'index.html'), '<html></html>')
        targetDir = path.join(root, 'my-project')
    })

    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })

    it('copies the chosen template and writes minimaz.config.json, with npm/git disabled', async () => {
        await init(
            'my-project',
            { template: 'simple', npm: false, git: false },
            targetDir,
            templatesDir,
        )

        const html = await readFile(path.join(targetDir, 'index.html'), 'utf8')
        expect(html).toBe('<html></html>')

        const config = await readFile(path.join(targetDir, 'minimaz.config.json'), 'utf8')
        const parsed = JSON.parse(config) as {
            input: unknown
            output: { js: { bundling: boolean } }
        }
        expect(parsed).toHaveProperty('input')
        // build throws a KnownError when output.js.bundling is true (JS/TS
        // import-graph bundling isn't implemented yet) - a freshly scaffolded
        // project must be buildable out of the box.
        expect(parsed.output.js.bundling).toBe(false)
    })

    it('throws when the target directory already exists', async () => {
        await mkdir(targetDir, { recursive: true })

        const result = init(
            'my-project',
            { template: 'simple', npm: false, git: false },
            targetDir,
            templatesDir,
        )
        await expect(result).rejects.toBeInstanceOf(KnownError)
        await expect(result).rejects.toThrow('already exists')
    })

    it('does not overwrite an existing minimaz.config.json', async () => {
        const templateCustomConfig = {
            custom: true,
            externals: { mylib: 'path' },
        }
        await writeFile(
            path.join(templatesDir, 'simple', 'minimaz.config.json'),
            JSON.stringify(templateCustomConfig),
        )

        await init(
            'my-project',
            { template: 'simple', npm: false, git: false },
            targetDir,
            templatesDir,
        )

        const config = await readFile(path.join(targetDir, 'minimaz.config.json'), 'utf8')
        expect(JSON.parse(config)).toEqual(templateCustomConfig)
    })

    it('leaves the scaffolded targetDir in place when git init fails', async () => {
        await expect(
            init(
                'my-project',
                {
                    template: 'simple',
                    npm: false,
                    git: true,
                    gitprovider: 'not-a-real-provider',
                },
                targetDir,
                templatesDir,
            ),
        ).rejects.toThrow('Unsupported git provider')

        // Matches minimaz-cli: a failed npm/git step doesn't wipe the
        // already-copied template (and any already-completed npm install),
        // leaving it for the user to fix manually instead of silently
        // deleting their work.
        expect(await pathExists(targetDir)).toBe(true)
    })

    it('names the left-behind directory and chains the original error when a step fails', async () => {
        const error = await init(
            'my-project',
            { template: 'simple', npm: false, git: true, gitprovider: 'not-a-real-provider' },
            targetDir,
            templatesDir,
        ).catch((caught: unknown) => caught)

        expect(error).toBeInstanceOf(Error)
        const failure = error as Error
        expect(failure.message).toContain(targetDir)
        expect(failure.message).toContain('left')
        expect(failure.cause).toBeInstanceOf(Error)
    })
})

describe('init with the seeded default template', () => {
    let root: string

    beforeEach(async () => {
        root = await mkdtemp(path.join(tmpdir(), 'site-builder-init-seed-'))
    })

    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })

    it('produces a config that passes the build bundling guard', async () => {
        const templatesDir = path.join(root, 'templates')
        const targetDir = path.join(root, 'my-project')
        await seedDefaults(root, templatesDir)

        await init(
            'my-project',
            { template: 'default', npm: false, git: false },
            targetDir,
            templatesDir,
        )

        const config = await loadConfig(targetDir)
        // build() throws a KnownError when output.js.bundling is true.
        expect(config.output.js.bundling).toBe(false)
    })
})
