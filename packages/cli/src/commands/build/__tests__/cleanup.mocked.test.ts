import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type * as MinimazCore from '@minimaz/core'
import { remove } from '@minimaz/core'
import { log } from '@minimaz/logger'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getBuildOldDirName, getBuildTempDirName, replaceOutDir } from '../core.js'
import { build } from '../main.js'

// `remove` is the one filesystem call these cleanup paths cannot be made to
// fail portably with real files (rm with force swallows ENOENT, and a locked
// directory behaves differently per platform), so it wraps the real
// implementation and rejects only for the call a test targets.
vi.mock('@minimaz/core', async (importOriginal) => {
    const actual = await importOriginal<typeof MinimazCore>()
    return { ...actual, remove: vi.fn(actual.remove) }
})

async function realRemove(target: string): Promise<void> {
    await rm(target, { recursive: true, force: true })
}

describe('build cleanup when removal fails', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(path.join(tmpdir(), 'cli-build-cleanup-'))
        await writeFile(
            path.join(cwd, 'minimaz.config.json'),
            JSON.stringify({
                input: { dir: 'src' },
                output: { dir: 'dist', css: { bundling: true, minify: false } },
            }),
            'utf8',
        )
        await mkdir(path.join(cwd, 'src'), { recursive: true })
        await writeFile(path.join(cwd, 'src', 'main.css'), '@import "./missing.css";', 'utf8')
    })

    afterEach(async () => {
        await realRemove(cwd)
    })

    function failTempCleanup(rejection: unknown): void {
        const tempDir = getBuildTempDirName(path.join(cwd, 'dist'))
        let tempCalls = 0
        vi.mocked(remove).mockImplementation(async (target: string) => {
            if (target === tempDir) {
                tempCalls += 1
                // The first call is the pre-build clean slate; the second is the failure cleanup.
                if (tempCalls > 1) {
                    throw rejection
                }
            }
            await realRemove(target)
        })
    }

    it('warns about the leftover temp dir without masking the original build error', async () => {
        const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => undefined)
        failTempCleanup(new Error('EBUSY: locked'))

        await expect(build(cwd)).rejects.toThrow(/file not found/)

        expect(warnSpy).toHaveBeenCalledWith(
            `build: could not remove temp directory ${getBuildTempDirName(path.join(cwd, 'dist'))}: EBUSY: locked`,
        )
    })

    it('stringifies a non-Error cleanup failure in the warning', async () => {
        const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => undefined)
        failTempCleanup('handle still open')

        await expect(build(cwd)).rejects.toThrow(/file not found/)

        expect(warnSpy).toHaveBeenCalledWith(
            `build: could not remove temp directory ${getBuildTempDirName(path.join(cwd, 'dist'))}: handle still open`,
        )
    })
})

describe('replaceOutDir when removing the previous output backup fails', () => {
    let dir: string

    beforeEach(async () => {
        dir = await mkdtemp(path.join(tmpdir(), 'cli-replace-cleanup-'))
    })

    afterEach(async () => {
        await realRemove(dir)
    })

    it('still completes the swap and only warns', async () => {
        const outDir = path.join(dir, 'dist')
        const tempDir = getBuildTempDirName(outDir)
        const oldDir = getBuildOldDirName(outDir)
        await mkdir(outDir, { recursive: true })
        await writeFile(path.join(outDir, 'old.txt'), 'old', 'utf8')
        await mkdir(tempDir, { recursive: true })
        await writeFile(path.join(tempDir, 'new.txt'), 'new', 'utf8')
        const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => undefined)
        let oldCalls = 0
        vi.mocked(remove).mockImplementation(async (target: string) => {
            if (target === oldDir) {
                oldCalls += 1
                // The first call clears a stale backup; the second removes the swapped-out output.
                if (oldCalls > 1) {
                    throw new Error('EPERM: cannot remove')
                }
            }
            await realRemove(target)
        })

        await replaceOutDir(tempDir, outDir, { retryDelayMs: 0 })

        expect(await readFile(path.join(outDir, 'new.txt'), 'utf8')).toBe('new')
        expect(warnSpy).toHaveBeenCalledWith(
            `build: could not remove previous output ${oldDir}: EPERM: cannot remove`,
        )
    })
})
