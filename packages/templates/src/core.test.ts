import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
} from './core.js'
import type { Settings } from './types.js'

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

    it('seeds both default templates and settings.json on first run', async () => {
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

        const settings = JSON.parse(
            await readFile(path.join(globalDir, 'settings.json'), 'utf8'),
        ) as Settings
        expect(settings.templatesPath).toBe(templatesDir)
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
