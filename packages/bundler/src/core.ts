import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { transpileTs } from '@minimaz/ts'
import type { ModuleGraphResult } from './types.js'

async function loadAndTranspile(filePath: string): Promise<string> {
    const raw = await readFile(filePath, 'utf8')
    const ext = extname(filePath)

    if (ext === '.ts' || ext === '.tsx') {
        return transpileTs(raw, { jsx: ext === '.tsx' })
    }

    return raw
}

/**
 * Walks `entryPath`'s relative JS/TS import graph, transpiling TypeScript
 * along the way, and returns every reachable module's rewritten contents
 * keyed by absolute source path.
 *
 * @param {string} entryPath - Absolute path to the entry file.
 * @returns {Promise<ModuleGraphResult>} Every reachable module's contents.
 */
export async function resolveModuleGraph(entryPath: string): Promise<ModuleGraphResult> {
    const modules = new Map<string, string>()
    const contents = await loadAndTranspile(entryPath)
    modules.set(entryPath, contents)
    return { modules }
}
