import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { pathExists } from '@minimaz/core'
import { log } from '@minimaz/logger'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    deleteTemplate,
    getGlobalDir,
    getTemplatePath,
    getTemplatesDir,
    listTemplates,
    saveTemplate,
    seedDefaults,
    updateTemplateFrom,
    writeSettings,
} from '../core.js'
import type * as MinimazCore from '@minimaz/core'
import type { Settings } from '../types.js'

// Pass-through wrapper so one test can make the seeds-directory check fail; every other call
// (restoreMocks resets the wrapper to its original implementation) hits the real function.
vi.mock('@minimaz/core', async (importOriginal) => {
    const actual = await importOriginal<typeof MinimazCore>()
    return { ...actual, pathExists: vi.fn(actual.pathExists) }
})

describe('getGlobalDir', () => {
    it('resolves to ~/.minimaz', () => {
        expect(getGlobalDir()).toBe(path.join(homedir(), '.minimaz'))
    })
})

describe('getTemplatesDir', () => {
    it('resolves to <globalDir>/templates', () => {
        expect(getTemplatesDir('/some/global/dir')).toBe(path.join('/some/global/dir', 'templates'))
    })
})

describe('getTemplatePath', () => {
    let dir: string

    beforeEach(async () => {
        dir = await mkdtemp(path.join(tmpdir(), 'templates-core-'))
    })

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true })
    })

    it('returns the template directory when it exists', async () => {
        await mkdir(path.join(dir, 'default'), { recursive: true })
        await writeFile(path.join(dir, 'default', 'marker.txt'), 'ok')

        const result = await getTemplatePath(dir, 'default')
        expect(result).toBe(path.join(dir, 'default'))
    })

    it('throws TemplateNotFoundError when the template is missing', async () => {
        await expect(getTemplatePath(dir, 'nonexistent')).rejects.toThrow(
            'Template "nonexistent" not found',
        )
    })
})

describe('seedDefaults', () => {
    let globalDir: string
    let templatesDir: string

    beforeEach(async () => {
        globalDir = await mkdtemp(path.join(tmpdir(), 'templates-seed-'))
        templatesDir = path.join(globalDir, 'templates')
    })

    afterEach(async () => {
        await rm(globalDir, { recursive: true, force: true })
    })

    it('seeds every bundled template and settings.json on first run', async () => {
        await seedDefaults(globalDir, templatesDir)

        const defaultMarker = await readFile(
            path.join(templatesDir, 'default', 'minimaz.config.json'),
            'utf8',
        )
        expect(defaultMarker).toContain('input')

        const simpleMarker = await readFile(
            path.join(templatesDir, 'simple', 'src', 'index.html'),
            'utf8',
        )
        expect(simpleMarker.length).toBeGreaterThan(0)

        const docsConfig = JSON.parse(
            await readFile(path.join(templatesDir, 'docs', 'minimaz.config.json'), 'utf8'),
        ) as { docs: { input: { dir: string } } }
        expect(docsConfig.docs.input.dir).toBe('docs')

        const settings = JSON.parse(
            await readFile(path.join(globalDir, 'settings.json'), 'utf8'),
        ) as Settings
        expect(settings.templatesPath).toBe(templatesDir)
    })

    it('seeds a default template config that leaves js bundling disabled by default', async () => {
        await seedDefaults(globalDir, templatesDir)

        const config = JSON.parse(
            await readFile(path.join(templatesDir, 'default', 'minimaz.config.json'), 'utf8'),
        ) as { output: { js?: { bundling?: boolean } } }
        // init keeps a template's own config, and bundling changes the emitted
        // module layout, so the seed must not enable it by default.
        expect(config.output.js?.bundling ?? false).toBe(false)
    })

    it('does not overwrite an existing template when overwrite is false', async () => {
        await seedDefaults(globalDir, templatesDir)
        await writeFile(path.join(templatesDir, 'default', 'CUSTOM_MARKER.txt'), 'mine')

        await seedDefaults(globalDir, templatesDir, false)

        const marker = await readFile(
            path.join(templatesDir, 'default', 'CUSTOM_MARKER.txt'),
            'utf8',
        )
        expect(marker).toBe('mine')
    })

    it('overwrites existing templates when overwrite is true', async () => {
        await seedDefaults(globalDir, templatesDir)
        await writeFile(path.join(templatesDir, 'default', 'CUSTOM_MARKER.txt'), 'mine')

        await seedDefaults(globalDir, templatesDir, true)

        await expect(
            readFile(path.join(templatesDir, 'default', 'CUSTOM_MARKER.txt'), 'utf8'),
        ).rejects.toThrow()
    })

    it('throws a build hint when the bundled seeds directory is missing', async () => {
        vi.mocked(pathExists).mockResolvedValueOnce(false)

        await expect(seedDefaults(globalDir, templatesDir)).rejects.toThrow(
            /Seed templates not found at ".*seeds" — run "npm run build" first/,
        )
    })
})

