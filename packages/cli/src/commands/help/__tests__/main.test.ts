import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { commandsHelp } from '../constants.js'
import { help } from '../main.js'

const originalVerbose = process.env['VERBOSE']

beforeEach(() => {
    process.env['VERBOSE'] = 'false'
})

afterEach(() => {
    if (originalVerbose === undefined) {
        delete process.env['VERBOSE']
    } else {
        process.env['VERBOSE'] = originalVerbose
    }
})

function captureLines(run: () => void): string[] {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    run()
    return logSpy.mock.calls.map((call) => String(call[0]))
}

describe('help', () => {
    it('prints a usage header followed by every command', () => {
        const lines = captureLines(() => {
            help()
        })

        expect(lines[0]).toBe('[app] Usage:\n')
        for (const cmd of Object.values(commandsHelp)) {
            expect(lines).toContain(`[app] ${cmd.usage}`)
        }
    })

    it('prints only the requested command', () => {
        const lines = captureLines(() => {
            help('build')
        })

        expect(lines).toContain('[app] minimaz build [--overwrite]')
        expect(lines).not.toContain('[app] minimaz clear')
        expect(lines).not.toContain('[app] Usage:\n')
    })

    it("prints a command's options", () => {
        const lines = captureLines(() => {
            help('template')
        })

        expect(lines).toContain('[app] \tOptions:')
    })

    it.each([
        ['i', 'minimaz init'],
        ['t', 'minimaz template'],
        ['b', 'minimaz build'],
    ])('resolves the alias "%s" to its command entry', (alias, usagePrefix) => {
        const lines = captureLines(() => {
            help(alias)
        })

        expect(lines[0]).toContain(usagePrefix)
        expect(lines).toContain(`[app] \tAlias: ${alias}`)
    })

    it('prints no usage line with a " | " alias separator', () => {
        const lines = captureLines(() => {
            help()
        })

        for (const cmd of Object.values(commandsHelp)) {
            expect(cmd.usage).not.toContain(' | ')
        }
        expect(
            lines.some((line) => line.startsWith('[app] minimaz ') && line.includes(' | ')),
        ).toBe(false)
    })

    it('does not resolve inherited Object properties as commands', () => {
        expect(
            captureLines(() => {
                help('constructor')
            }),
        ).toEqual(['[app] No help found for: constructor\n'])
    })

    it('says so for an unknown command', () => {
        expect(
            captureLines(() => {
                help('nope')
            }),
        ).toEqual(['[app] No help found for: nope\n'])
    })
})
