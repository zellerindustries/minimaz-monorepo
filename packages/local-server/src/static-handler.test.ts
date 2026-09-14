import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveStaticFile } from './static-handler.js'

describe('resolveStaticFile', () => {
    let dir: string

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'minimaz-local-server-'))
        await writeFile(join(dir, 'index.html'), '<html></html>')
        await mkdir(join(dir, 'assets'))
        await writeFile(join(dir, 'assets', 'site.css'), 'body {}')
        await mkdir(join(dir, 'empty-dir'))
    })

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true })
    })

    it('resolves a top-level file', async () => {
        const result = await resolveStaticFile(dir, '/assets/site.css')
        expect(result).toEqual({ status: 200, filePath: join(dir, 'assets', 'site.css') })
    })

    it('resolves the directory root to index.html', async () => {
        const result = await resolveStaticFile(dir, '/')
        expect(result).toEqual({ status: 200, filePath: join(dir, 'index.html') })
    })

    it('returns 404 for a missing file', async () => {
        const result = await resolveStaticFile(dir, '/missing.txt')
        expect(result).toEqual({ status: 404 })
    })

    it('returns 404 for a directory with no index.html', async () => {
        const result = await resolveStaticFile(dir, '/empty-dir')
        expect(result).toEqual({ status: 404 })
    })

    it('returns 403 for a path that escapes the served directory', async () => {
        const result = await resolveStaticFile(dir, '/../../etc/passwd')
        expect(result).toEqual({ status: 403 })
    })
})
