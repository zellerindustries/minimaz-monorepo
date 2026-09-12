import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { log } from '@minimaz/logger'
import type { Mock } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runCli } from './main.js'

describe('runCli', () => {
    let dir: string
    let originalArgv: string[]
    let logSpy: Mock

    beforeEach(async () => {
        dir = await mkdtemp(path.join(tmpdir(), 'run-cli-'))
        originalArgv = process.argv
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    })

    afterEach(async () => {
        process.argv = originalArgv
        logSpy.mockRestore()
        await rm(dir, { recursive: true, force: true })
    })

    it('reports the version from the given pkgPath, not its own package.json', async () => {
        const pkgPath = path.join(dir, 'package.json')
        await writeFile(pkgPath, JSON.stringify({ version: '9.9.9' }))

        process.argv = ['node', 'main.js', 'version']
        await runCli(pkgPath)

        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('9.9.9'))
    })

    it('has no side effect from merely being imported', async () => {
        process.argv = ['node', 'main.js', 'this-command-does-not-exist']
        const { runCli: importedRunCli } = await import('../index.js')

        expect(importedRunCli).toBe(runCli)
        expect(logSpy).not.toHaveBeenCalled()
        // If the old bug were present (a trailing top-level `await runCli()` in
        // main.ts), importing the barrel above would have already run the CLI
        // with process.argv as captured at module load time, producing a stray
        // "Unknown command" error before this test body even runs. Reaching
        // this assertion with no log output is the regression guard.
    })

    it('logs the stack trace and a bug-report hint for an unexpected error, regardless of DEBUG', async () => {
        delete process.env['DEBUG']
        const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => undefined)
        const pkgPath = path.join(dir, 'package.json')
        await writeFile(pkgPath, JSON.stringify({ version: '1.0.0' }))

        process.argv = ['node', 'main.js', 'validate']
        await runCli(pkgPath)

        expect(errorSpy).toHaveBeenCalledWith([
            expect.stringContaining('validate: --path is required'),
            'This looks like a bug — please report it.',
        ])
        expect(process.exitCode).toBe(1)

        errorSpy.mockRestore()
        process.exitCode = undefined
    })

    it('logs only the message and detail lines for a KnownError, with no stack trace', async () => {
        const jsonFile = path.join(dir, 'bad.json')
        await writeFile(jsonFile, '{not valid json', 'utf8')
        const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => undefined)
        const pkgPath = path.join(dir, 'package.json')
        await writeFile(pkgPath, JSON.stringify({ version: '1.0.0' }))

        process.argv = ['node', 'main.js', 'validate', `--path=${jsonFile}`]
        await runCli(pkgPath)

        expect(errorSpy).toHaveBeenCalledWith('JSON validation error')
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('\t-> '))
        for (const call of errorSpy.mock.calls) {
            expect(Array.isArray(call[0])).toBe(false)
        }
        expect(process.exitCode).toBe(1)

        errorSpy.mockRestore()
        process.exitCode = undefined
    })
})
