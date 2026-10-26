import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveFileImports, resolveModuleGraph } from '../core.js'
import { BundlerError } from '../errors.js'

describe('resolveModuleGraph', () => {
    let dir: string

    beforeEach(async () => {
        dir = await mkdtemp(path.join(tmpdir(), 'bundler-'))
    })

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true })
    })

    it('returns a single-entry map for a JS file with no imports', async () => {
        const entry = path.join(dir, 'entry.js')
        await writeFile(entry, 'export const value = 1\n', 'utf8')

        const result = await resolveModuleGraph(entry)

        expect(result.modules.size).toBe(1)
        expect(result.modules.get(entry)).toBe('export const value = 1\n')
    })

    it('transpiles a TypeScript entry file with no imports', async () => {
        const entry = path.join(dir, 'entry.ts')
        await writeFile(entry, 'export const value: number = 1\n', 'utf8')

        const result = await resolveModuleGraph(entry)

        expect(result.modules.size).toBe(1)
        const output = result.modules.get(entry)
        expect(output).toBeDefined()
        expect(output).not.toContain(': number')
        expect(output).toContain('export const value = 1')
    })

    it('resolves and rewrites an extensionless relative import in a linear chain', async () => {
        await writeFile(path.join(dir, 'c.js'), 'export const c = 3\n', 'utf8')
        await writeFile(
            path.join(dir, 'b.js'),
            "import { c } from './c'\nexport const b = c + 1\n",
            'utf8',
        )
        const entry = path.join(dir, 'a.js')
        await writeFile(entry, "import { b } from './b'\nexport const a = b + 1\n", 'utf8')

        const result = await resolveModuleGraph(entry)

        expect(result.modules.size).toBe(3)
        expect(result.modules.get(entry)).toContain("from './b.js'")
        expect(result.modules.get(path.join(dir, 'b.js'))).toContain("from './c.js'")
    })

    it('resolves a directory import to its index.ts and rewrites the specifier accordingly', async () => {
        await mkdir(path.join(dir, 'utils'))
        await writeFile(path.join(dir, 'utils', 'index.ts'), 'export const util = 1\n', 'utf8')
        const entry = path.join(dir, 'entry.js')
        await writeFile(entry, "import { util } from './utils'\n", 'utf8')

        const result = await resolveModuleGraph(entry)

        expect(result.modules.get(entry)).toContain("from './utils/index.js'")
    })

    it('processes a diamond dependency only once', async () => {
        await writeFile(path.join(dir, 'd.js'), 'export const d = 1\n', 'utf8')
        await writeFile(path.join(dir, 'b.js'), "import './d.js'\nexport const b = 1\n", 'utf8')
        await writeFile(path.join(dir, 'c.js'), "import './d.js'\nexport const c = 1\n", 'utf8')
        const entry = path.join(dir, 'a.js')
        await writeFile(entry, "import './b.js'\nimport './c.js'\n", 'utf8')

        const result = await resolveModuleGraph(entry)

        expect(result.modules.size).toBe(4)
    })

    it('leaves non-JS/TS relative specifiers untouched and does not try to resolve them', async () => {
        const entry = path.join(dir, 'entry.js')
        await writeFile(entry, "import './style.css'\nexport const a = 1\n", 'utf8')

        const result = await resolveModuleGraph(entry)

        expect(result.modules.size).toBe(1)
        expect(result.modules.get(entry)).toContain("import './style.css'")
    })

    it('terminates and rewrites specifiers correctly for circular imports', async () => {
        const aPath = path.join(dir, 'a.js')
        const bPath = path.join(dir, 'b.js')
        await writeFile(aPath, "import './b'\nexport const a = 1\n", 'utf8')
        await writeFile(bPath, "import './a'\nexport const b = 1\n", 'utf8')

        const result = await resolveModuleGraph(aPath)

        expect(result.modules.size).toBe(2)
        expect(result.modules.get(aPath)).toContain("import './b.js'")
        expect(result.modules.get(bPath)).toContain("import './a.js'")
    })

    it('transpiles TSX entry and dependency files and rewrites the resolved import to .js', async () => {
        await writeFile(
            path.join(dir, 'button.tsx'),
            'export const Button = () => <button>Click</button>\n',
            'utf8',
        )
        const entry = path.join(dir, 'app.tsx')
        await writeFile(
            entry,
            "import { Button } from './button'\nexport const App = () => <Button />\n",
            'utf8',
        )

        const result = await resolveModuleGraph(entry)

        expect(result.modules.size).toBe(2)
        const appOutput = result.modules.get(entry)
        expect(appOutput).toBeDefined()
        expect(appOutput).not.toContain('<Button />')
        expect(appOutput).toContain("from './button.js'")
    })

    it('throws a descriptive error when a relative import cannot be resolved', async () => {
        const entry = path.join(dir, 'entry.js')
        await writeFile(entry, "import './missing'\n", 'utf8')

        const promise = resolveModuleGraph(entry)
        await expect(promise).rejects.toThrow(/Cannot resolve "\.\/missing"/)
        await expect(promise).rejects.toBeInstanceOf(BundlerError)
    })

    it('throws when a relative dynamic import is encountered', async () => {
        const entry = path.join(dir, 'entry.js')
        await writeFile(entry, "const mod = import('./dep')\n", 'utf8')

        await expect(resolveModuleGraph(entry)).rejects.toThrow(/Dynamic import\("\.\/dep"\)/)
    })

    it('does not corrupt unrelated text that happens to match a rewritten specifier', async () => {
        await writeFile(path.join(dir, 'b.js'), 'export const b = 1\n', 'utf8')
        const entry = path.join(dir, 'entry.js')
        await writeFile(entry, "import { b } from './b'\nexport const label = './b'\n", 'utf8')

        const result = await resolveModuleGraph(entry)

        const output = result.modules.get(entry)
        expect(output).toContain("from './b.js'")
        expect(output).toContain("const label = './b'")
    })

    describe('dotted module names', () => {
        it('resolves ./utils.config to utils.config.js and rewrites the specifier', async () => {
            await writeFile(path.join(dir, 'utils.config.js'), 'export const c = 1\n', 'utf8')
            const entry = path.join(dir, 'entry.js')
            await writeFile(entry, "import { c } from './utils.config'\n", 'utf8')

            const result = await resolveModuleGraph(entry)

            expect(result.modules.size).toBe(2)
            expect(result.modules.has(path.join(dir, 'utils.config.js'))).toBe(true)
            expect(result.modules.get(entry)).toContain("from './utils.config.js'")
        })

        it('resolves dotted names to .ts and .tsx sources', async () => {
            await writeFile(path.join(dir, 'a.config.ts'), 'export const a: number = 1\n', 'utf8')
            await writeFile(path.join(dir, 'b.config.tsx'), 'export const b: number = 2\n', 'utf8')
            const entry = path.join(dir, 'entry.js')
            await writeFile(entry, "import './a.config'\nimport './b.config'\n", 'utf8')

            const result = await resolveModuleGraph(entry)

            expect(result.modules.size).toBe(3)
            expect(result.modules.get(entry)).toContain("import './a.config.js'")
            expect(result.modules.get(entry)).toContain("import './b.config.js'")
        })

        it('resolves ./foo.min to foo.min.js', async () => {
            await writeFile(path.join(dir, 'foo.min.js'), 'export const f = 1\n', 'utf8')
            const entry = path.join(dir, 'entry.js')
            await writeFile(entry, "import './foo.min'\n", 'utf8')

            const result = await resolveModuleGraph(entry)

            expect(result.modules.size).toBe(2)
            expect(result.modules.get(entry)).toContain("import './foo.min.js'")
        })

        it('resolves a dotted directory name to its index file', async () => {
            await mkdir(path.join(dir, 'v1.2'))
            await writeFile(path.join(dir, 'v1.2', 'index.js'), 'export const v = 1\n', 'utf8')
            const entry = path.join(dir, 'entry.js')
            await writeFile(entry, "import './v1.2'\n", 'utf8')

            const result = await resolveModuleGraph(entry)

            expect(result.modules.size).toBe(2)
            expect(result.modules.get(entry)).toContain("import './v1.2/index.js'")
        })

        it('leaves real assets untouched', async () => {
            await writeFile(path.join(dir, 'data.json'), '{}', 'utf8')
            await writeFile(path.join(dir, 'style.css'), 'a{}', 'utf8')
            await writeFile(path.join(dir, 'img.png'), 'x', 'utf8')
            const entry = path.join(dir, 'entry.js')
            await writeFile(
                entry,
                "import './data.json'\nimport './style.css'\nimport './img.png'\n",
                'utf8',
            )

            const result = await resolveModuleGraph(entry)

            expect(result.modules.size).toBe(1)
            expect(result.modules.get(entry)).toContain("import './data.json'")
            expect(result.modules.get(entry)).toContain("import './img.png'")
        })

        it('keeps an explicit .js specifier working', async () => {
            await writeFile(path.join(dir, 'a.js'), 'export const a = 1\n', 'utf8')
            const entry = path.join(dir, 'entry.js')
            await writeFile(entry, "import './a.js'\n", 'utf8')

            const result = await resolveModuleGraph(entry)

            expect(result.modules.size).toBe(2)
            expect(result.modules.get(entry)).toContain("import './a.js'")
        })

        it('emits a dotfile module as ./.env.js and keeps ../ forms intact', async () => {
            await mkdir(path.join(dir, 'sub'))
            await writeFile(path.join(dir, '.env.js'), 'export const e = 1\n', 'utf8')
            await writeFile(path.join(dir, 'up.js'), 'export const u = 1\n', 'utf8')
            await writeFile(
                path.join(dir, 'sub', 'inner.js'),
                "import '../up'\nimport '../.env'\n",
                'utf8',
            )
            const entry = path.join(dir, 'entry.js')
            await writeFile(entry, "import './.env'\nimport './sub/inner'\n", 'utf8')

            const result = await resolveModuleGraph(entry)

            expect(result.modules.get(entry)).toContain("import './.env.js'")
            const inner = result.modules.get(path.join(dir, 'sub', 'inner.js'))
            expect(inner).toContain("import '../up.js'")
            expect(inner).toContain("import '../.env.js'")
        })
    })
})

