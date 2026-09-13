import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveModuleGraph } from './core.js'

describe('resolveModuleGraph', () => {
    let dir: string

    beforeEach(async () => {
        dir = await mkdtemp(path.join(tmpdir(), 'bundler-'))
    })

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true })
    })

    it('returns a single-entry map for a JS file with no imports', async () => {
        const entry = path.join(dir, 'entry.js')
        await writeFile(entry, 'export const value = 1\n', 'utf8')

        const result = await resolveModuleGraph(entry)

        expect(result.modules.size).toBe(1)
        expect(result.modules.get(entry)).toBe('export const value = 1\n')
    })

    it('transpiles a TypeScript entry file with no imports', async () => {
        const entry = path.join(dir, 'entry.ts')
        await writeFile(entry, 'export const value: number = 1\n', 'utf8')

        const result = await resolveModuleGraph(entry)

        expect(result.modules.size).toBe(1)
        const output = result.modules.get(entry)
        expect(output).toBeDefined()
        expect(output).not.toContain(': number')
        expect(output).toContain('export const value = 1')
    })
})
