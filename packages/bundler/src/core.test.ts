import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveModuleGraph } from './core.js'

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
})
