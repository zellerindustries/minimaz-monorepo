import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderDirectoryListing, resolveRequest } from '../static-handler.js'
import type * as FsPromises from 'node:fs/promises'

vi.mock('node:fs/promises', async (importOriginal) => {
    const actual = await importOriginal<typeof FsPromises>()
    return { ...actual, stat: vi.fn(actual.stat) }
})

const allOff = { cleanUrls: false, singlePageApp: false, directoryListing: false }

describe('resolveRequest', () => {
    let dir: string

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'minimaz-local-server-'))
        await writeFile(join(dir, 'index.html'), '<html></html>')
        await mkdir(join(dir, 'assets'))
        await writeFile(join(dir, 'assets', 'site.css'), 'body {}')
        await mkdir(join(dir, 'empty-dir'))
        await writeFile(join(dir, 'about.html'), '<html>about</html>')
        vi.mocked(stat).mockClear()
    })

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true })
    })

    it('resolves a top-level file', async () => {
        const result = await resolveRequest(dir, '/assets/site.css', allOff)
        expect(result).toEqual({ kind: 'file', filePath: join(dir, 'assets', 'site.css') })
    })

    it('stats a plain file only once', async () => {
        await resolveRequest(dir, '/assets/site.css', allOff)
        expect(stat).toHaveBeenCalledTimes(1)
    })

    it('resolves the directory root to index.html', async () => {
        const result = await resolveRequest(dir, '/', allOff)
        expect(result).toEqual({ kind: 'file', filePath: join(dir, 'index.html') })
    })

    it('returns notFound for a missing file with every option off', async () => {
        const result = await resolveRequest(dir, '/missing.txt', allOff)
        expect(result).toEqual({ kind: 'notFound' })
    })

    it('returns notFound for a directory with no index.html and every option off', async () => {
        const result = await resolveRequest(dir, '/empty-dir', allOff)
        expect(result).toEqual({ kind: 'notFound' })
    })

    it('returns forbidden for a path that escapes the served directory', async () => {
        const result = await resolveRequest(dir, '/../../etc/passwd', allOff)
        expect(result).toEqual({ kind: 'forbidden' })
    })

    it('returns forbidden (not notFound) when stat fails with a permission error', async () => {
        const eacces = Object.assign(new Error('EACCES'), { code: 'EACCES' })
        vi.mocked(stat).mockRejectedValueOnce(eacces)

        const result = await resolveRequest(dir, '/assets/site.css', allOff)

        expect(result).toEqual({ kind: 'forbidden' })
    })

    describe('cleanUrls', () => {
        it('falls back to <path>.html when the exact path has no extension and no exact match', async () => {
            const result = await resolveRequest(dir, '/about', { ...allOff, cleanUrls: true })
            expect(result).toEqual({ kind: 'file', filePath: join(dir, 'about.html') })
        })

        it('trims a trailing slash before appending .html, instead of looking up "<name>/.html"', async () => {
            // A naive implementation would append ".html" directly onto the raw pathname,
            // producing "/about/.html" (a literal file named ".html" inside an "about" directory)
            // instead of trimming the slash first to get "/about.html", which is the file that
            // actually exists.
            const result = await resolveRequest(dir, '/about/', { ...allOff, cleanUrls: true })
            expect(result).toEqual({ kind: 'file', filePath: join(dir, 'about.html') })
        })

        it('still misses when the trailing-slash path has no matching clean-URL file', async () => {
            const result = await resolveRequest(dir, '/missing-page/', {
                ...allOff,
                cleanUrls: true,
            })
            expect(result).toEqual({ kind: 'notFound' })
        })

        it('prefers an exact match over the clean-URL fallback', async () => {
            await writeFile(join(dir, 'about'), 'literal file, no extension')
            const result = await resolveRequest(dir, '/about', { ...allOff, cleanUrls: true })
            expect(result).toEqual({ kind: 'file', filePath: join(dir, 'about') })
        })

        it('does nothing when cleanUrls is off', async () => {
            const result = await resolveRequest(dir, '/about', allOff)
            expect(result).toEqual({ kind: 'notFound' })
        })
    })

    describe('directoryListing', () => {
        it('lists a directory with no index.html when enabled', async () => {
            await writeFile(join(dir, 'empty-dir', 'notes.txt'), 'hi')
            await mkdir(join(dir, 'empty-dir', 'nested'))

            const result = await resolveRequest(dir, '/empty-dir', {
                ...allOff,
                directoryListing: true,
            })

            expect(result.kind).toBe('listing')
            if (result.kind !== 'listing') {
                throw new Error('expected a listing result')
            }
            expect(result.entries).toEqual([
                { name: 'nested', isDirectory: true },
                { name: 'notes.txt', isDirectory: false },
            ])
        })

        it('does not list a directory that has an index.html', async () => {
            const result = await resolveRequest(dir, '/', { ...allOff, directoryListing: true })
            expect(result).toEqual({ kind: 'file', filePath: join(dir, 'index.html') })
        })

        it('lists the served root itself when it has no index.html', async () => {
            const noIndexDir = await mkdtemp(join(tmpdir(), 'minimaz-local-server-noindex-'))
            await writeFile(join(noIndexDir, 'readme.txt'), 'hi')

            const result = await resolveRequest(noIndexDir, '/', {
                ...allOff,
                directoryListing: true,
            })

            expect(result).toEqual({
                kind: 'listing',
                entries: [{ name: 'readme.txt', isDirectory: false }],
            })

            await rm(noIndexDir, { recursive: true, force: true })
        })

        it('does nothing when directoryListing is off', async () => {
            const result = await resolveRequest(dir, '/empty-dir', allOff)
            expect(result).toEqual({ kind: 'notFound' })
        })
    })

    describe('singlePageApp', () => {
        it('serves root index.html for an unresolved path', async () => {
            const result = await resolveRequest(dir, '/some/client/route', {
                ...allOff,
                singlePageApp: true,
            })
            expect(result).toEqual({ kind: 'file', filePath: join(dir, 'index.html') })
        })

        it('rewrites even a plausible missing asset path to index.html (last-resort fallback)', async () => {
            const result = await resolveRequest(dir, '/missing.js', {
                ...allOff,
                singlePageApp: true,
            })
            expect(result).toEqual({ kind: 'file', filePath: join(dir, 'index.html') })
        })

        it('does not override an exact file match', async () => {
            const result = await resolveRequest(dir, '/assets/site.css', {
                ...allOff,
                singlePageApp: true,
            })
            expect(result).toEqual({ kind: 'file', filePath: join(dir, 'assets', 'site.css') })
        })

        it('does not override a directory listing when both are enabled', async () => {
            await writeFile(join(dir, 'empty-dir', 'notes.txt'), 'hi')

            const result = await resolveRequest(dir, '/empty-dir', {
                ...allOff,
                directoryListing: true,
                singlePageApp: true,
            })

            expect(result).toEqual({
                kind: 'listing',
                entries: [{ name: 'notes.txt', isDirectory: false }],
            })
        })

        it('does nothing when singlePageApp is off', async () => {
            const result = await resolveRequest(dir, '/some/client/route', allOff)
            expect(result).toEqual({ kind: 'notFound' })
        })
    })
})

describe('renderDirectoryListing', () => {
    it('renders a link per entry, directories first', () => {
        const html = renderDirectoryListing('/docs', [
            { name: 'guides', isDirectory: true },
            { name: 'readme.txt', isDirectory: false },
        ])
        expect(html).toContain('href="guides/"')
        expect(html).toContain('href="readme.txt"')
    })

    it('includes a parent-directory link for a nested path', () => {
        const html = renderDirectoryListing('/docs/guides', [])
        expect(html).toContain('href="..')
    })

    it('omits a parent-directory link at the served root', () => {
        const html = renderDirectoryListing('/', [])
        expect(html).not.toContain('href="..')
    })
})
