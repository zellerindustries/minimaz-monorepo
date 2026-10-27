import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { minifyJs } from '../minify.js'
import { parse } from '../parse.js'
import { alphaDiff, structuralDiff } from './helpers.js'

/*
 * Real-world corpus: every built `packages/*\/dist/**\/*.js` (the seed templates under
 * `packages/templates/dist/seeds` included) plus up to 30 files from `node_modules` must parse,
 * minify, and parse back to the same tree. These are build outputs, so the suite is skipped
 * until `npm run build` has run.
 */

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))
const nodeModulesSample = 30

/** Every `.js` file below `dir` (relative to the repo root, `/`-separated), sorted. */
function jsFiles(dir: string, skip: (path: string) => boolean = () => false): string[] {
    const absolute = join(repoRoot, dir)
    if (!existsSync(absolute)) {
        return []
    }
    return readdirSync(absolute, { recursive: true, encoding: 'utf8' })
        .map((file) => `${dir}/${file.replaceAll('\\', '/')}`)
        .filter((file) => file.endsWith('.js') && !skip(file))
        .sort()
}

function builtFiles(): string[] {
    const packages = readdirSync(join(repoRoot, 'packages'), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
    // A bare `tsc -b` can leave compiled test helpers in dist/__tests__; they are not shipped.
    return packages.flatMap((name) =>
        jsFiles(`packages/${name}/dist`, (file) => file.includes('/__tests__/')),
    )
}

function nodeModulesFiles(): string[] {
    return [...jsFiles('node_modules/lodash-es'), ...jsFiles('node_modules/vitest/dist')].slice(
        0,
        nodeModulesSample,
    )
}

const distMissing = !existsSync(join(repoRoot, 'packages/js/dist/index.js'))

describe.skipIf(distMissing)(
    distMissing
        ? 'real-world corpus (skipped: packages/*/dist is missing, run `npm run build` first)'
        : 'real-world corpus',
    () => {
        const files = [...builtFiles(), ...nodeModulesFiles()]

        it('includes the built packages, the seed templates and node_modules files', () => {
            expect(files.some((file) => file === 'packages/js/dist/index.js')).toBe(true)
            expect(files.some((file) => file.startsWith('packages/templates/dist/seeds/'))).toBe(
                true,
            )
            expect(files.some((file) => file.startsWith('node_modules/'))).toBe(true)
        })

        it.each(files)(
            '%s parses, minifies and parses back to the same tree',
            (file) => {
                const source = readFileSync(join(repoRoot, file), 'utf8')
                const original = parse(source)

                const plain = minifyJs(source, { mangle: false })
                expect(structuralDiff(original, parse(plain), { undefinedAsVoid: true })).toBeNull()

                const mangled = minifyJs(source)
                expect(alphaDiff(original, parse(mangled), { undefinedAsVoid: true })).toBeNull()

                if (original.sourceType === 'script') {
                    expect(() => new vm.Script(mangled)).not.toThrow()
                }
            },
            60_000,
        )
    },
)
