import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { resolveRepoRoot, resolveTargetDirs } from '../main.js'

describe('resolveRepoRoot', () => {
    it('resolves the monorepo root three levels above tools/builder/dist/main.js, regardless of cwd', () => {
        const distMainPath = join(
            'C:',
            'dev',
            'projects',
            'minimaz',
            'minimaz-monorepo',
            'tools',
            'builder',
            'dist',
            'main.js',
        )
        const moduleUrl = pathToFileURL(distMainPath).toString()

        const result = resolveRepoRoot(moduleUrl)

        expect(result).toBe(join('C:', 'dev', 'projects', 'minimaz', 'minimaz-monorepo'))
    })
})

describe('resolveTargetDirs', () => {
    const repoRoot = join('C:', 'dev', 'projects', 'minimaz-monorepo')
    const allDirs = [
        join(repoRoot, 'packages', 'core'),
        join(repoRoot, 'packages', 'css'),
        join(repoRoot, 'tools', 'builder'),
    ]

    it('builds every discovered package when invoked from the repo root', () => {
        expect(resolveTargetDirs(repoRoot, repoRoot, allDirs)).toBe(allDirs)
    })

    it('builds only cwd when invoked from a single package directory', () => {
        const cwd = join(repoRoot, 'packages', 'css')

        expect(resolveTargetDirs(cwd, repoRoot, allDirs)).toEqual([cwd])
    })
})
