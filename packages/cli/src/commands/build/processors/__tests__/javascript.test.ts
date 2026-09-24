import { defaultBuildConfig, defaultConfig } from '@minimaz/config'
import type { MinimazConfig } from '@minimaz/config'
import { describe, expect, it } from 'vitest'
import type { File } from '../../types.js'
import { processJs, processTs } from '../javascript.js'

function makeConfig(minify: boolean): MinimazConfig {
    return {
        ...defaultConfig,
        ...defaultBuildConfig,
        output: {
            ...defaultBuildConfig.output,
            js: { bundling: false, minify },
        },
    }
}

describe('processJs', () => {
    it('passes through raw content when minify is disabled', () => {
        const file: File = { src: 'a.js', dest: 'a.js', content: 'const x = 1;', ext: '.js' }

        expect(processJs(file, makeConfig(false))).toBe('const x = 1;')
    })

    it('minifies when minify is enabled', () => {
        const file: File = {
            src: 'a.js',
            dest: 'a.js',
            content: 'const x = 1;\n\n\nconst y = 2;',
            ext: '.js',
        }

        const result = processJs(file, makeConfig(true))

        expect(result).not.toContain('\n\n\n')
        expect(result).toContain('const x = 1;')
        expect(result).toContain('const y = 2;')
    })
})

describe('processTs', () => {
    it('transpiles TypeScript to JavaScript', () => {
        const file: File = {
            src: 'a.ts',
            dest: 'a.js',
            content: 'const x: number = 1;',
            ext: '.ts',
        }

        const result = processTs(file, makeConfig(false))

        expect(result).not.toContain(': number')
        expect(result).toContain('const x = 1;')
    })

    it('transpiles JSX when the extension is .tsx', () => {
        const file: File = {
            src: 'a.tsx',
            dest: 'a.js',
            content: 'const el = <div />;',
            ext: '.tsx',
        }

        const result = processTs(file, makeConfig(false))

        expect(result).not.toContain('<div')
    })

    it('minifies transpiled output when minify is enabled', () => {
        const file: File = {
            src: 'a.ts',
            dest: 'a.js',
            content: 'const x: number = 1;\n\n\nconst y: number = 2;',
            ext: '.ts',
        }

        const result = processTs(file, makeConfig(true))

        expect(result).not.toContain('\n\n\n')
    })
})
