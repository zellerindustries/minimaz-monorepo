import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { minifyJs } from '../minify.js'
import { parse } from '../parse.js'
import { alphaDiff, structuralDiff } from './helpers.js'

/*
 * Every program under fixtures/programs runs before and after minifying (with and without
 * renaming) and must log exactly the same lines. Programs named `module-*.js` run as ES modules
 * (imported from a data: URL, so they cannot import anything but `node:` built-ins); the rest run
 * as sloppy scripts in a fresh `vm` context. Both get a `log` function and `setTimeout`.
 */

const programsDir = fileURLToPath(new URL('fixtures/programs/', import.meta.url))
const programs = readdirSync(programsDir)
    .filter((file) => file.endsWith('.js'))
    .sort()

/** A deterministic, realm-independent rendering of a logged value. */
function show(value: unknown, depth = 0): string {
    switch (typeof value) {
        case 'string':
            return JSON.stringify(value)
        case 'number':
            return Object.is(value, -0) ? '-0' : String(value)
        case 'bigint':
            return `${String(value)}n`
        case 'boolean':
        case 'undefined':
            return String(value)
        case 'symbol':
            return value.toString()
        case 'function':
            return '[function]'
        case 'object':
            break
    }
    if (value === null) {
        return 'null'
    }
    if (depth > 4) {
        return '[deep]'
    }
    if (Array.isArray(value)) {
        const items: unknown[] = value
        return `[${Array.from(items, (item, i) => (i in items ? show(item, depth + 1) : '<hole>')).join(',')}]`
    }
    const tag = Object.prototype.toString.call(value)
    if (tag === '[object Error]') {
        return `[${(value as Error).name}]`
    }
    if (tag === '[object Promise]') {
        return '[promise]'
    }
    const record = value as Record<string, unknown>
    const entries = Object.keys(record).map(
        (key) => `${JSON.stringify(key)}:${show(record[key], depth + 1)}`,
    )
    return `{${entries.join(',')}}`
}

function errorName(error: unknown): string {
    return typeof error === 'object' && error !== null && 'name' in error
        ? String(error.name)
        : String(error)
}

let runCount = 0

/**
 * Runs a program and returns its logged lines once every timer it started has fired.
 * @param code - The program.
 * @param asModule - Whether to run it as an ES module instead of a script.
 * @returns One line per `log` call, plus `uncaught <name>` if the program threw.
 */
async function run(code: string, asModule: boolean): Promise<string[]> {
    const lines: string[] = []
    const log = (...args: unknown[]): void => {
        lines.push(args.map((arg) => show(arg)).join(' '))
    }
    let pending = 0
    const trackedSetTimeout = (callback: () => void, delay?: number): void => {
        pending++
        setTimeout(() => {
            pending--
            callback()
        }, delay)
    }
    if (asModule) {
        // A unique trailing comment keeps the module cache from returning an earlier run.
        runCount++
        const url = `data:text/javascript;base64,${Buffer.from(`${code}\n//${String(runCount)}`).toString('base64')}`
        const host = globalThis as Record<string, unknown>
        host['log'] = log
        try {
            await import(/* @vite-ignore */ url)
        } catch (error) {
            lines.push(`uncaught ${errorName(error)}`)
        }
        await new Promise((resolve) => setTimeout(resolve, 30))
        delete host['log']
        return lines
    }
    const context = vm.createContext({ log, setTimeout: trackedSetTimeout })
    try {
        new vm.Script(code).runInContext(context)
    } catch (error) {
        lines.push(`uncaught ${errorName(error)}`)
    }
    do {
        await new Promise((resolve) => setTimeout(resolve, 1))
    } while (pending > 0)
    return lines
}

describe('differential execution', () => {
    it('has the fixture programs', () => {
        expect(programs.length).toBeGreaterThanOrEqual(40)
    })

    describe.each(programs)('%s', (file) => {
        const source = readFileSync(`${programsDir}${file}`, 'utf8')
        const asModule = file.startsWith('module-')

        it('logs the same lines after minifying, with and without renaming', async () => {
            const expected = await run(source, asModule)
            expect(expected.length).toBeGreaterThan(0)
            expect(expected.filter((line) => line.startsWith('uncaught'))).toEqual([])
            const mangled = minifyJs(source)
            expect(await run(mangled, asModule), mangled).toEqual(expected)
            const plain = minifyJs(source, { mangle: false })
            expect(await run(plain, asModule), plain).toEqual(expected)
        })

        it('parses back to the same tree (modulo safe rewrites and renaming)', () => {
            const original = parse(source)
            const plain = minifyJs(source, { mangle: false })
            expect(
                structuralDiff(original, parse(plain), { undefinedAsVoid: true }),
                plain,
            ).toBeNull()
            const mangled = minifyJs(source)
            expect(
                alphaDiff(original, parse(mangled), { undefinedAsVoid: true }),
                mangled,
            ).toBeNull()
        })
    })
})
