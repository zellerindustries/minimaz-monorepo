import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
    deleteTemplate,
    listTemplates,
    saveTemplate,
    seedDefaults,
    updateTemplateFrom,
} from '@minimaz/templates'
import { KnownError } from '@minimaz/logger'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { askQuestion } from '../../../cli/index.js'
import { template } from '../main.js'

vi.mock('@minimaz/templates', () => ({
    listTemplates: vi.fn(() => Promise.resolve([])),
    deleteTemplate: vi.fn(() => Promise.resolve()),
    saveTemplate: vi.fn(() => Promise.resolve()),
    seedDefaults: vi.fn(() => Promise.resolve()),
    updateTemplateFrom: vi.fn(() => Promise.resolve()),
}))

vi.mock('../../../cli/index.js', () => ({
    askQuestion: vi.fn(() => Promise.resolve('')),
}))

const originalWorkdir = process.env['CLI_WORKDIR']

describe('template command', () => {
    let root: string
    let globalDir: string
    let templatesDir: string
    let source: string

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'cli-template-'))
        globalDir = join(root, 'global')
        templatesDir = join(globalDir, 'templates')
        source = join(root, 'mysite')
        await mkdir(source, { recursive: true })
        vi.spyOn(console, 'log').mockImplementation(() => undefined)
        vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    })

    afterEach(async () => {
        if (originalWorkdir === undefined) {
            delete process.env['CLI_WORKDIR']
        } else {
            process.env['CLI_WORKDIR'] = originalWorkdir
        }
        await rm(root, { recursive: true, force: true })
    })

    function answer(value: string): void {
        vi.mocked(askQuestion).mockResolvedValueOnce(value)
    }

    describe('list', () => {
        it('prints every template name', async () => {
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
            vi.mocked(listTemplates).mockResolvedValueOnce(['a', 'b'])

            await template(globalDir, templatesDir, { list: true }, source)

            const lines = logSpy.mock.calls.map((call) => String(call[0]))
            expect(lines).toContain('[app] a')
            expect(lines).toContain('[app] b')
        })

        it('says when there are no templates', async () => {
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

            await template(globalDir, templatesDir, { list: true }, source)

            expect(
                logSpy.mock.calls.some((call) =>
                    String(call[0]).includes('No global templates available'),
                ),
            ).toBe(true)
        })
    })

    describe('delete', () => {
        it('deletes after an explicit yes', async () => {
            answer('y')

            await template(globalDir, templatesDir, { delete: 'old' }, source)

            expect(askQuestion).toHaveBeenCalledWith('Confirm delete "old"? [y/N]:', 'n')
            expect(deleteTemplate).toHaveBeenCalledWith(templatesDir, 'old')
        })

        it('does nothing otherwise', async () => {
            answer('n')

            await template(globalDir, templatesDir, { delete: 'old' }, source)

            expect(deleteTemplate).not.toHaveBeenCalled()
        })
    })

    describe('update', () => {
        it('updates a named template from the source path, trimming the name', async () => {
            answer('Y')

            await template(globalDir, templatesDir, { update: '  site  ' }, source)

            expect(updateTemplateFrom).toHaveBeenCalledWith(templatesDir, 'site', source)
        })

        it('does not update a named template when declined', async () => {
            answer('n')

            await template(globalDir, templatesDir, { update: 'site' }, source)

            expect(updateTemplateFrom).not.toHaveBeenCalled()
        })

        it('re-seeds every template from defaults when no name is given', async () => {
            answer('y')

            await template(globalDir, templatesDir, { update: true }, source)

            expect(seedDefaults).toHaveBeenCalledWith(globalDir, templatesDir, true)
        })

        it('does not re-seed when declined', async () => {
            answer('n')

            await template(globalDir, templatesDir, { update: true }, source)

            expect(seedDefaults).not.toHaveBeenCalled()
        })
    })

    describe('save (default action)', () => {
        it('saves a new template named after the source directory without asking', async () => {
            await template(globalDir, templatesDir, {}, source)

            expect(askQuestion).not.toHaveBeenCalled()
            expect(saveTemplate).toHaveBeenCalledWith(templatesDir, source, 'mysite', true)
        })

        it('overwrites an existing template only after an explicit yes', async () => {
            await mkdir(join(templatesDir, 'mysite'), { recursive: true })

            answer('n')
            await template(globalDir, templatesDir, {}, source)
            expect(saveTemplate).not.toHaveBeenCalled()

            answer('y')
            await template(globalDir, templatesDir, {}, source)
            expect(saveTemplate).toHaveBeenCalledWith(templatesDir, source, 'mysite', true)
        })

        it('cancels when the source is missing and the user declines the fallback', async () => {
            answer('n')

            const result = template(globalDir, templatesDir, {}, join(root, 'missing'))
            await expect(result).rejects.toBeInstanceOf(KnownError)
            await expect(result).rejects.toThrow('Operation cancelled')
            expect(saveTemplate).not.toHaveBeenCalled()
        })

        it('falls back to CLI_WORKDIR when the source is missing and the user agrees', async () => {
            process.env['CLI_WORKDIR'] = source
            answer('y')

            await template(globalDir, templatesDir, {}, join(root, 'missing'))

            expect(saveTemplate).toHaveBeenCalledWith(templatesDir, source, 'mysite', true)
        })
    })
})
