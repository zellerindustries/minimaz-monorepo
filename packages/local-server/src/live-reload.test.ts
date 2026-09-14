import { describe, expect, it } from 'vitest'
import { injectReloadScript } from './live-reload.js'

describe('injectReloadScript', () => {
    it('inserts the script immediately before </body>', () => {
        const html = '<html><body><h1>Hi</h1></body></html>'
        const result = injectReloadScript(html)

        expect(result).toContain('<h1>Hi</h1>')
        expect(result.indexOf('EventSource')).toBeLessThan(result.indexOf('</body>'))
        expect(result.endsWith('</html>')).toBe(true)
    })

    it('appends the script when there is no </body>', () => {
        const html = '<html><h1>Hi</h1></html>'
        const result = injectReloadScript(html)

        expect(result.startsWith(html)).toBe(true)
        expect(result).toContain('EventSource')
    })

    it('points the script at the live-reload endpoint', () => {
        const result = injectReloadScript('<body></body>')
        expect(result).toContain('/__minimaz-live-reload')
    })
})
