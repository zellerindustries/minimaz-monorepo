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

    it('throws when an @import resolves to an unreadable path (a directory)', async () => {
        const entry = await write('main.css', '@import "./partials";\nh1 { color: red; }')

        await expect(bundleCss(entry)).rejects.toThrow(/Failed to read file/)
    })

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

    it('prefixes ./ to a url that resolves beside the entry file', async () => {
        const entry = await write('main.css', '@import "./partials/_a.css";')
        await write('partials/_a.css', 'a { background: url("../logo.png"); }')

        const result = await bundleCss(entry)

        expect(result.code).toBe('a { background: url("./logo.png"); }')
    })

    it('keeps the leading ../ of a url that resolves above the entry directory', async () => {
        await mkdir(join(dir, 'partials', 'sub'), { recursive: true })
        const entry = await write('partials/main.css', '@import "./sub/_a.css";')
        await write('partials/sub/_a.css', 'a { background: url("../../logo.png"); }')

        const result = await bundleCss(entry)

        expect(result.code).toBe('a { background: url("../logo.png"); }')
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

    it("rewrites a nested import's url() exactly once", async () => {
        await mkdir(join(dir, 'sub'), { recursive: true })
        const entry = await write('entry.css', '@import "./sub/b.css";')
        await write('sub/b.css', '@import "./c.css";')
        await write('sub/c.css', 'a { background: url(img.png) }')

        const { code } = await bundleCss(entry)

        expect(code).toContain('url(./sub/img.png)')
        expect(code).not.toContain('sub/sub')
    })

    it("rewrites a nested file's non-relative @import url(...) against the entry directory", async () => {
        await mkdir(join(dir, 'sub'), { recursive: true })
        const entry = await write('entry.css', '@import "./sub/b.css";')
        await write('sub/b.css', '@import url(c.css); @import url("d.css"); @import "e.css";')

        const result = await bundleCss(entry)

        expect(result.code).toBe(
            '@import url(./sub/c.css); @import url("./sub/d.css"); @import "e.css";',
        )
        expect(result.inputs).toHaveLength(2)
    })

    it('rewrites quoted urls once through nested imports, leaving others alone', async () => {
        await mkdir(join(dir, 'sub'), { recursive: true })
        const entry = await write('entry.css', '@import "./sub/b.css";')
        await write('sub/b.css', '@import "./c.css";')
        await write(
            'sub/c.css',
            'a { b: url(\'i.png\'); c: url("j.png"); d: url(data:image/png;base64,AA); e: url(/k.png); f: url(http://x/y.png) }',
        )

        const { code } = await bundleCss(entry)

        expect(code).toContain("url('./sub/i.png')")
        expect(code).toContain('url("./sub/j.png")')
        expect(code).toContain('url(data:image/png;base64,AA)')
        expect(code).toContain('url(/k.png)')
        expect(code).toContain('url(http://x/y.png)')
    })

    it('inlines an unquoted @import url(...)', async () => {
        const entry = await write('main.css', '@import url(./b.css);')
        await write('b.css', 'b { c: d; }')

        expect((await bundleCss(entry)).code).toBe('b { c: d; }')
    })

    it('wraps an @import with a media query in @media', async () => {
        const entry = await write('main.css', '@import "./b.css" screen and (min-width: 10px);')
        await write('b.css', 'b { c: d; }')

        expect((await bundleCss(entry)).code).toBe(
            '@media screen and (min-width: 10px) {\nb { c: d; }\n}',
        )
    })

    it('wraps @import url(...) with a media type in @media', async () => {
        const entry = await write('main.css', '@import url("./b.css") screen;')
        await write('b.css', 'b { c: d; }')

        expect((await bundleCss(entry)).code).toBe('@media screen {\nb { c: d; }\n}')
    })

    it('throws naming the form for @import with supports() or layer', async () => {
        const entry = await write('main.css', '@import "./b.css" supports(display: grid);')
        await write('b.css', 'b { c: d; }')
        await expect(bundleCss(entry)).rejects.toThrow(/unsupported @import.*supports/)

        const entry2 = await write('m2.css', '@import "./b.css" layer(base);')
        await expect(bundleCss(entry2)).rejects.toThrow(/unsupported @import.*layer/)
    })

    it('inlines the same file twice, rewriting each copy once', async () => {
        const entry = await write('main.css', '@import "./b.css";\n@import "./b.css";')
        await write('b.css', 'b { c: url(x.png) }')

        const { code } = await bundleCss(entry)

        expect(code).toBe('b { c: url(./x.png) }\nb { c: url(./x.png) }')
    })

    it('leaves an @import without a terminating semicolon untouched', async () => {
        const css = '@import "./b.css"\nbody{color:red;}'
        const entry = await write('main.css', css)
        await write('b.css', 'b { c: d; }')

        const result = await bundleCss(entry)

        expect(result.code).toBe(css)
        expect(result.inputs).toEqual([entry])
    })

    it('throws for a missing import, naming the importing file', async () => {
        const entry = await write('main.css', '@import "./missing.css";')

        await expect(bundleCss(entry)).rejects.toThrow(
            /file not found: .*missing\.css \(imported from .*main\.css\)/,
        )
    })

    it('applies options.transform to each file before rewriting its url()s', async () => {
        const entry = await write('main.css', '@import "./partials/_a.css";')
        await write('partials/_a.css', "@font-face { src: url('../fonts/a.woff2'); }")

        const result = await bundleCss(entry, {
            transform: (content) => content.replace('../fonts/a.woff2', '/cdn/a.woff2'),
        })

        expect(result.code).toBe("@font-face { src: url('/cdn/a.woff2'); }")
    })

    it('throws for a missing entry file without an "imported from" note', async () => {
        await expect(bundleCss(join(dir, 'nope.css'))).rejects.toThrow(
            /file not found: .*nope\.css$/,
        )
    })
})
