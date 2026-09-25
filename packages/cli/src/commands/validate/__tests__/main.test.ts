import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
    CssValidationError,
    HtmlValidationError,
    JsValidationError,
    JsonValidationError,
    TsValidationError,
} from '@minimaz/validate'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { validate } from '../main.js'

describe('validate command', () => {
    let dir: string

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'cli-validate-'))
        vi.spyOn(console, 'log').mockImplementation(() => undefined)
    })

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true })
    })

    async function file(name: string, content: string): Promise<string> {
        const fullPath = join(dir, name)
        await writeFile(fullPath, content, 'utf8')
        return fullPath
    }

    it('requires a path', async () => {
        await expect(validate('')).rejects.toThrow('validate: --path is required')
    })

    it('rejects a missing file', async () => {
        await expect(validate(join(dir, 'missing.css'))).rejects.toThrow(
            /^validate: file not found: /,
        )
    })

    it('logs success for a valid file', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
        const path = await file('ok.css', 'a { b: c }')

        await validate(path)

        expect(logSpy.mock.calls.some((call) => String(call[0]).includes(`Valid: ${path}`))).toBe(
            true,
        )
    })

    it('matches the extension case-insensitively', async () => {
        await expect(validate(await file('ok.CSS', 'a { b: c }'))).resolves.toBeUndefined()
    })

    it.each([
        ['bad.css', 'a { b: c', CssValidationError],
        ['bad.htm', '<div>', HtmlValidationError],
        ['bad.mjs', 'const = 1', JsValidationError],
        ['bad.ts', 'const e = <div />', TsValidationError],
        ['bad.json', '{a:1}', JsonValidationError],
    ])('dispatches %s to the right validator', async (name, content, errorClass) => {
        await expect(validate(await file(name, content))).rejects.toBeInstanceOf(errorClass)
    })

    it('validates .tsx with JSX enabled', async () => {
        await expect(validate(await file('ok.tsx', 'const e = <div />'))).resolves.toBeUndefined()
    })

    it('rejects an unsupported extension', async () => {
        await expect(validate(await file('notes.txt', 'x'))).rejects.toThrow(
            'validate: unsupported file extension ".txt"',
        )
    })
})
