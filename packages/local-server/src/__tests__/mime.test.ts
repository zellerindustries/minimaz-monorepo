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

    it('is case-insensitive on the extension', () => {
        expect(resolveMimeType('/site/INDEX.HTML')).toBe('text/html; charset=utf-8')
    })

    it('falls back to application/octet-stream for unknown extensions', () => {
        expect(resolveMimeType('/site/archive.tar.gz')).toBe('application/octet-stream')
        expect(resolveMimeType('/site/no-extension')).toBe('application/octet-stream')
    })
})