describe('writeSettings', () => {
    let globalDir: string

    beforeEach(async () => {
        globalDir = await mkdtemp(path.join(tmpdir(), 'templates-settings-'))
    })

    afterEach(async () => {
        await rm(globalDir, { recursive: true, force: true })
    })

    it('creates settings.json when missing', async () => {
        await writeSettings(globalDir, path.join(globalDir, 'templates'))

        const settings = JSON.parse(
            await readFile(path.join(globalDir, 'settings.json'), 'utf8'),
        ) as Settings
        expect(settings.templatesPath).toBe(path.join(globalDir, 'templates'))
        expect(typeof settings.createdAt).toBe('string')
    })

    it('patches in missing keys without touching existing ones', async () => {
        const settingsPath = path.join(globalDir, 'settings.json')
        await mkdir(globalDir, { recursive: true })
        await writeFile(settingsPath, JSON.stringify({ createdAt: '2020-01-01T00:00:00.000Z' }))

        await writeSettings(globalDir, path.join(globalDir, 'templates'))

        const settings = JSON.parse(await readFile(settingsPath, 'utf8')) as Settings
        expect(settings.createdAt).toBe('2020-01-01T00:00:00.000Z')
        expect(settings.templatesPath).toBe(path.join(globalDir, 'templates'))
    })

    describe('npmGlobalPath', () => {
        const realPlatform = process.platform

        afterEach(() => {
            Object.defineProperty(process, 'platform', { value: realPlatform })
            vi.unstubAllEnvs()
            vi.restoreAllMocks()
        })

        async function readWritten(): Promise<Settings> {
            return JSON.parse(
                await readFile(path.join(globalDir, 'settings.json'), 'utf8'),
            ) as Settings
        }

        it('omits the key on win32 when neither npm_config_prefix nor APPDATA is set', async () => {
            Object.defineProperty(process, 'platform', { value: 'win32' })
            vi.stubEnv('npm_config_prefix', '')
            vi.stubEnv('APPDATA', '')

            await writeSettings(globalDir, path.join(globalDir, 'templates'))

            const settings = await readWritten()
            expect('npmGlobalPath' in settings).toBe(false)
        })

        it('points at node_modules/@minimaz/sitekit', async () => {
            vi.stubEnv('npm_config_prefix', path.resolve('/fake/prefix'))

            await writeSettings(globalDir, path.join(globalDir, 'templates'))

            const settings = await readWritten()
            const written = settings.npmGlobalPath ?? ''
            expect(written.replaceAll('\\', '/').endsWith('node_modules/@minimaz/sitekit')).toBe(
                true,
            )
            expect(path.isAbsolute(written)).toBe(true)
        })

        it('does not warn about a missing npmGlobalPath in an existing settings file', async () => {
            const settingsPath = path.join(globalDir, 'settings.json')
            await writeFile(
                settingsPath,
                JSON.stringify({
                    createdAt: '2020-01-01T00:00:00.000Z',
                    templatesPath: path.join(globalDir, 'templates'),
                }),
            )
            const warn = vi.spyOn(log, 'warn')

            await writeSettings(globalDir, path.join(globalDir, 'templates'))

            const messages = warn.mock.calls.map((call) => String(call[0]))
            expect(messages.some((m) => m.includes('npmGlobalPath'))).toBe(false)
        })

        it('does not warn about an npmGlobalPath already present in an existing file', async () => {
            const settingsPath = path.join(globalDir, 'settings.json')
            await writeFile(
                settingsPath,
                JSON.stringify({
                    createdAt: '2020-01-01T00:00:00.000Z',
                    templatesPath: path.join(globalDir, 'templates'),
                    npmGlobalPath: path.resolve('/old/sitekit'),
                }),
            )
            const warn = vi.spyOn(log, 'warn')

            await writeSettings(globalDir, path.join(globalDir, 'templates'))

            const messages = warn.mock.calls.map((call) => String(call[0]))
            expect(messages.some((m) => m.includes('npmGlobalPath'))).toBe(false)
            const settings = await readWritten()
            expect(settings.npmGlobalPath).toBe(path.resolve('/old/sitekit'))
        })

        it('uses <APPDATA>/npm on win32 when npm_config_prefix is unset', async () => {
            Object.defineProperty(process, 'platform', { value: 'win32' })
            const appData = path.resolve('/fake/appdata')
            vi.stubEnv('npm_config_prefix', '')
            vi.stubEnv('APPDATA', appData)

            await writeSettings(globalDir, path.join(globalDir, 'templates'))

            const settings = await readWritten()
            expect(settings.npmGlobalPath).toBe(
                path.join(appData, 'npm', 'node_modules', '@minimaz', 'sitekit'),
            )
        })

        it('uses the prefix itself on win32 when npm_config_prefix is set', async () => {
            Object.defineProperty(process, 'platform', { value: 'win32' })
            const prefix = path.resolve('/fake/prefix')
            vi.stubEnv('npm_config_prefix', prefix)

            await writeSettings(globalDir, path.join(globalDir, 'templates'))

            const settings = await readWritten()
            expect(settings.npmGlobalPath).toBe(
                path.join(prefix, 'node_modules', '@minimaz', 'sitekit'),
            )
        })

        it('uses <prefix>/lib on non-win32 platforms when npm_config_prefix is set', async () => {
            Object.defineProperty(process, 'platform', { value: 'linux' })
            const prefix = path.resolve('/fake/prefix')
            vi.stubEnv('npm_config_prefix', prefix)

            await writeSettings(globalDir, path.join(globalDir, 'templates'))

            const settings = await readWritten()
            expect(settings.npmGlobalPath).toBe(
                path.join(prefix, 'lib', 'node_modules', '@minimaz', 'sitekit'),
            )
        })

        it('falls back to /usr/local/lib on non-win32 platforms without a prefix', async () => {
            Object.defineProperty(process, 'platform', { value: 'linux' })
            vi.stubEnv('npm_config_prefix', '')

            await writeSettings(globalDir, path.join(globalDir, 'templates'))

            const settings = await readWritten()
            const expected = path.join('/usr/local/lib', 'node_modules', '@minimaz', 'sitekit')
            // A rooted-but-driveless path is not absolute on Windows, so the key is omitted there.
            if (path.isAbsolute(expected)) {
                expect(settings.npmGlobalPath).toBe(expected)
            } else {
                expect('npmGlobalPath' in settings).toBe(false)
            }
        })

        it('omits the key when the derived path is not absolute', async () => {
            Object.defineProperty(process, 'platform', { value: 'win32' })
            vi.stubEnv('npm_config_prefix', 'relative-prefix')

            await writeSettings(globalDir, path.join(globalDir, 'templates'))

            const settings = await readWritten()
            expect('npmGlobalPath' in settings).toBe(false)
        })
    })

    it('recreates settings.json from the template when the existing file is corrupt', async () => {
        const settingsPath = path.join(globalDir, 'settings.json')
        await writeFile(settingsPath, '{not valid json')
        const warn = vi.spyOn(log, 'warn').mockImplementation(() => undefined)

        await writeSettings(globalDir, path.join(globalDir, 'templates'))

        expect(warn).toHaveBeenCalledWith('Failed to read settings.json, recreating from template')
        const settings = JSON.parse(await readFile(settingsPath, 'utf8')) as Settings
        expect(settings.templatesPath).toBe(path.join(globalDir, 'templates'))
        expect(typeof settings.createdAt).toBe('string')
    })

    it('warns about unknown keys and leaves them in place', async () => {
        const settingsPath = path.join(globalDir, 'settings.json')
        await writeFile(
            settingsPath,
            JSON.stringify({
                createdAt: '2020-01-01T00:00:00.000Z',
                templatesPath: path.join(globalDir, 'templates'),
                bogus: 1,
            }),
        )
        const warn = vi.spyOn(log, 'warn').mockImplementation(() => undefined)

        await writeSettings(globalDir, path.join(globalDir, 'templates'))

        expect(warn).toHaveBeenCalledWith('Unknown key "bogus" found in settings.json')
        const settings = JSON.parse(await readFile(settingsPath, 'utf8')) as Record<string, unknown>
        expect(settings['bogus']).toBe(1)
    })

    it('overwrites entirely when overwrite is true', async () => {
        const settingsPath = path.join(globalDir, 'settings.json')
        await mkdir(globalDir, { recursive: true })
        await writeFile(settingsPath, JSON.stringify({ createdAt: '2020-01-01T00:00:00.000Z' }))

        await writeSettings(globalDir, path.join(globalDir, 'templates'), true)

        const settings = JSON.parse(await readFile(settingsPath, 'utf8')) as Settings
        expect(settings.createdAt).not.toBe('2020-01-01T00:00:00.000Z')
    })
})

