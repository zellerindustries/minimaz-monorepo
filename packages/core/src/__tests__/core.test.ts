import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type * as FsPromises from 'node:fs/promises'

import { applyReplacements, getDirElements, isPathInside, readJsonFile } from '../core.js'

describe('readJsonFile', () => {
    let dir: string

    beforeEach(async () => {
        dir = await mkdtemp(path.join(tmpdir(), 'core-readjson-'))
    })

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true })
    })

    it('parses a valid JSON file', async () => {
        const file = path.join(dir, 'data.json')
        await writeFile(file, JSON.stringify({ a: 1 }), 'utf8')

        await expect(readJsonFile<{ a: number }>(file)).resolves.toEqual({ a: 1 })
    })

    it('throws a NOT FOUND error when the file does not exist', async () => {
        const file = path.join(dir, 'missing.json')

        await expect(readJsonFile(file)).rejects.toThrow(/NOT FOUND/)
    })

    it('throws a PARSE ERROR when the file contains invalid JSON', async () => {
        const file = path.join(dir, 'bad.json')
        await writeFile(file, '{not valid json', 'utf8')

        await expect(readJsonFile(file)).rejects.toThrow(/PARSE ERROR/)
    })

    it('reads the file without a separate stat() existence check', async () => {
        const file = path.join(dir, 'data.json')
        await writeFile(file, JSON.stringify({ a: 1 }), 'utf8')

        const statSpy = vi.fn(stat)
        vi.doMock('node:fs/promises', async () => {
            const actual = await vi.importActual<typeof FsPromises>('node:fs/promises')
            return { ...actual, stat: statSpy }
        })
        vi.resetModules()

        const { readJsonFile: freshReadJsonFile } = await import('../core.js')
        await freshReadJsonFile(file)

        expect(statSpy).not.toHaveBeenCalled()

        vi.doUnmock('node:fs/promises')
        vi.resetModules()
    })
})

describe('getDirElements', () => {
    let dir: string

    beforeEach(async () => {
        dir = await mkdtemp(path.join(tmpdir(), 'core-dirents-'))
    })

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true })
    })

    it('returns entries for an existing directory', async () => {
        await writeFile(path.join(dir, 'a.txt'), 'x', 'utf8')
        await writeFile(path.join(dir, 'b.txt'), 'x', 'utf8')

        const entries = await getDirElements(dir)

        expect(entries.sort()).toEqual(['a.txt', 'b.txt'])
    })

    it('returns an empty array when the directory does not exist', async () => {
        const missing = path.join(dir, 'nope')

        await expect(getDirElements(missing)).resolves.toEqual([])
    })

    it('reads the directory without a separate stat() existence check', async () => {
        const statSpy = vi.fn(stat)
        vi.doMock('node:fs/promises', async () => {
            const actual = await vi.importActual<typeof FsPromises>('node:fs/promises')
            return { ...actual, stat: statSpy }
        })
        vi.resetModules()

        const { getDirElements: freshGetDirElements } = await import('../core.js')
        await freshGetDirElements(dir)

        expect(statSpy).not.toHaveBeenCalled()

        vi.doUnmock('node:fs/promises')
        vi.resetModules()
    })
})

describe('applyReplacements', () => {
    it('replaces every occurrence of a key with its value', () => {
        const result = applyReplacements('Hello {{name}}, welcome {{name}}!', {
            '{{name}}': 'World',
        })

        expect(result).toBe('Hello World, welcome World!')
    })

    it('applies multiple replacement keys', () => {
        const result = applyReplacements('{{a}} and {{b}}', { '{{a}}': '1', '{{b}}': '2' })

        expect(result).toBe('1 and 2')
    })

    it('returns the content unchanged when replacements is empty', () => {
        const result = applyReplacements('unchanged', {})

        expect(result).toBe('unchanged')
    })
})

describe('isPathInside', () => {
    it('returns true for a direct child', () => {
        expect(isPathInside(path.join('project', 'dist'), 'project')).toBe(true)
    })

    it('returns true for a nested descendant', () => {
        expect(isPathInside(path.join('project', 'dist', 'assets'), 'project')).toBe(true)
    })

    it('returns false for the same path', () => {
        expect(isPathInside('project', 'project')).toBe(false)
    })

    it('returns false for a sibling whose name has the parent as a string prefix', () => {
        expect(isPathInside('project-backup', 'project')).toBe(false)
    })

    it('returns false for an unrelated sibling directory, even with a longer path', () => {
        expect(isPathInside(path.join('other', 'much', 'longer', 'path'), 'project')).toBe(false)
    })

    it('returns false for a parent of the given directory', () => {
        expect(isPathInside('project', path.join('project', 'dist'))).toBe(false)
    })
})
