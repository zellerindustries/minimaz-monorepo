import { describe, expect, it } from 'vitest'
import { pageName, parseRepo, rewriteLinks } from '../wiki-sync.mjs'

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
