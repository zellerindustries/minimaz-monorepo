import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { findProblems, parsePackOutput } from '../verify-packages.mjs'

const scriptPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'verify-packages.mjs')

function pack(name, paths) {
    return { name, files: paths.map((path) => ({ path })) }
}

const goodFiles = [
    'LICENSE',
    'README.md',
    'package.json',
    'dist/README.md',
    'dist/index.js',
    'dist/index.d.ts',
]

describe('parsePackOutput', () => {
    it('parses a bare JSON array', () => {
        expect(parsePackOutput('[{"name":"a","files":[]}]')).toEqual([{ name: 'a', files: [] }])
    })

    it('ignores noise printed before the array, including lines containing brackets', () => {
        const stdout = 'Bundled @minimaz/a\n[warn] odd\n[\n  {"name":"a","files":[]}\n]\n'

        expect(parsePackOutput(stdout)).toEqual([{ name: 'a', files: [] }])
    })

    it('throws when there is no JSON array', () => {
        expect(() => parsePackOutput('npm ERR! nope')).toThrow(/no JSON output/)
    })

    it('throws when the JSON is truncated', () => {
        expect(() => parsePackOutput('[\n  {"name":')).toThrow(/not valid JSON/)
    })
})

describe('findProblems', () => {
    it('returns nothing for a clean package', () => {
        expect(findProblems([pack('@minimaz/a', goodFiles)])).toEqual([])
    })

    it('allows seed templates that carry their own src/ under dist/', () => {
        const files = [...goodFiles, 'dist/seeds/simple/src/index.html']

        expect(findProblems([pack('@minimaz/templates', files)])).toEqual([])
    })

    it('flags a missing LICENSE', () => {
        const files = goodFiles.filter((file) => file !== 'LICENSE')

        expect(findProblems([pack('@minimaz/a', files)])).toEqual(['@minimaz/a: missing LICENSE'])
    })

    it('flags a missing dist/', () => {
        const problems = findProblems([pack('@minimaz/a', ['LICENSE', 'package.json'])])

        expect(problems).toHaveLength(1)
        expect(problems[0]).toContain('@minimaz/a: contains no dist/ files')
    })

    it('flags a missing dist/README.md', () => {
        const files = goodFiles.filter((file) => file !== 'dist/README.md')

        expect(findProblems([pack('@minimaz/a', files)])).toEqual([
            '@minimaz/a: missing dist/README.md',
        ])
    })

    it.each([
        ['src/index.ts', 'source file'],
        ['dist/__tests__/core.js', 'test directory'],
        ['dist/core.test.js', 'compiled test file'],
        ['dist/core.spec.d.ts', 'compiled test file'],
        ['tsconfig.tsbuildinfo', 'tsbuildinfo cache'],
        ['.claude/CLAUDE.md', '.claude directory'],
        ['.env', 'env file'],
        ['dist/.env.local', 'env file'],
    ])('flags %s', (path, label) => {
        const problems = findProblems([pack('@minimaz/a', [...goodFiles, path])])

        expect(problems).toHaveLength(1)
        expect(problems[0]).toContain(`@minimaz/a: unexpected ${label}`)
        expect(problems[0]).toContain(path)
    })

    it('normalizes Windows separators', () => {
        const problems = findProblems([pack('@minimaz/a', [...goodFiles, 'src\\index.ts'])])

        expect(problems).toHaveLength(1)
    })

    it('reports offenders across several packages', () => {
        const problems = findProblems([
            pack('@minimaz/a', goodFiles),
            pack('@minimaz/b', ['package.json', 'dist/README.md', 'dist/x.js']),
            pack('@minimaz/c', [...goodFiles, 'src/x.ts']),
        ])

        expect(problems).toHaveLength(2)
        expect(problems[0]).toBe('@minimaz/b: missing LICENSE')
        expect(problems[1]).toContain('@minimaz/c: unexpected source file src/x.ts')
    })

    it('fails when npm pack reported nothing', () => {
        expect(findProblems([])).toEqual(['npm pack reported no packages'])
    })
})

describe('verify-packages.mjs as a module', () => {
    it('does not run npm pack when imported, only when it is the entry point', () => {
        const specifier = JSON.stringify(pathToFileURL(scriptPath).href)

        const result = spawnSync(
            process.execPath,
            ['--input-type=module', '-e', `await import(${specifier})`],
            { encoding: 'utf8' },
        )

        expect(result.status).toBe(0)
        expect(result.stdout).toBe('')
    })
})
