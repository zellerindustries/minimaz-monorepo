import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isDependencyPath } from '../main.js'

describe('isDependencyPath', () => {
    it('protects real dependency content', () => {
        expect(isDependencyPath(join('packages', 'core', 'node_modules', 'esbuild', 'dist'))).toBe(
            true,
        )
    })

    it('does not protect node_modules itself', () => {
        expect(isDependencyPath(join('packages', 'core', 'node_modules'))).toBe(false)
    })

    it("does not protect this repo's own tsc cache under node_modules/.cache", () => {
        expect(isDependencyPath(join('packages', 'core', 'node_modules', '.cache', 'tsc'))).toBe(
            false,
        )
    })

    it('does not treat a directory merely prefixed by "node_modules" as dependency content', () => {
        expect(isDependencyPath(join('packages', 'core', 'node_modules_backup', 'dist'))).toBe(
            false,
        )
    })

    it('does not match when there is no node_modules segment at all', () => {
        expect(isDependencyPath(join('packages', 'core', 'dist'))).toBe(false)
    })
})
