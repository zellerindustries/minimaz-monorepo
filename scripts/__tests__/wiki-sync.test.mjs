import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildWikiTree, pageName, parseRepo, rewriteLinks } from '../wiki-sync.mjs'

describe('pageName', () => {
    it('maps README.md to Home', () => {
        expect(pageName('README.md')).toBe('Home')
    })

    it('strips the .md extension from other docs', () => {
        expect(pageName('getting-started.md')).toBe('getting-started')
        expect(pageName('CODE_OF_CONDUCT.md')).toBe('CODE_OF_CONDUCT')
    })
})

describe('parseRepo', () => {
    it.each([
        [
            'git@github.com:zellerindustries/minimaz-monorepo.git',
            'zellerindustries/minimaz-monorepo',
        ],
        [
            'https://github.com/zellerindustries/minimaz-monorepo.git',
            'zellerindustries/minimaz-monorepo',
        ],
        [
            'https://github.com/zellerindustries/minimaz-monorepo',
            'zellerindustries/minimaz-monorepo',
        ],
        [
            'https://github.com/zellerindustries/minimaz-monorepo/\n',
            'zellerindustries/minimaz-monorepo',
        ],
    ])('extracts owner/name from %s', (url, expected) => {
        expect(parseRepo(url)).toBe(expected)
    })

    it('throws for a non-GitHub remote', () => {
        expect(() => parseRepo('https://example.com/a/b.git')).toThrow(/GitHub repository/)
    })
})

const kinds = { 'README.md': 'file', 'packages/core': 'dir' }

function makeOptions(overrides = {}) {
    const warnings = []
    return {
        sourceFile: 'docs/getting-started.md',
        docsPages: new Set(['README.md', 'architecture.md', 'CONTRIBUTING.md']),
        repo: 'o/r',
        kindOf: (repoPath) => kinds[repoPath] ?? null,
        warn: (message) => warnings.push(message),
        warnings,
        ...overrides,
    }
}

describe('rewriteLinks', () => {
    it('leaves external, mailto and anchor-only links alone', () => {
        const text = '[a](https://x.dev/a.md) [b](#top) [c](mailto:x@y.z)'
        expect(rewriteLinks(text, makeOptions())).toBe(text)
    })

    it('turns links between docs into wiki page links, keeping fragments', () => {
        expect(rewriteLinks('[a](architecture.md#layout)', makeOptions())).toBe(
            '[a](architecture#layout)',
        )
        expect(rewriteLinks('[h](README.md)', makeOptions())).toBe('[h](Home)')
    })

    it('turns other repo paths into absolute GitHub URLs', () => {
        expect(rewriteLinks('[r](../README.md#installation)', makeOptions())).toBe(
            '[r](https://github.com/o/r/blob/main/README.md#installation)',
        )
        expect(rewriteLinks('[c](../packages/core)', makeOptions())).toBe(
            '[c](https://github.com/o/r/tree/main/packages/core)',
        )
    })

    it('does not double the slash for a directory link with a trailing slash', () => {
        expect(rewriteLinks('[c](../packages/core/)', makeOptions())).toBe(
            '[c](https://github.com/o/r/tree/main/packages/core)',
        )
    })

    it('keeps a link title', () => {
        expect(rewriteLinks('[a](architecture.md "Arch")', makeOptions())).toBe(
            '[a](architecture "Arch")',
        )
    })

    it('rewrites links whose text contains inline code', () => {
        expect(rewriteLinks('[`@minimaz/core`](../packages/core)', makeOptions())).toBe(
            '[`@minimaz/core`](https://github.com/o/r/tree/main/packages/core)',
        )
    })

    it('drops links into .claude/ but keeps their text', () => {
        expect(rewriteLinks('see [status](../.claude/status.md) now', makeOptions())).toBe(
            'see status now',
        )
        expect(rewriteLinks('[`status`](../.claude/status.md)', makeOptions())).toBe('`status`')
    })

    it('leaves fenced code blocks and inline code spans untouched', () => {
        const text = [
            '```md',
            '[a](architecture.md)',
            '```',
            'and `[a](architecture.md)` inline',
        ].join('\n')
        expect(rewriteLinks(text, makeOptions())).toBe(text)
    })

    it('leaves images untouched', () => {
        expect(rewriteLinks('![i](../logo.png)', makeOptions())).toBe('![i](../logo.png)')
    })

    it('warns and leaves a link whose target does not exist', () => {
        const options = makeOptions()
        expect(rewriteLinks('[x](../nope.md)', options)).toBe('[x](../nope.md)')
        expect(options.warnings).toHaveLength(1)
        expect(options.warnings[0]).toContain('nope.md')
    })

    it('warns and leaves a link that escapes the repository', () => {
        const options = makeOptions()
        expect(rewriteLinks('[x](../../outside.md)', options)).toBe('[x](../../outside.md)')
        expect(options.warnings).toHaveLength(1)
    })
})