describe('resolveFileImports', () => {
    let dir: string

    beforeEach(async () => {
        dir = await mkdtemp(path.join(tmpdir(), 'bundler-file-'))
    })

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true })
    })

    it('rewrites a ./b import to ./b.js when b.ts exists', async () => {
        await writeFile(path.join(dir, 'b.ts'), 'export const b = 1\n', 'utf8')
        const entry = path.join(dir, 'a.js')
        await writeFile(entry, "import { b } from './b'\n", 'utf8')

        expect(await resolveFileImports(entry)).toContain("from './b.js'")
    })

    it('resolves ./lib to ./lib/index.js', async () => {
        await mkdir(path.join(dir, 'lib'))
        await writeFile(path.join(dir, 'lib', 'index.ts'), 'export const l = 1\n', 'utf8')
        const entry = path.join(dir, 'a.js')
        await writeFile(entry, "import { l } from './lib'\n", 'utf8')

        expect(await resolveFileImports(entry)).toContain("from './lib/index.js'")
    })

    it('resolves ./x.js to ./x.js when only x.ts exists', async () => {
        await writeFile(path.join(dir, 'x.ts'), 'export const x = 1\n', 'utf8')
        const entry = path.join(dir, 'a.js')
        await writeFile(entry, "import { x } from './x.js'\n", 'utf8')

        expect(await resolveFileImports(entry)).toBe("import { x } from './x.js'\n")
    })

    it('throws for ./x.js when neither x.js nor x.ts exists', async () => {
        const entry = path.join(dir, 'a.js')
        await writeFile(entry, "import { x } from './x.js'\n", 'utf8')

        await expect(resolveFileImports(entry)).rejects.toBeInstanceOf(BundlerError)
    })

    it('uses the provided source instead of reading the file from disk', async () => {
        await writeFile(path.join(dir, 'b.ts'), 'export const b = 1\n', 'utf8')
        const entry = path.join(dir, 'a.js')
        await writeFile(entry, "import { nope } from './nope'\n", 'utf8')

        const output = await resolveFileImports(entry, "import { b } from './b'\n")

        expect(output).toBe("import { b } from './b.js'\n")
    })

    it('transpiles a provided source based on the file extension', async () => {
        const entry = path.join(dir, 'a.ts')

        const output = await resolveFileImports(entry, 'export const v: number = 1\n')

        expect(output).not.toContain(': number')
        expect(output).toContain('export const v = 1')
    })

    it('transpiles files with an uppercase extension', async () => {
        const entry = path.join(dir, 'Foo.TS')
        await writeFile(entry, 'export const v: number = 1\n', 'utf8')
        const tsx = path.join(dir, 'Bar.TSX')
        await writeFile(tsx, 'export const el = <div />\n', 'utf8')

        const output = await resolveFileImports(entry)
        const tsxOutput = await resolveFileImports(tsx)

        expect(output).not.toContain(': number')
        expect(tsxOutput).not.toContain('<div')
    })

    it('leaves bare specifiers and ./data.json untouched', async () => {
        await writeFile(path.join(dir, 'data.json'), '{}', 'utf8')
        const entry = path.join(dir, 'a.js')
        const source = "import x from 'lodash'\nimport d from './data.json'\n"
        await writeFile(entry, source, 'utf8')

        expect(await resolveFileImports(entry)).toBe(source)
    })

    it('returns transpiled JS (no type annotations) for a .ts file', async () => {
        const entry = path.join(dir, 'a.ts')
        await writeFile(entry, 'export const value: number = 1\n', 'utf8')

        const output = await resolveFileImports(entry)

        expect(output).not.toContain(': number')
        expect(output).toContain('export const value = 1')
    })

    it('does not follow imports: succeeds when a dependency has an unresolvable import', async () => {
        await writeFile(path.join(dir, 'b.js'), "import './nope'\n", 'utf8')
        const entry = path.join(dir, 'a.js')
        await writeFile(entry, "import './b'\n", 'utf8')

        expect(await resolveFileImports(entry)).toContain("import './b.js'")
    })

    it('handles circular imports', async () => {
        const a = path.join(dir, 'a.js')
        const b = path.join(dir, 'b.js')
        await writeFile(a, "import './b'\n", 'utf8')
        await writeFile(b, "import './a'\n", 'utf8')

        expect(await resolveFileImports(a)).toContain("import './b.js'")
        expect(await resolveFileImports(b)).toContain("import './a.js'")
    })

    it('throws BundlerError naming file, specifier and tried paths for a missing target', async () => {
        const entry = path.join(dir, 'a.js')
        await writeFile(entry, "import './missing'\n", 'utf8')

        const promise = resolveFileImports(entry)
        await expect(promise).rejects.toBeInstanceOf(BundlerError)
        await expect(promise).rejects.toThrow(/Cannot resolve "\.\/missing"/)
        await expect(promise).rejects.toThrow(/imported from ".*a\.js"/)
        await expect(promise).rejects.toThrow(/tried:\n\s+- .*missing\.ts/)
    })

    it('throws BundlerError for a relative dynamic import', async () => {
        const entry = path.join(dir, 'a.js')
        await writeFile(entry, "const m = import('./x')\n", 'utf8')

        const promise = resolveFileImports(entry)
        await expect(promise).rejects.toBeInstanceOf(BundlerError)
        await expect(promise).rejects.toThrow(/Dynamic import\("\.\/x"\)/)
    })

    it('rewrites the specifier of an `export { a } from` re-export', async () => {
        await writeFile(path.join(dir, 'x.ts'), 'export const a = 1\n', 'utf8')
        const entry = path.join(dir, 'a.js')
        await writeFile(entry, "export { a } from './x'\n", 'utf8')

        expect(await resolveFileImports(entry)).toBe("export { a } from './x.js'\n")
    })

    it('rewrites the specifier of an `export * from` re-export', async () => {
        await writeFile(path.join(dir, 'x.ts'), 'export const a = 1\n', 'utf8')
        const entry = path.join(dir, 'a.js')
        await writeFile(entry, "export * from './x'\n", 'utf8')

        expect(await resolveFileImports(entry)).toBe("export * from './x.js'\n")
    })

    it('rewrites a side-effect import', async () => {
        await writeFile(path.join(dir, 'polyfill.ts'), 'globalThis.p = 1\n', 'utf8')
        const entry = path.join(dir, 'a.js')
        await writeFile(entry, "import './polyfill'\n", 'utf8')

        expect(await resolveFileImports(entry)).toBe("import './polyfill.js'\n")
    })

    it('rewrites single- and double-quoted specifiers, preserving the quote style', async () => {
        await writeFile(path.join(dir, 'x.ts'), 'export const x = 1\n', 'utf8')
        await writeFile(path.join(dir, 'y.ts'), 'export const y = 1\n', 'utf8')
        const entry = path.join(dir, 'a.js')
        await writeFile(entry, 'import \'./x\'\nimport "./y"\n', 'utf8')

        expect(await resolveFileImports(entry)).toBe('import \'./x.js\'\nimport "./y.js"\n')
    })

    it('rewrites ../ specifiers from a nested directory, keeping the ../ prefix', async () => {
        await mkdir(path.join(dir, 'sub', 'deep'), { recursive: true })
        await writeFile(path.join(dir, 'sub', 'util.ts'), 'export const u = 1\n', 'utf8')
        await writeFile(path.join(dir, 'root.ts'), 'export const r = 1\n', 'utf8')
        const entry = path.join(dir, 'sub', 'deep', 'a.js')
        await writeFile(entry, "import '../util'\nimport '../../root'\n", 'utf8')

        expect(await resolveFileImports(entry)).toBe(
            "import '../util.js'\nimport '../../root.js'\n",
        )
    })

    it('emits forward slashes for a directory import resolved through nested folders', async () => {
        await mkdir(path.join(dir, 'a', 'b'), { recursive: true })
        await writeFile(path.join(dir, 'a', 'b', 'index.ts'), 'export const i = 1\n', 'utf8')
        const entry = path.join(dir, 'entry.js')
        await writeFile(entry, "import './a/b'\n", 'utf8')

        const output = await resolveFileImports(entry)

        expect(output).toBe("import './a/b/index.js'\n")
        expect(output).not.toContain('\\')
    })

    it('transpiles a .tsx file (JSX removed) while rewriting its imports', async () => {
        await writeFile(path.join(dir, 'button.tsx'), 'export const B = () => <b />\n', 'utf8')
        const entry = path.join(dir, 'app.tsx')
        await writeFile(
            entry,
            "import { B } from './button'\nexport const App = () => <B />\n",
            'utf8',
        )

        const output = await resolveFileImports(entry)

        expect(output).toContain("from './button.js'")
        expect(output).not.toContain('<B')
    })
})
