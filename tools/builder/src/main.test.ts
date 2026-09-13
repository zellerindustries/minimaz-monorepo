import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { resolveRepoRoot } from './main.js'

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
