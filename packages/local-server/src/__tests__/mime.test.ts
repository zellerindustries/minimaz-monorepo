import { describe, expect, it } from 'vitest'
import { resolveMimeType } from '../mime.js'

describe('resolveMimeType', () => {
    it('resolves known extensions', () => {
        expect(resolveMimeType('/site/index.html')).toBe('text/html; charset=utf-8')
        expect(resolveMimeType('/site/styles/app.css')).toBe('text/css; charset=utf-8')
        expect(resolveMimeType('/site/app.js')).toBe('text/javascript; charset=utf-8')
        expect(resolveMimeType('/site/data.json')).toBe('application/json; charset=utf-8')
        expect(resolveMimeType('/site/logo.svg')).toBe('image/svg+xml')
    })

    it('resolves standard types for common web asset extensions', () => {
        expect(resolveMimeType('/site/sitemap.xml')).toBe('application/xml; charset=utf-8')
        expect(resolveMimeType('/site/guide.pdf')).toBe('application/pdf')
        expect(resolveMimeType('/site/module.wasm')).toBe('application/wasm')
        expect(resolveMimeType('/site/site.webmanifest')).toBe('application/manifest+json')
        expect(resolveMimeType('/site/photo.avif')).toBe('image/avif')
        expect(resolveMimeType('/site/clip.mp4')).toBe('video/mp4')
        expect(resolveMimeType('/site/app.js.map')).toBe('application/json; charset=utf-8')
    })

    it('is case-insensitive on the extension', () => {
        expect(resolveMimeType('/site/INDEX.HTML')).toBe('text/html; charset=utf-8')
    })

    it('falls back to application/octet-stream for unknown extensions', () => {
        expect(resolveMimeType('/site/archive.tar.gz')).toBe('application/octet-stream')
        expect(resolveMimeType('/site/no-extension')).toBe('application/octet-stream')
    })
})
