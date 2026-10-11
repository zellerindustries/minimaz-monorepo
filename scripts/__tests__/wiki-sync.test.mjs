import { describe, expect, it } from 'vitest'
import { pageName, parseRepo } from '../wiki-sync.mjs'

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
