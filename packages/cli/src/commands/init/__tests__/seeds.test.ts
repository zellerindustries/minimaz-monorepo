import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { loadConfig } from '@minimaz/config'
import { pathExists } from '@minimaz/core'
import { KnownError } from '@minimaz/logger'
import { seedDefaults } from '@minimaz/templates'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../build/main.js'
import { buildDocs } from '../../docs/main.js'
import { init } from '../main.js'

describe('bundled seed templates', () => {
    let root: string
    let templatesDir: string

    beforeEach(async () => {
        root = await mkdtemp(path.join(tmpdir(), 'seed-templates-'))
        templatesDir = path.join(root, 'templates')
        await seedDefaults(root, templatesDir)
    })

    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })

    /** Scaffolds `template` into a fresh project dir (npm/git off) and returns that dir. */
    async function scaffold(template: string): Promise<string> {
        const targetDir = path.join(root, `project-${template}`)
        await init('project', { template, npm: false, git: false }, targetDir, templatesDir)
        return targetDir
    }

    describe('simple', () => {
        it('builds into index.html, style.css, script.js and the favicon', async () => {
            const dir = await scaffold('simple')
            await build(dir)

            for (const file of ['index.html', 'style.css', 'script.js', 'public/favicon.ico']) {
                expect(await pathExists(path.join(dir, 'dist', file)), file).toBe(true)
            }
            expect(await pathExists(path.join(dir, 'dist', 'pages'))).toBe(false)
            expect(await pathExists(path.join(dir, '.gitignore'))).toBe(false)
        })

        it('references its assets with paths that exist in the build', async () => {
            const dir = await scaffold('simple')
            await build(dir)

            const html = await readFile(path.join(dir, 'dist', 'index.html'), 'utf8')
            expect(html).toContain('style.css')
            expect(html).toContain('script.js')
        })
    })

    describe('default', () => {
        /** Every `.html` path under `dir`, relative to it, with forward slashes. */
        async function htmlFiles(dir: string, rel = ''): Promise<string[]> {
            const found: string[] = []
            for (const entry of await readdir(path.join(dir, rel), { withFileTypes: true })) {
                const next = rel === '' ? entry.name : `${rel}/${entry.name}`
                if (entry.isDirectory()) {
                    found.push(...(await htmlFiles(dir, next)))
                } else if (entry.name.endsWith('.html')) {
                    found.push(next)
                }
            }
            return found
        }

        /** Root-absolute `href`/`src` values in `html` (no externals, anchors or mailto). */
        function internalRefs(html: string): string[] {
            const refs: string[] = []
            for (const match of html.matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
                if (match[1] !== undefined && !match[1].startsWith('//')) {
                    refs.push(match[1])
                }
            }
            return refs
        }

        /** True when `ref` maps to an emitted file, directly or via clean URLs. */
        async function resolves(dist: string, ref: string): Promise<boolean> {
            const rel = ref.replace(/^\//, '')
            const candidates =
                rel === '' ? ['index.html'] : [rel, `${rel}.html`, `${rel}/index.html`]
            for (const candidate of candidates) {
                const full = path.join(dist, candidate)
                if ((await pathExists(full)) && (await readdir(full).catch(() => null)) === null) {
                    return true
                }
            }
            return false
        }

        it('ships a serve section and keeps js bundling off', async () => {
            const dir = await scaffold('default')
            expect(await pathExists(path.join(dir, '.gitignore'))).toBe(false)
            const config = await loadConfig(dir)
            expect(config.output.js.bundling).toBe(false)
            expect(config.output.css.bundling).toBe(true)
            expect(config.serve.cleanUrls).toBe(true)
            expect(config.output.replace).toMatchObject({
                _DOMAIN_: 'example.com',
                _SITE_NAME_: 'Acme Studio',
            })
        })

        it('builds the landing page, one bundled stylesheet and the static SEO files', async () => {
            const dir = await scaffold('default')
            await build(dir)
            const dist = path.join(dir, 'dist')

            for (const file of [
                'index.html',
                'style.css',
                'favicon.ico',
                'logo.svg',
                'og-cover.svg',
                'robots.txt',
                'sitemap.xml',
                'llms.txt',
                '.well-known/security.txt',
            ]) {
                expect(await pathExists(path.join(dist, file)), file).toBe(true)
            }
            const css = await readFile(path.join(dist, 'style.css'), 'utf8')
            expect(css).not.toContain('@import')
            for (const partial of ['root', 'base', 'header', 'hero', 'footer', 'form']) {
                expect(await pathExists(path.join(dist, `${partial}.css`)), partial).toBe(false)
            }
        })

        it('replaces both placeholders and resolves every internal reference', async () => {
            const dir = await scaffold('default')
            await build(dir)
            const dist = path.join(dir, 'dist')

            for (const file of await htmlFiles(dist)) {
                const html = await readFile(path.join(dist, file), 'utf8')
                expect(html, file).not.toContain('_DOMAIN_')
                expect(html, file).not.toContain('_SITE_NAME_')
                expect(html, file).toContain('https://example.com')
                for (const ref of internalRefs(html)) {
                    expect(await resolves(dist, ref), `${file} -> ${ref}`).toBe(true)
                }
            }
        })

        it('contains no stale branding', async () => {
            const dir = await scaffold('default')
            const hits: string[] = []
            async function scan(rel: string): Promise<void> {
                for (const entry of await readdir(path.join(dir, rel), { withFileTypes: true })) {
                    const next = path.join(rel, entry.name)
                    if (entry.isDirectory()) {
                        await scan(next)
                    } else if (!entry.name.endsWith('.ico')) {
                        const text = await readFile(path.join(dir, next), 'utf8')
                        if (/zeller|minimaz|bootstrap-icons/i.test(text)) {
                            hits.push(next)
                        }
                    }
                }
            }
            await scan('src')
            expect(hits).toEqual([])
        })
    })

    describe('docs', () => {
        it('renders every markdown page to html', async () => {
            const dir = await scaffold('docs')
            await buildDocs(dir)

            expect(await pathExists(path.join(dir, '.gitignore'))).toBe(false)

            const htmlDir = path.join(dir, 'dist-docs', 'html')
            const files = (await readdir(htmlDir)).filter((name) => name.endsWith('.html'))
            expect(files.sort()).toEqual(['getting-started.html', 'index.html', 'writing.html'])
        })

        it('links only to pages that exist in the html output', async () => {
            const dir = await scaffold('docs')
            await buildDocs(dir)

            const htmlDir = path.join(dir, 'dist-docs', 'html')
            for (const name of await readdir(htmlDir)) {
                if (!name.endsWith('.html')) {
                    continue
                }
                const html = await readFile(path.join(htmlDir, name), 'utf8')
                for (const match of html.matchAll(/href="([^"]*)"/g)) {
                    const href = match[1] ?? ''
                    if (href === '' || /^([a-z][a-z0-9+.-]*:|#|\/)/i.test(href)) {
                        continue
                    }
                    const target = path.join(htmlDir, href.split(/[#?]/)[0] ?? '')
                    expect(await pathExists(target), `${name} -> ${href}`).toBe(true)
                }
            }
        })

        it('has no site sources, so build fails with a user-facing error', async () => {
            const dir = await scaffold('docs')
            await expect(build(dir)).rejects.toBeInstanceOf(KnownError)
        })
    })
})
