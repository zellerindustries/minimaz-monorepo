import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { log } from '@minimaz/logger'
import { version } from '../main.js'

describe('version', () => {
    let dir: string
    let pkgPath: string

    beforeEach(async () => {
        dir = await mkdtemp(path.join(tmpdir(), 'minimaz-cli-version-'))
        pkgPath = path.join(dir, 'package.json')
    })

    afterEach(async () => {
        vi.restoreAllMocks()
        await rm(dir, { recursive: true, force: true })
    })

    it('prints the version from the given package.json', async () => {
        const spy = vi.spyOn(log, 'default').mockImplementation(() => undefined)
        await writeFile(pkgPath, JSON.stringify({ version: '1.2.3' }))

        await version(pkgPath)

        expect(spy).toHaveBeenCalledWith('1.2.3')
    })

    it.each([
        ['missing', {}],
        ['not a string', { version: 3 }],
    ])('throws when the version is %s', async (_label, content) => {
        await writeFile(pkgPath, JSON.stringify(content))

        await expect(version(pkgPath)).rejects.toThrow('Invalid or missing version')
    })
})