describe('listTemplates', () => {
    let templatesDir: string

    beforeEach(async () => {
        templatesDir = await mkdtemp(path.join(tmpdir(), 'templates-list-'))
    })

    afterEach(async () => {
        await rm(templatesDir, { recursive: true, force: true })
    })

    it('returns an empty array when the directory has nothing in it', async () => {
        await expect(listTemplates(templatesDir)).resolves.toEqual([])
    })

    it('returns template directory names', async () => {
        await mkdir(path.join(templatesDir, 'default'))
        await mkdir(path.join(templatesDir, 'simple'))

        const names = await listTemplates(templatesDir)
        expect(names.sort()).toEqual(['default', 'simple'])
    })
})

describe('saveTemplate', () => {
    let templatesDir: string
    let sourceDir: string

    beforeEach(async () => {
        const root = await mkdtemp(path.join(tmpdir(), 'templates-save-'))
        templatesDir = path.join(root, 'templates')
        sourceDir = path.join(root, 'source')
        await mkdir(sourceDir, { recursive: true })
        await writeFile(path.join(sourceDir, 'index.html'), '<html></html>')
    })

    afterEach(async () => {
        await rm(path.dirname(templatesDir), { recursive: true, force: true })
    })

    it('copies the source directory into templatesDir/<name>', async () => {
        await saveTemplate(templatesDir, sourceDir, 'mytemplate', false)

        const content = await readFile(path.join(templatesDir, 'mytemplate', 'index.html'), 'utf8')
        expect(content).toBe('<html></html>')
    })

    it('throws when the name already exists and overwrite is false', async () => {
        await saveTemplate(templatesDir, sourceDir, 'mytemplate', false)

        await expect(saveTemplate(templatesDir, sourceDir, 'mytemplate', false)).rejects.toThrow(
            'already exists',
        )
    })

    it('rejects a path-traversal name with InvalidTemplateNameError', async () => {
        await expect(saveTemplate(templatesDir, sourceDir, '../evil', false)).rejects.toThrow(
            'Invalid template name',
        )
    })

    it('replaces the existing template when overwrite is true', async () => {
        await saveTemplate(templatesDir, sourceDir, 'mytemplate', false)
        await writeFile(path.join(sourceDir, 'index.html'), '<html>v2</html>')

        await saveTemplate(templatesDir, sourceDir, 'mytemplate', true)

        const content = await readFile(path.join(templatesDir, 'mytemplate', 'index.html'), 'utf8')
        expect(content).toBe('<html>v2</html>')
    })
})

