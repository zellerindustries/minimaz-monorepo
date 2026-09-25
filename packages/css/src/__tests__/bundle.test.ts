import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bundleCss } from '../bundle.js'

describe('bundleCss', () => {
    let dir: string

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'css-bundle-'))
        await mkdir(join(dir, 'partials'), { recursive: true })
    })

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true })
    })

    async function write(relativePath: string, content: string): Promise<string> {
        const fullPath = join(dir, relativePath)
        await writeFile(fullPath, content, 'utf8')
        return fullPath
    }

    it('inlines a relative @import and reports every file touched', async () => {
        const entry = await write('main.css', '@import "./partials/_a.css";\nh1 { color: red; }')
        const partial = await write('partials/_a.css', 'body { margin: 0; }')

        const result = await bundleCss(entry)

        expect(result.code).toBe('body { margin: 0; }\nh1 { color: red; }')
        expect(result.inputs).toEqual([entry, partial])
    })

    it('inlines the @import url("...") form', async () => {
        const entry = await write('main.css', '@import url("./b.css");')
        await write('b.css', 'b { c: d; }')

        expect((await bundleCss(entry)).code).toBe('b { c: d; }')
    })

    it("rewrites a partial's relative url() references against the entry directory", async () => {
        const entry = await write('main.css', '@import "./partials/_a.css";')
        await write(
            'partials/_a.css',
            'a { background: url("../img/x.png") }\nb { background: url(icon.png) }',
        )

        const { code } = await bundleCss(entry)

        expect(code).toContain('url("./img/x.png")')
        expect(code).toContain('url(./partials/icon.png)')
    })

    it('leaves absolute, remote, data and fragment urls untouched', async () => {
        const css = [
            'a { b: url(https://example.com/x.png) }',
            'a { b: url(//cdn.example.com/x.png) }',
            'a { b: url(data:image/png;base64,AAAA) }',
            'a { b: url(/abs.png) }',
            'a { b: url(#id) }',
        ].join('\n')
        const entry = await write('main.css', css)

        expect((await bundleCss(entry)).code).toBe(css)
    })

    it('leaves non-relative @import statements in place', async () => {
        const css = '@import "https://fonts.example.com/x.css";\n@import "theme.css";\na {}'
        const entry = await write('main.css', css)

        const result = await bundleCss(entry)

        expect(result.code).toBe(css)
        expect(result.inputs).toEqual([entry])
    })

    it('throws on a circular @import, naming the cycle', async () => {
        const entry = await write('main.css', '@import "./a.css";')
        await write('a.css', '@import "./main.css";')

        await expect(bundleCss(entry)).rejects.toThrow(/circular @import detected: .* -> .* -> /)
    })

    it('throws for a missing import, naming the importing file', async () => {
        const entry = await write('main.css', '@import "./missing.css";')

        await expect(bundleCss(entry)).rejects.toThrow(
            /file not found: .*missing\.css \(imported from .*main\.css\)/,
        )
    })

    it('throws for a missing entry file without an "imported from" note', async () => {
        await expect(bundleCss(join(dir, 'nope.css'))).rejects.toThrow(
            /file not found: .*nope\.css$/,
        )
    })
})
