import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { KnownError } from '@minimaz/logger'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
    copy,
    ensureDir,
    getFileContent,
    isDirectory,
    outputFile,
    pathExists,
    remove,
} from '../core.js'

let root: string

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'core-fs-'))
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

describe('pathExists', () => {
    it('is true for an existing file or directory and false otherwise', async () => {
        await writeFile(join(root, 'a.txt'), 'x')

        expect(await pathExists(join(root, 'a.txt'))).toBe(true)
        expect(await pathExists(root)).toBe(true)
        expect(await pathExists(join(root, 'missing'))).toBe(false)
    })
})

describe('remove', () => {
    it('deletes a directory tree and ignores a missing path', async () => {
        await mkdir(join(root, 'd', 'e'), { recursive: true })
        await writeFile(join(root, 'd', 'e', 'f.txt'), 'x')

        await remove(join(root, 'd'))
        await remove(join(root, 'missing'))

        expect(await pathExists(join(root, 'd'))).toBe(false)
    })
})

describe('ensureDir', () => {
    it('creates nested directories and is safe to repeat', async () => {
        const nested = join(root, 'a', 'b', 'c')

        await ensureDir(nested)
        await ensureDir(nested)

        expect(await isDirectory(nested)).toBe(true)
    })
})

describe('copy', () => {
    beforeEach(async () => {
        await mkdir(join(root, 'src', 'sub'), { recursive: true })
        await writeFile(join(root, 'src', 'sub', 'a.txt'), 'new')
        await mkdir(join(root, 'dest', 'sub'), { recursive: true })
        await writeFile(join(root, 'dest', 'sub', 'a.txt'), 'old')
        await writeFile(join(root, 'dest', 'stale.txt'), 'x')
    })

    it('merges into an existing destination, replacing shared files', async () => {
        await copy(join(root, 'src'), join(root, 'dest'))

        expect(await readFile(join(root, 'dest', 'sub', 'a.txt'), 'utf8')).toBe('new')
        expect(await pathExists(join(root, 'dest', 'stale.txt'))).toBe(true)
    })

    it('replaces the destination entirely when overwrite is true', async () => {
        await copy(join(root, 'src'), join(root, 'dest'), true)

        expect(await readdir(join(root, 'dest'))).toEqual(['sub'])
    })
})

describe('outputFile', () => {
    it('creates missing parent directories and writes UTF-8 by default', async () => {
        const target = join(root, 'x', 'y', 'out.txt')

        await outputFile(target, 'héllo')

        expect(await readFile(target, 'utf8')).toBe('héllo')
    })
})

describe('isDirectory', () => {
    it('is true only for an existing directory', async () => {
        await writeFile(join(root, 'file.txt'), 'x')

        expect(await isDirectory(root)).toBe(true)
        expect(await isDirectory(join(root, 'file.txt'))).toBe(false)
        expect(await isDirectory(join(root, 'missing'))).toBe(false)
    })
})

describe('getFileContent', () => {
    it('reads a file as UTF-8', async () => {
        await writeFile(join(root, 'a.txt'), 'content')

        expect(await getFileContent(join(root, 'a.txt'))).toBe('content')
    })

    it('rejects with a KnownError for a missing file', async () => {
        const promise = getFileContent(join(root, 'missing.txt'))

        await expect(promise).rejects.toBeInstanceOf(KnownError)
        await expect(promise).rejects.toThrow(/Failed to read file at/)
    })

    it('rejects for a directory path and chains the cause', async () => {
        await mkdir(join(root, 'x.css'))

        await expect(getFileContent(join(root, 'x.css'))).rejects.toHaveProperty('cause')
    })
})
