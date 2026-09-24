import { defaultBuildConfig, defaultConfig } from '@minimaz/config'
import type { MinimazConfig } from '@minimaz/config'
import { describe, expect, it } from 'vitest'
import type { File } from '../../types.js'
import { processHtml } from '../html.js'

function makeConfig(minify: boolean): MinimazConfig {
    return {
        ...defaultConfig,
        ...defaultBuildConfig,
        output: {
            ...defaultBuildConfig.output,
            html: { minify },
        },
    }
}

describe('processHtml', () => {
    it('passes through raw content when minify is disabled', async () => {
        const raw = '<html>\n    <body>Hi</body>\n</html>'
        const file: File = { src: 'a.html', dest: 'a.html', content: raw, ext: '.html' }

        const result = await processHtml(file, makeConfig(false))

        expect(result).toBe(raw)
    })

    it('minifies when minify is enabled', async () => {
        const raw = '<html>\n    <body>   Hi   </body>\n</html>'
        const file: File = { src: 'a.html', dest: 'a.html', content: raw, ext: '.html' }

        const result = await processHtml(file, makeConfig(true))

        expect(result).not.toContain('\n')
        expect(result).toContain('Hi')
    })
})