describe('deleteTemplate', () => {
    let templatesDir: string

    beforeEach(async () => {
        templatesDir = await mkdtemp(path.join(tmpdir(), 'templates-delete-'))
        await mkdir(path.join(templatesDir, 'mytemplate'))
    })

    afterEach(async () => {
        await rm(templatesDir, { recursive: true, force: true })
    })

    it('removes the named template', async () => {
        await deleteTemplate(templatesDir, 'mytemplate')
        await expect(listTemplates(templatesDir)).resolves.toEqual([])
    })

    it('throws TemplateNotFoundError when the template does not exist', async () => {
        await expect(deleteTemplate(templatesDir, 'nonexistent')).rejects.toThrow(
            'Template "nonexistent" not found',
        )
    })

    it('rejects a path-traversal name with InvalidTemplateNameError', async () => {
        await expect(deleteTemplate(templatesDir, '../evil')).rejects.toThrow(
            'Invalid template name',
        )
    })
})

describe('updateTemplateFrom', () => {
    let templatesDir: string
    let sourceDir: string

    beforeEach(async () => {
        const root = await mkdtemp(path.join(tmpdir(), 'templates-update-'))
        templatesDir = path.join(root, 'templates')
        sourceDir = path.join(root, 'source')
        await mkdir(path.join(templatesDir, 'mytemplate'), { recursive: true })
        await writeFile(path.join(templatesDir, 'mytemplate', 'old.txt'), 'old')
        await mkdir(sourceDir, { recursive: true })
        await writeFile(path.join(sourceDir, 'new.txt'), 'new')
    })

    afterEach(async () => {
        await rm(path.dirname(templatesDir), { recursive: true, force: true })
    })

    it('replaces the named template with the source directory contents', async () => {
        await updateTemplateFrom(templatesDir, 'mytemplate', sourceDir)

        const content = await readFile(path.join(templatesDir, 'mytemplate', 'new.txt'), 'utf8')
        expect(content).toBe('new')
        await expect(
            readFile(path.join(templatesDir, 'mytemplate', 'old.txt'), 'utf8'),
        ).rejects.toThrow()
    })

    it('throws TemplateNotFoundError when the template does not already exist', async () => {
        await expect(updateTemplateFrom(templatesDir, 'nonexistent', sourceDir)).rejects.toThrow(
            'Template "nonexistent" not found',
        )
    })
})
