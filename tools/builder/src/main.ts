#!/usr/bin/env node

import { build } from 'esbuild'
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { builtinModules } from 'node:module'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleCliError } from '@minimaz/errors'
import type { EntryPoint, PackageManifest } from './types.js'

/**
 * Normalizes and strips leading `dist/` or `./dist/` from target paths.
 */
function replaceDistPrefix(pathStr: string): string {
    return pathStr.replace(/^(\.\/)?dist\//, './')
}

/**
 * Recursively rewrites paths within conditional `exports` objects.
 */
function sanitizeExports(exportsObj: unknown): unknown {
    if (typeof exportsObj === 'string') {
        return replaceDistPrefix(exportsObj)
    }
    if (Array.isArray(exportsObj)) {
        return exportsObj.map((item: unknown): unknown => sanitizeExports(item))
    }
    if (exportsObj !== null && typeof exportsObj === 'object') {
        const result: Record<string, unknown> = {}
        for (const [key, val] of Object.entries(exportsObj as Record<string, unknown>)) {
            result[key] = sanitizeExports(val)
        }
        return result
    }
    return exportsObj
}

/**
 * Checks if a given file path exists and is a regular file.
 */
async function fileExists(filePath: string): Promise<boolean> {
    try {
        const stats = await stat(filePath)
        return stats.isFile()
    } catch {
        return false
    }
}

/**
 * Copies the first existing file from candidate names, checking package folder first then repo root.
 */
async function copyAssetWithFallback(
    packageDir: string,
    repoRoot: string,
    distDir: string,
    filenames: string[],
): Promise<void> {
    // 1. Check package directory
    for (const name of filenames) {
        const pkgFilePath = join(packageDir, name)
        if (await fileExists(pkgFilePath)) {
            await copyFile(pkgFilePath, join(distDir, name))
            return
        }
    }

    // 2. Fall back to repository root
    for (const name of filenames) {
        const rootFilePath = join(repoRoot, name)
        if (await fileExists(rootFilePath)) {
            await copyFile(rootFilePath, join(distDir, name))
            return
        }
    }
}

/**
 * Resolves a package's real esbuild entry points from its `main`/`bin`
 * fields, mapping each `dist/*.js` path back to the matching `src/*.ts`
 * source path.
 */
export function resolveEntryPoints(manifest: PackageManifest, packageDir: string): EntryPoint[] {
    const distPaths = new Set<string>()

    if (manifest.main !== undefined) {
        distPaths.add(manifest.main)
    }

    if (typeof manifest.bin === 'string') {
        distPaths.add(manifest.bin)
    } else if (manifest.bin !== undefined && manifest.bin !== null) {
        const binRecord = manifest.bin as Record<string, string>
        for (const binPath of Object.values(binRecord)) {
            if (typeof binPath === 'string') {
                distPaths.add(binPath)
            }
        }
    }

    const pathArray = Array.from(distPaths)

    return pathArray.map((distPath: string): EntryPoint => {
        const normalized = distPath.replace(/^\.\//, '')

        if (!normalized.startsWith('dist/') || !normalized.endsWith('.js')) {
            throw new Error(
                `Cannot resolve entry point "${distPath}" - expected a "dist/*.js" path`,
            )
        }

        const srcRelative = normalized.slice('dist/'.length).replace(/\.js$/, '.ts')

        return {
            srcPath: join(packageDir, 'src', srcRelative),
            outfile: join(packageDir, normalized),
        }
    })
}

/**
 * Builds the `esbuild` `external` list from a package's declared
 * dependencies plus all Node.js built-ins.
 */
export function resolveExternals(manifest: PackageManifest): string[] {
    return [
        ...Object.keys(manifest.dependencies ?? {}),
        ...Object.keys(manifest.devDependencies ?? {}),
        ...builtinModules,
        ...builtinModules.map((m: string): string => `node:${m}`),
    ]
}

/**
 * Deletes leftover `*.test.d.ts` and test-related build artifacts.
 */
export async function cleanupTestDeclarations(distDir: string): Promise<boolean> {
    let entries: string[]

    try {
        entries = await readdir(distDir, { recursive: true })
    } catch {
        return false
    }

    let deletedAny = false

    for (const entry of entries) {
        if (/\.(test|spec)\.(d\.ts|js)(\.map)?$/.test(entry)) {
            const fullPath = join(distDir, entry)
            const stats = await stat(fullPath)

            if (stats.isFile()) {
                await rm(fullPath, { force: true })
                deletedAny = true
            }
        }
    }

    return deletedAny
}

/**
 * Finalizes the `dist/` folder by generating a distribution-ready `package.json`,
 * copying the LICENSE, and ensuring README documentation is available.
 */
export async function finalizeDistPackage(
    packageDir: string,
    repoRoot: string,
    manifest: PackageManifest,
): Promise<void> {
    const distDir = join(packageDir, 'dist')
    await mkdir(distDir, { recursive: true })

    // 1. Prepare sanitized package.json for publishing
    const distManifest: PackageManifest = { ...manifest }

    delete distManifest.devDependencies
    delete distManifest.scripts

    if (typeof distManifest.main === 'string') {
        distManifest.main = replaceDistPrefix(distManifest.main)
    }
    if (typeof distManifest.module === 'string') {
        distManifest.module = replaceDistPrefix(distManifest.module)
    }
    if (typeof distManifest.types === 'string') {
        distManifest.types = replaceDistPrefix(distManifest.types)
    }

    if (typeof distManifest.bin === 'string') {
        distManifest.bin = replaceDistPrefix(distManifest.bin)
    } else if (distManifest.bin && typeof distManifest.bin === 'object') {
        const binRecord = distManifest.bin
        const newBin: Record<string, string> = {}

        for (const [key, val] of Object.entries(binRecord)) {
            newBin[key] = replaceDistPrefix(val)
        }

        distManifest.bin = newBin
    }

    if (distManifest.exports !== undefined) {
        distManifest.exports = sanitizeExports(distManifest.exports)
    }

    await writeFile(
        join(distDir, 'package.json'),
        JSON.stringify(distManifest, null, 2) + '\n',
        'utf8',
    )

    // 2. Copy LICENSE
    await copyAssetWithFallback(packageDir, repoRoot, distDir, [
        'LICENSE',
        'LICENSE.md',
        'LICENSE.txt',
        'LICENCE',
    ])

    // 3. Copy README
    await copyAssetWithFallback(packageDir, repoRoot, distDir, ['README.md', 'readme.md', 'README'])
}

/**
 * Bundles a single package's entry points with `esbuild`.
 */
export async function buildPackage(packageDir: string, repoRoot: string): Promise<void> {
    const manifestRaw = await readFile(join(packageDir, 'package.json'), 'utf8')
    const manifest = JSON.parse(manifestRaw) as PackageManifest

    const entryPoints = resolveEntryPoints(manifest, packageDir)
    const external = resolveExternals(manifest)

    for (const entry of entryPoints) {
        await build({
            entryPoints: [entry.srcPath],
            outfile: entry.outfile,
            bundle: true,
            minify: true,
            platform: 'node',
            format: 'esm',
            sourcemap: false,
            treeShaking: true,
            legalComments: 'none',
            target: 'node24',
            external,
        })
    }

    await finalizeDistPackage(packageDir, repoRoot, manifest)

    const deletedTestDeclarations = await cleanupTestDeclarations(join(packageDir, 'dist'))

    if (deletedTestDeclarations) {
        const tsBuildInfoPath = join(
            packageDir,
            'node_modules',
            '.cache',
            'tsc',
            `${basename(packageDir)}.tsbuildinfo`,
        )

        await rm(tsBuildInfoPath, { force: true }).catch(() => undefined)
    }
}

/**
 * Resolves the monorepo root from this module's own file location, so the
 * builder always operates on the whole repo regardless of the invoking
 * process's `cwd` (a per-package `npm run build` script runs with `cwd` set
 * to that package's own directory, not the repo root).
 */
export function resolveRepoRoot(moduleUrl: string): string {
    const moduleDir = dirname(fileURLToPath(moduleUrl))
    return join(moduleDir, '..', '..', '..')
}

/**
 * Discovers every workspace package directory across packages, toolkits, and tools.
 */
export async function discoverPackageDirs(repoRoot: string): Promise<string[]> {
    const groups = ['packages', 'toolkits', 'tools']
    const dirs: string[] = []

    for (const group of groups) {
        const groupDir = join(repoRoot, group)
        let entries

        try {
            entries = await readdir(groupDir, { withFileTypes: true })
        } catch (error: unknown) {
            if (
                error !== null &&
                typeof error === 'object' &&
                'code' in error &&
                (error as { code?: string }).code === 'ENOENT'
            ) {
                continue
            }
            throw error
        }

        for (const entry of entries) {
            if (entry.isDirectory()) {
                dirs.push(join(groupDir, entry.name))
            }
        }
    }

    return dirs
}

async function run(): Promise<void> {
    try {
        const repoRoot = resolveRepoRoot(import.meta.url)
        const dirs = await discoverPackageDirs(repoRoot)

        for (const dir of dirs) {
            try {
                // Skip if the directory doesn't have a package.json
                await stat(join(dir, 'package.json'))
                await buildPackage(dir, repoRoot)
            } catch (error: unknown) {
                // If it lacks package.json, skip silently; otherwise throw annotated error
                if (
                    error !== null &&
                    typeof error === 'object' &&
                    'code' in error &&
                    (error as { code?: string }).code === 'ENOENT'
                ) {
                    continue
                }
                throw new Error(
                    `${dir}: ${error instanceof Error ? error.message : String(error)}`,
                    { cause: error },
                )
            }
        }
    } catch (error: unknown) {
        handleCliError(error)
    }
}

run().catch((err: unknown) => {
    console.error('Error during build:', err)
    process.exit(1)
})
