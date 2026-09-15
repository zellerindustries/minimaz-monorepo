import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { CONFIG_FILE_NAME, DEFAULT_CONFIG } from '@minimaz/config'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { docsInit, resolveDocsCommand } from '../main.js'

describe('resolveDocsCommand', () => {
    it('returns "init" for "init"', () => {
        expect(resolveDocsCommand('init')).toBe('init')
    })

    it('returns "build" for "build"', () => {
        expect(resolveDocsCommand('build')).toBe('build')
    })

    it('throws for an unrecognized subcommand', () => {
        expect(() => resolveDocsCommand('publish')).toThrow('Usage: minimaz docs <init|build>')
    })

    it('throws when no subcommand is given', () => {
        expect(() => resolveDocsCommand(undefined)).toThrow('Usage: minimaz docs <init|build>')
    })
})

describe('docsInit', () => {
    let dir: string

    beforeEach(async () => {
        dir = await mkdtemp(path.join(tmpdir(), 'cli-docs-init-'))
    })

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true })
    })

    it('writes the default docs config when none exists', async () => {
        await docsInit(dir)
        const written = await readFile(path.join(dir, CONFIG_FILE_NAME), 'utf8')
        expect(JSON.parse(written)).toEqual(DEFAULT_CONFIG)
    })

    it('leaves an existing config file untouched', async () => {
        await writeFile(path.join(dir, CONFIG_FILE_NAME), '{"custom":true}')
        await docsInit(dir)
        const written = await readFile(path.join(dir, CONFIG_FILE_NAME), 'utf8')
        expect(JSON.parse(written)).toEqual({ custom: true })
    })
})
