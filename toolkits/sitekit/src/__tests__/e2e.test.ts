import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const binPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli', 'main.js')
const hardTimeoutMs = 15_000
const testTimeoutMs = 20_000

interface Run {
    child: ChildProcess
    output: () => string
    exited: Promise<number | null>
    waitFor: (text: string) => Promise<void>
}

const tempDirs: string[] = []
const children: ChildProcess[] = []
const servers: Server[] = []

afterEach(async () => {
    for (const child of children.splice(0)) {
        child.kill('SIGKILL')
    }
    for (const server of servers.splice(0)) {
        await new Promise((resolve) => server.close(resolve))
    }
    for (const dir of tempDirs.splice(0)) {
        await rm(dir, { recursive: true, force: true })
    }
})

async function makeProject(serve?: { port: number }): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'mz-e2e-'))
    tempDirs.push(dir)
    await mkdir(join(dir, 'src'))
    const config = { input: { dir: 'src' }, output: { dir: 'dist' }, ...(serve ? { serve } : {}) }
    await writeFile(join(dir, 'minimaz.config.json'), JSON.stringify(config))
    await writeFile(join(dir, 'src', 'index.html'), '<!doctype html><title>t</title><p>hi</p>')
    return dir
}

function run(cwd: string, args: string[]): Run {
    const child = spawn(process.execPath, [binPath, ...args], {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
    })
    children.push(child)
    let text = ''
    const listeners = new Set<() => void>()
    const onData = (chunk: Buffer): void => {
        text += chunk.toString()
        for (const listener of listeners) {
            listener()
        }
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    const timer = setTimeout(() => child.kill('SIGKILL'), hardTimeoutMs)
    const exited = new Promise<number | null>((resolve) => {
        child.on('close', (code) => {
            clearTimeout(timer)
            resolve(code)
        })
    })
    const waitFor = (needle: string): Promise<void> =>
        new Promise((resolve, reject) => {
            const check = (): void => {
                if (text.includes(needle)) {
                    listeners.delete(check)
                    resolve()
                }
            }
            listeners.add(check)
            void exited.then(() => {
                check()
                if (!text.includes(needle)) {
                    reject(new Error(`exited before "${needle}":\n${text}`))
                }
            })
            check()
        })
    return { child, output: () => text, exited, waitFor }
}

async function runToExit(
    cwd: string,
    args: string[],
): Promise<{ code: number | null; output: string }> {
    const r = run(cwd, args)
    const code = await r.exited
    return { code, output: r.output() }
}

async function builtProject(serve?: { port: number }): Promise<string> {
    const dir = await makeProject(serve)
    const first = await runToExit(dir, ['build'])
    expect(first.code, first.output).toBe(0)
    return dir
}

async function withOldFile(): Promise<string> {
    const dir = await builtProject()
    await writeFile(join(dir, 'dist', 'old.txt'), 'old')
    return dir
}

describe('mz binary (e2e)', () => {
    it(
        'builds a fresh project and exits 0',
        async () => {
            const dir = await makeProject()
            const { code, output } = await runToExit(dir, ['build'])
            expect(code, output).toBe(0)
            expect(existsSync(join(dir, 'dist', 'index.html'))).toBe(true)
        },
        testTimeoutMs,
    )

    it(
        'refuses a second build without --overwrite, naming the flag, and leaves dist untouched',
        async () => {
            const dir = await withOldFile()
            const { code, output } = await runToExit(dir, ['build'])
            expect(code).toBe(1)
            expect(output).toContain('--overwrite')
            expect(existsSync(join(dir, 'dist', 'old.txt'))).toBe(true)
        },
        testTimeoutMs,
    )

    it(
        'rebuilds with --overwrite and replaces the old output',
        async () => {
            const dir = await withOldFile()
            const { code, output } = await runToExit(dir, ['build', '--overwrite'])
            expect(code, output).toBe(0)
            expect(existsSync(join(dir, 'dist', 'old.txt'))).toBe(false)
            expect(existsSync(join(dir, 'dist', 'index.html'))).toBe(true)
            expect(existsSync(join(dir, 'dist.minimaz-tmp'))).toBe(false)
            expect(existsSync(join(dir, 'dist.minimaz-old'))).toBe(false)
        },
        testTimeoutMs,
    )

    it(
        'treats --overwrite=no as off',
        async () => {
            const dir = await withOldFile()
            const { code } = await runToExit(dir, ['build', '--overwrite=no'])
            expect(code).toBe(1)
            expect(existsSync(join(dir, 'dist', 'old.txt'))).toBe(true)
        },
        testTimeoutMs,
    )

    it(
        'serve exits 1 when the configured port is already in use',
        async () => {
            const blocker = createServer()
            servers.push(blocker)
            await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve))
            const address = blocker.address()
            if (address === null || typeof address === 'string') {
                throw new Error('no port')
            }
            const dir = await builtProject({ port: address.port })
            const { code, output } = await runToExit(dir, ['serve'])
            expect(code, output).toBe(1)
            expect(output).toContain('already in use')
        },
        testTimeoutMs,
    )

    it(
        'serve warns when serve.port is not set',
        async () => {
            const dir = await builtProject()
            const r = run(dir, ['serve'])
            // The warning is logged before listening, so this holds even if 4173 is occupied.
            await r.waitFor('default port')
            r.child.kill('SIGKILL')
            await r.exited
            expect(r.output()).toContain('serve.port')
            expect(r.output()).toContain('4173')
        },
        testTimeoutMs,
    )

    it(
        'serve does not warn when serve.port is 0',
        async () => {
            const dir = await builtProject({ port: 0 })
            const r = run(dir, ['serve'])
            await r.waitFor('Serving')
            r.child.kill('SIGKILL')
            await r.exited
            expect(r.output()).not.toContain('serve.port')
        },
        testTimeoutMs,
    )
})
