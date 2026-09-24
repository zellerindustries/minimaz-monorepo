import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCli } from '@minimaz/cli'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@minimaz/cli', () => ({
    runCli: vi.fn(() => Promise.resolve()),
}))

describe('sitekit bin', () => {
    it("runs the CLI with sitekit's own package.json, so version reports sitekit's version", async () => {
        await import('../main.js')

        const expected = join(
            dirname(fileURLToPath(import.meta.url)),
            '..',
            '..',
            '..',
            'package.json',
        )
        expect(runCli).toHaveBeenCalledWith(expected)
    })
})
