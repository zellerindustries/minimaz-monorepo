#!/usr/bin/env node

import { build } from 'esbuild'
import { readdir, readFile, rm, stat } from 'node:fs/promises'
import { builtinModules } from 'node:module'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleCliError } from '@minimaz/errors'
import { createLogger } from '@minimaz/logger'
import type { EntryPoint, PackageManifest } from './types.js'

const log = createLogger('builder')

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
    } else if (manifest.bin !== undefined) {
        for (const binPath of Object.values(manifest.bin)) {
            distPaths.add(binPath)
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
 * Bundles a single package's entry points with `esbuild`.
 */
export async function buildPackage(packageDir: string): Promise<void> {
    const manifestRaw = await readFile(join(packageDir, 'package.json'), 'utf8')
    const manifest = JSON.parse(manifestRaw) as PackageManifest

    log.info(`Building ${manifest.name}`)

    const entryPoints = resolveEntryPoints(manifest, packageDir)
    const external = resolveExternals(manifest)

    for (const entry of entryPoints) {
        log.debug(`Bundling ${entry.srcPath} -> ${entry.outfile}`)

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

    const deletedTestDeclarations = await cleanupTestDeclarations(join(packageDir, 'dist'))

    if (deletedTestDeclarations) {
        log.debug(`Removed stray test declarations from ${manifest.name}'s dist`)

        const tsBuildInfoPath = join(
            packageDir,
            'node_modules',
            '.cache',
            'tsc',
            `${basename(packageDir)}.tsbuildinfo`,
        )

        await rm(tsBuildInfoPath, { force: true }).catch(() => undefined)
    }

    log.success(`Built ${manifest.name}`)
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

        log.info(`Discovered ${String(dirs.length)} candidate package directories`)

        for (const dir of dirs) {
            try {
                // Skip if the directory doesn't have a package.json
                await stat(join(dir, 'package.json'))
                await buildPackage(dir)
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

        log.success('Build complete')
    } catch (error: unknown) {
        handleCliError(error)
    }
}

run().catch((err: unknown) => {
    console.error('Error during build:', err)
    process.exit(1)
})
