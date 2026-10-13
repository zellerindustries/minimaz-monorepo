import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { KnownError } from '@minimaz/logger'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type * as FsPromises from 'node:fs/promises'

import {
    applyReplacements,
    getDirElements,
    getFileContent,
    isPathInside,
    pathsOverlap,
    readJsonFile,
} from '../core.js'

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

    it('wraps a non-ENOENT read failure (a directory) in a PARSE ERROR with the cause', async () => {
        const error = await readJsonFile(dir).catch((caught: unknown) => caught)

        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toMatch(/^PARSE ERROR: Failed to parse JSON in ".*" - /)
        expect((error as Error).cause).toBeInstanceOf(Error)
    })

    it('stringifies a non-Error read failure in the PARSE ERROR message', async () => {
        vi.doMock('node:fs/promises', async () => {
            const actual = await vi.importActual<typeof FsPromises>('node:fs/promises')
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- non-Error rejection is the case under test
            return { ...actual, readFile: vi.fn(() => Promise.reject('boom')) }
        })
        vi.resetModules()

        try {
            const fresh = await import('../core.js')

            await expect(fresh.readJsonFile('whatever.json')).rejects.toThrow(
                'PARSE ERROR: Failed to parse JSON in "whatever.json" - boom',
            )
        } finally {
            vi.doUnmock('node:fs/promises')
            vi.resetModules()
        }
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

describe('getFileContent', () => {
    let dir: string

    beforeEach(async () => {
        dir = await mkdtemp(path.join(tmpdir(), 'core-filecontent-'))
    })

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true })
    })

    it('returns the UTF-8 content of a file', async () => {
        const file = path.join(dir, 'a.txt')
        await writeFile(file, 'héllo', 'utf8')

        await expect(getFileContent(file)).resolves.toBe('héllo')
    })

    it('returns an empty string for a genuinely empty file', async () => {
        const file = path.join(dir, 'empty.txt')
        await writeFile(file, '', 'utf8')

        await expect(getFileContent(file)).resolves.toBe('')
    })

    it('rejects with a KnownError naming the path and keeping the cause when missing', async () => {
        const file = path.join(dir, 'missing.txt')

        const error = await getFileContent(file).catch((caught: unknown) => caught)

        expect(error).toBeInstanceOf(KnownError)
        expect((error as KnownError).message).toContain(`Failed to read file at "${file}":`)
        expect((error as KnownError).cause).toBeInstanceOf(Error)
    })

    it('rejects with a KnownError when the path is a directory', async () => {
        await expect(getFileContent(dir)).rejects.toBeInstanceOf(KnownError)
    })

    it('stringifies a non-Error read failure', async () => {
        vi.doMock('node:fs/promises', async () => {
            const actual = await vi.importActual<typeof FsPromises>('node:fs/promises')
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- non-Error rejection is the case under test
            return { ...actual, readFile: vi.fn(() => Promise.reject('boom')) }
        })
        vi.resetModules()

        try {
            const fresh = await import('../core.js')

            await expect(fresh.getFileContent('x.txt')).rejects.toThrow(
                'Failed to read file at "x.txt": boom',
            )
        } finally {
            vi.doUnmock('node:fs/promises')
            vi.resetModules()
        }
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

describe('pathsOverlap', () => {
    const root = path.join('C:', 'project')

    it('is true for the same path', () => {
        expect(pathsOverlap(path.join(root, 'src'), path.join(root, 'src'))).toBe(true)
    })

    it('is true when the first path contains the second', () => {
        expect(pathsOverlap(path.join(root, 'public'), path.join(root, 'public', 'src'))).toBe(true)
    })

    it('is true when the first path is nested inside the second', () => {
        expect(pathsOverlap(path.join(root, 'src', 'assets'), path.join(root, 'src'))).toBe(true)
    })

    it('is false for siblings sharing a name prefix', () => {
        expect(pathsOverlap(path.join(root, 'src-old'), path.join(root, 'src'))).toBe(false)
    })

    it('is false for a child directory whose name starts with two dots', () => {
        expect(pathsOverlap(path.join(root, 'dist'), path.join(root, '..cache'))).toBe(false)
    })

    it.runIf(process.platform === 'win32' || process.platform === 'darwin')(
        'ignores case on case-insensitive platforms',
        () => {
            expect(pathsOverlap(path.join(root, 'Src'), path.join(root, 'src'))).toBe(true)
        },
    )

    describe('platform case sensitivity', () => {
        const realPlatform = process.platform

        afterEach(() => {
            Object.defineProperty(process, 'platform', { value: realPlatform })
        })

        // Only the process.platform flag is faked; the path functions stay the host's, so the
        // inputs are built from path.join and only differ in case.
        it.each(['win32', 'darwin'])('ignores case when the platform is %s', (platform) => {
            Object.defineProperty(process, 'platform', { value: platform })

            expect(pathsOverlap(path.join(root, 'Src'), path.join(root, 'src'))).toBe(true)
            expect(pathsOverlap(path.join(root, 'SRC', 'a'), path.join(root, 'src'))).toBe(true)
        })

        // path.relative is itself case-insensitive on a win32 host, so this only holds elsewhere.
        it.runIf(process.platform !== 'win32')(
            'keeps paths that differ only in case distinct on a case-sensitive platform',
            () => {
                Object.defineProperty(process, 'platform', { value: 'linux' })

                expect(pathsOverlap(path.join(root, 'Src'), path.join(root, 'src'))).toBe(false)
                expect(pathsOverlap(path.join(root, 'SRC', 'a'), path.join(root, 'src'))).toBe(
                    false,
                )
            },
        )

        it('still detects an exact match on a case-sensitive platform', () => {
            Object.defineProperty(process, 'platform', { value: 'linux' })

            expect(pathsOverlap(path.join(root, 'src'), path.join(root, 'src'))).toBe(true)
        })
    })

    it('is false for paths on different roots (relative() yields an absolute path)', () => {
        // On Windows a different drive makes path.relative return an absolute path; on POSIX the
        // two unrelated trees only produce ../ segments. Either way they must not overlap.
        const a = path.resolve(path.parse(process.cwd()).root, 'one', 'tree')
        const other =
            process.platform === 'win32' ? (a.startsWith('C:') ? 'D:\\x' : 'C:\\x') : '/zzz'

        expect(pathsOverlap(a, other)).toBe(false)
    })
})
