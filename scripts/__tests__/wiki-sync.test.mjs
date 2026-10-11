import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import {
    copyFile,
    mkdir,
    mkdtemp,
    readdir,
    readFile,
    rm,
    symlink,
    writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, parse } from 'node:path'
import { fileURLToPath } from 'node:url'
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

const scriptPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'wiki-sync.mjs')

// Symlinks (junctions on Windows) are only ever created inside fresh temp dirs; skip the tests if the OS refuses.
const canSymlink = (() => {
    const probe = mkdtempSync(join(tmpdir(), 'wiki-sync-probe-'))
    try {
        symlinkSync(probe, join(probe, 'link'), 'junction')
        return true
    } catch {
        return false
    } finally {
        rmSync(probe, { recursive: true, force: true })
    }
})()

const kinds = {
    'README.md': 'file',
    'packages/core': 'dir',
    'logo.png': 'file',
    'docs/img/a.png': 'file',
    '..foo.md': 'file',
}

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

    it('leaves external images untouched', () => {
        const text = '![i](https://x.dev/a.png)'
        expect(rewriteLinks(text, makeOptions())).toBe(text)
    })

    it('turns relative images into raw GitHub URLs', () => {
        expect(rewriteLinks('![logo](../logo.png)', makeOptions())).toBe(
            '![logo](https://github.com/o/r/raw/main/logo.png)',
        )
    })

    it('warns and leaves a relative image that does not exist', () => {
        const options = makeOptions()
        expect(rewriteLinks('![i](../nope.png)', options)).toBe('![i](../nope.png)')
        expect(options.warnings).toHaveLength(1)
    })

    it('drops images under .claude/ keeping only the alt text', () => {
        expect(rewriteLinks('x ![shot](../.claude/s.png) y', makeOptions())).toBe('x shot y')
    })

    it('rewrites the outer target and the inner image of a linked image', () => {
        expect(rewriteLinks('[![alt](img/a.png)](architecture.md)', makeOptions())).toBe(
            '[![alt](https://github.com/o/r/raw/main/docs/img/a.png)](architecture)',
        )
        expect(rewriteLinks('[![alt](../.claude/a.png)](architecture.md)', makeOptions())).toBe(
            '[alt](architecture)',
        )
    })

    it('only closes a fence with the same character and at least the same length', () => {
        const link = '[a](architecture.md)'
        const out = '[a](architecture)'
        const tilde = ['~~~', '```', link, '```', '~~~', link].join('\n')
        expect(rewriteLinks(tilde, makeOptions())).toBe(
            ['~~~', '```', link, '```', '~~~', out].join('\n'),
        )
        const long = ['````', '```', link, '````', link].join('\n')
        expect(rewriteLinks(long, makeOptions())).toBe(
            ['````', '```', link, '````', out].join('\n'),
        )
        const info = ['```', '```js', link, '```', link].join('\n')
        expect(rewriteLinks(info, makeOptions())).toBe(
            ['```', '```js', link, '```', out].join('\n'),
        )
    })

    it('accepts angle-bracket targets', () => {
        const options = makeOptions({
            docsPages: new Set(['README.md', 'x y.md', 'architecture.md']),
        })
        expect(rewriteLinks('[a](<architecture.md>)', options)).toBe('[a](architecture)')
        expect(rewriteLinks('[a](<x y.md>)', options)).toBe('[a](<x y>)')
    })

    it('links the repo root without a warning', () => {
        const options = makeOptions()
        expect(rewriteLinks('[root](../)', options)).toBe(
            '[root](https://github.com/o/r/tree/main)',
        )
        expect(options.warnings).toEqual([])
    })

    it('does not treat a file named ..foo as outside the repository', () => {
        const options = makeOptions()
        expect(rewriteLinks('[f](../..foo.md)', options)).toBe(
            '[f](https://github.com/o/r/blob/main/..foo.md)',
        )
        expect(options.warnings).toEqual([])
    })

    it('rewrites reference-style definitions outside fences', () => {
        const text = [
            '[a]: architecture.md "T"',
            '[b]: ../packages/core',
            '[c]: https://x.dev',
            '[^1]: footnote text',
            '```',
            '[d]: architecture.md',
            '```',
        ].join('\n')
        expect(rewriteLinks(text, makeOptions())).toBe(
            [
                '[a]: architecture "T"',
                '[b]: https://github.com/o/r/tree/main/packages/core',
                '[c]: https://x.dev',
                '[^1]: footnote text',
                '```',
                '[d]: architecture.md',
                '```',
            ].join('\n'),
        )
    })

    it('removes reference-style definitions that point under .claude/', () => {
        expect(rewriteLinks('a\n[s]: ../.claude/status.md\nb', makeOptions())).toBe('a\nb')
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

    it('refuses an output dir inside the repo and keeps tracked files', async () => {
        await mkdir(join(repoRoot, 'scripts'), { recursive: true })
        await expect(
            buildWikiTree({ repoRoot, outDir: join(repoRoot, 'docs'), repo: 'o/r' }),
        ).rejects.toThrow(/Refusing/)
        await expect(
            buildWikiTree({ repoRoot, outDir: join(repoRoot, 'scripts'), repo: 'o/r' }),
        ).rejects.toThrow(/Refusing/)
        expect(await readFile(join(repoRoot, 'docs', 'architecture.md'), 'utf8')).toBe(
            '# Architecture\n',
        )
    })

    it('refuses the filesystem root and keeps tracked files', async () => {
        await expect(
            buildWikiTree({ repoRoot, outDir: parse(repoRoot).root, repo: 'o/r' }),
        ).rejects.toThrow(/Refusing/)
        expect(await readFile(join(repoRoot, 'docs', 'architecture.md'), 'utf8')).toBe(
            '# Architecture\n',
        )
    })

    it.runIf(process.platform === 'win32' || process.platform === 'darwin')(
        'refuses the repo root when its case differs',
        async () => {
            await expect(
                buildWikiTree({ repoRoot, outDir: repoRoot.toUpperCase(), repo: 'o/r' }),
            ).rejects.toThrow(/Refusing/)
            expect(await readFile(join(repoRoot, 'docs', 'architecture.md'), 'utf8')).toBe(
                '# Architecture\n',
            )
        },
    )

    it('refuses a non-empty output dir without .git and keeps its files', async () => {
        const stray = join(root, 'stray')
        await mkdir(stray)
        await writeFile(join(stray, 'keep.txt'), 'precious')
        await expect(buildWikiTree({ repoRoot, outDir: stray, repo: 'o/r' })).rejects.toThrow(
            /Refusing/,
        )
        expect(await readFile(join(stray, 'keep.txt'), 'utf8')).toBe('precious')
    })

    it('accepts an existing empty output dir', async () => {
        const empty = join(root, 'empty')
        await mkdir(empty)
        await buildWikiTree({ repoRoot, outDir: empty, repo: 'o/r' })
        expect((await readdir(empty)).sort()).toEqual(['Home.md', '_Sidebar.md', 'architecture.md'])
    })

    it('accepts a nonexistent output dir', async () => {
        const fresh = join(root, 'fresh', 'wiki')
        await buildWikiTree({ repoRoot, outDir: fresh, repo: 'o/r' })
        expect((await readdir(fresh)).sort()).toEqual(['Home.md', '_Sidebar.md', 'architecture.md'])
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

    it('takes the sidebar title from the first heading outside fences', async () => {
        await writeFile(
            join(repoRoot, 'docs', 'fenced.md'),
            '```md\n# Not the title\n```\n\n# Real title\n',
        )
        const { pages } = await buildWikiTree({ repoRoot, outDir, repo: 'o/r' })
        expect(pages.find((page) => page.name === 'fenced')?.title).toBe('Real title')
    })

    it('does not read a title across lines', async () => {
        await writeFile(join(repoRoot, 'docs', 'bare.md'), '#\nbody text\n')
        const { pages } = await buildWikiTree({ repoRoot, outDir, repo: 'o/r' })
        expect(pages.find((page) => page.name === 'bare')?.title).toBe('bare')
    })

    it.each(['Home.md', '_Sidebar.md'])(
        'throws when docs/%s collides with a generated page',
        async (file) => {
            await writeFile(join(repoRoot, 'docs', file), '# Clash\n')
            await expect(buildWikiTree({ repoRoot, outDir, repo: 'o/r' })).rejects.toThrow(
                /collides/,
            )
            expect(await readFile(join(outDir, 'Old.md'), 'utf8')).toBe('stale')
        },
    )

    it('wraps a failure to read the output dir with a cause', async () => {
        const file = join(root, 'plain-file')
        await writeFile(file, 'x')
        const error = await buildWikiTree({ repoRoot, outDir: file, repo: 'o/r' }).catch(
            (caught) => caught,
        )
        expect(error).toBeInstanceOf(Error)
        expect(error.message).toContain('Cannot read output directory')
        expect(error.cause).toBeInstanceOf(Error)
        expect(await readFile(file, 'utf8')).toBe('x')
    })

    it.runIf(canSymlink)('refuses an output dir that is a symlink to the repo root', async () => {
        const link = join(root, 'link-to-repo')
        await symlink(repoRoot, link, 'junction')
        await expect(buildWikiTree({ repoRoot, outDir: link, repo: 'o/r' })).rejects.toThrow(
            /overlaps the repository root/,
        )
        expect(await readFile(join(repoRoot, 'docs', 'architecture.md'), 'utf8')).toBe(
            '# Architecture\n',
        )
    })

    it.runIf(canSymlink)('refuses a symlink to an ancestor of the repo', async () => {
        const link = join(root, 'link-to-root')
        await symlink(root, link, 'junction')
        await expect(buildWikiTree({ repoRoot, outDir: link, repo: 'o/r' })).rejects.toThrow(
            /overlaps the repository root/,
        )
    })

    it.runIf(canSymlink)('refuses a nonexistent dir below a symlink into the repo', async () => {
        const link = join(root, 'link-to-repo')
        await symlink(repoRoot, link, 'junction')
        await expect(
            buildWikiTree({ repoRoot, outDir: join(link, 'newdir'), repo: 'o/r' }),
        ).rejects.toThrow(/overlaps the repository root/)
        expect(await readdir(repoRoot)).toEqual(['docs'])
    })

    it.runIf(canSymlink)('refuses when the repo root is given through a symlink', async () => {
        const alias = join(root, 'repo-alias')
        await symlink(repoRoot, alias, 'junction')
        await expect(
            buildWikiTree({ repoRoot: alias, outDir: join(repoRoot, 'newdir'), repo: 'o/r' }),
        ).rejects.toThrow(/overlaps the repository root/)
        expect(await readdir(repoRoot)).toEqual(['docs'])
    })
})

describe('command line', () => {
    let base
    let scriptsDir
    let env

    beforeEach(async () => {
        base = await mkdtemp(join(tmpdir(), 'wiki-sync-cli-'))
        scriptsDir = join(base, 'repo', 'scripts')
        await mkdir(scriptsDir, { recursive: true })
        await mkdir(join(base, 'repo', 'docs'))
        await copyFile(scriptPath, join(scriptsDir, 'wiki-sync.mjs'))
        await writeFile(join(base, 'repo', 'docs', 'README.md'), '# Docs\n')
        env = { ...process.env, GITHUB_REPOSITORY: 'o/r' }
    })

    afterEach(async () => {
        await rm(base, { recursive: true, force: true })
    })

    function run(script, args, runEnv = env) {
        return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: runEnv })
    }

    it('builds the tree into a fresh temp dir', async () => {
        const out = join(base, 'out')
        const result = run(join(scriptsDir, 'wiki-sync.mjs'), [out])
        expect(result.status).toBe(0)
        expect((await readdir(out)).sort()).toEqual(['Home.md', '_Sidebar.md'])
    })

    it('prints the cause chain on failure', async () => {
        const file = join(base, 'plain-file')
        await writeFile(file, 'x')
        const result = run(join(scriptsDir, 'wiki-sync.mjs'), [file])
        expect(result.status).toBe(1)
        expect(result.stderr).toContain('Cannot read output directory')
        expect(result.stderr).toContain('  caused by: ')
    })

    it('explains how to set the repository when origin cannot be read', () => {
        const noRepo = { ...env, GIT_DIR: join(base, 'no-such-git-dir') }
        delete noRepo.GITHUB_REPOSITORY
        const result = run(join(scriptsDir, 'wiki-sync.mjs'), [join(base, 'out')], noRepo)
        expect(result.status).toBe(1)
        expect(result.stderr).toContain('Set GITHUB_REPOSITORY or add an origin remote')
        expect(result.stderr).toContain('  caused by: ')
    })

    it.runIf(canSymlink)('still runs when started through a symlinked path', async () => {
        const alias = join(base, 'scripts-alias')
        await symlink(scriptsDir, alias, 'junction')
        const out = join(base, 'out')
        const result = run(join(alias, 'wiki-sync.mjs'), [out])
        expect(result.status).toBe(0)
        expect((await readdir(out)).sort()).toEqual(['Home.md', '_Sidebar.md'])
    })
})
