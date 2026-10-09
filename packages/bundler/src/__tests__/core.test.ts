import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveModuleGraph } from '../core.js'

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

        await expect(resolveModuleGraph(entry)).rejects.toThrow(/Cannot resolve "\.\/missing"/)
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
