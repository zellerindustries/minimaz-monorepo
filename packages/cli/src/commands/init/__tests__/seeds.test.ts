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
        it('ships a serve section and keeps js bundling off', async () => {
            const dir = await scaffold('default')
            expect(await pathExists(path.join(dir, '.gitignore'))).toBe(false)
            const config = await loadConfig(dir)
            expect(config.input.externals).toEqual({})
            expect(config.serve.cleanUrls).toBe(true)
            expect(config.serve.liveReload).toBe(true)
            expect(config.output.js.bundling).toBe(false)
        })

        it('builds a flat site with bundled css and transpiled script', async () => {
            const dir = await scaffold('default')
            await build(dir)
            const dist = path.join(dir, 'dist')

            for (const file of [
                'index.html',
                'about.html',
                'style.css',
                'main.js',
                'favicon.ico',
                'icon.svg',
            ]) {
                expect(await pathExists(path.join(dist, file)), file).toBe(true)
            }
            expect(await pathExists(path.join(dist, 'styles'))).toBe(false)
            expect(await pathExists(path.join(dist, 'main.ts'))).toBe(false)

            const css = await readFile(path.join(dist, 'style.css'), 'utf8')
            expect(css).not.toContain('@import')
            expect(css).toContain(':focus-visible')

            const js = await readFile(path.join(dist, 'main.js'), 'utf8')
            expect(js).not.toMatch(/:\s*(HTMLElement|HTMLButtonElement|boolean)\b/)
            expect(js).toContain('aria-expanded')
        })

        it('keeps the nav usable without javascript', async () => {
            const dir = await scaffold('default')
            await build(dir)
            const html = await readFile(path.join(dir, 'dist', 'index.html'), 'utf8')
            // The toggle starts hidden and only main.js reveals it; the nav starts visible.
            expect(html).toMatch(/<button[^>]*class="nav-toggle"[^>]*\shidden>/)
            expect(html).not.toMatch(/<nav[^>]*\shidden/)
        })

        it('links its pages to each other and to the built assets', async () => {
            const dir = await scaffold('default')
            await build(dir)
            for (const page of ['index.html', 'about.html']) {
                const html = await readFile(path.join(dir, 'dist', page), 'utf8')
                expect(html).toContain('style.css')
                expect(html).toContain('main.js')
                expect(html).toContain('about.html')
                expect(html).not.toMatch(/(?:href|src)="\//)
            }
        })

        it('contains no retired branding or icon-font leftovers', async () => {
            const dir = await scaffold('default')
            const stale = ['minimaz-cli', 'zeller-dev', 'bootstrap', 'MrZeller']
            const walk = async (current: string): Promise<string[]> => {
                const names = await readdir(current, { withFileTypes: true })
                const nested = await Promise.all(
                    names.map((entry) =>
                        entry.isDirectory()
                            ? walk(path.join(current, entry.name))
                            : Promise.resolve([path.join(current, entry.name)]),
                    ),
                )
                return nested.flat()
            }
            for (const file of await walk(dir)) {
                if (/\.(ico|webp|woff2?)$/.test(file)) {
                    continue
                }
                const text = await readFile(file, 'utf8')
                for (const word of stale) {
                    expect(text, `${file} mentions ${word}`).not.toContain(word)
                }
            }
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