describe('buildWikiTree', () => {
    let root
    let repoRoot
    let outDir

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'wiki-sync-'))
        repoRoot = join(root, 'repo')
        outDir = join(root, 'wiki')
        await mkdir(join(repoRoot, 'docs', 'sub'), { recursive: true })
        await mkdir(join(outDir, '.git'), { recursive: true })
        await writeFile(
            join(repoRoot, 'docs', 'README.md'),
            '# Minimaz docs\n\n[a](architecture.md)\n',
        )
        await writeFile(join(repoRoot, 'docs', 'architecture.md'), '# Architecture\n')
        await writeFile(join(repoRoot, 'docs', 'notes.txt'), 'not a page')
        await writeFile(join(repoRoot, 'docs', 'sub', 'x.md'), '# Nested\n')
        await writeFile(join(outDir, 'Old.md'), 'stale')
        await writeFile(join(outDir, '.git', 'HEAD'), 'ref: refs/heads/master\n')
    })

    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })

    it('writes pages and a sidebar, keeps .git, deletes stale pages, ignores non-md and nested files', async () => {
        const { pages } = await buildWikiTree({ repoRoot, outDir, repo: 'o/r' })

        expect((await readdir(outDir)).sort()).toEqual([
            '.git',
            'Home.md',
            '_Sidebar.md',
            'architecture.md',
        ])
        expect(await readFile(join(outDir, 'Home.md'), 'utf8')).toBe(
            '# Minimaz docs\n\n[a](architecture)\n',
        )
        expect(await readFile(join(outDir, '_Sidebar.md'), 'utf8')).toBe(
            '- [Minimaz docs](Home)\n- [Architecture](architecture)\n',
        )
        expect(await readFile(join(outDir, '.git', 'HEAD'), 'utf8')).toBe(
            'ref: refs/heads/master\n',
        )
        expect(pages.map((page) => page.name)).toEqual(['Home', 'architecture'])
    })

    it('puts Home first and sorts the rest case-insensitively', async () => {
        await writeFile(join(repoRoot, 'docs', 'CONTRIBUTING.md'), '# Contributing\n')
        await writeFile(join(repoRoot, 'docs', 'getting-started.md'), '# Getting started\n')
        const { pages } = await buildWikiTree({ repoRoot, outDir, repo: 'o/r' })
        expect(pages.map((page) => page.name)).toEqual([
            'Home',
            'architecture',
            'CONTRIBUTING',
            'getting-started',
        ])
    })

    it('falls back to the page name when a file has no heading', async () => {
        await writeFile(join(repoRoot, 'docs', 'plain.md'), 'no heading here\n')
        const { pages } = await buildWikiTree({ repoRoot, outDir, repo: 'o/r' })
        expect(pages.find((page) => page.name === 'plain')?.title).toBe('plain')
    })

    it('throws a clear error when docs/README.md is missing', async () => {
        await rm(join(repoRoot, 'docs', 'README.md'))
        await expect(buildWikiTree({ repoRoot, outDir, repo: 'o/r' })).rejects.toThrow(
            /docs\/README\.md/,
        )
    })

    it('refuses to clear the repo root or one of its ancestors', async () => {
        await expect(buildWikiTree({ repoRoot, outDir: repoRoot, repo: 'o/r' })).rejects.toThrow(
            /Refusing/,
        )
        await expect(buildWikiTree({ repoRoot, outDir: root, repo: 'o/r' })).rejects.toThrow(
            /Refusing/,
        )
        expect(await readFile(join(repoRoot, 'docs', 'architecture.md'), 'utf8')).toBe(
            '# Architecture\n',
        )
    })

    it('reports unresolvable links through warn without failing', async () => {
        await writeFile(
            join(repoRoot, 'docs', 'architecture.md'),
            '# Architecture\n[x](../missing.md)\n',
        )
        const warnings = []
        await buildWikiTree({
            repoRoot,
            outDir,
            repo: 'o/r',
            warn: (message) => warnings.push(message),
        })
        expect(warnings).toHaveLength(1)
        expect(warnings[0]).toContain('missing.md')
    })
})
