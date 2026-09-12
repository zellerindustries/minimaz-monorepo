#!/usr/bin/env node

import { build } from 'esbuild'
import { readdir, readFile, rm, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { handleCliError } from '@minimaz/errors'
import type { EntryPoint, PackageManifest } from './types.js'

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

    return [...distPaths].map((distPath) => {
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
 * dependencies plus Node builtins.
 */
export function resolveExternals(manifest: PackageManifest): string[] {
    return [
        ...Object.keys(manifest.dependencies ?? {}),
        ...Object.keys(manifest.devDependencies ?? {}),
        'node:*',
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

    const deletedTestDeclarations = await cleanupTestDeclarations(join(packageDir, 'dist'))

    if (deletedTestDeclarations) {
        const tsBuildInfoPath = join(
            packageDir,
            'node_modules',
            '.cache',
            'tsc',
            `${basename(packageDir)}.tsbuildinfo`,
        )

        await rm(tsBuildInfoPath, { force: true }).catch((error: unknown) => {
            void error
        })
    }
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
            if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
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
        const dirs = await discoverPackageDirs(process.cwd())

        for (const dir of dirs) {
            try {
                // Skip if the directory doesn't have a package.json
                await stat(join(dir, 'package.json'))
                await buildPackage(dir)
            } catch (error: unknown) {
                // If it lacks package.json, skip silently; otherwise throw annotated error
                if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
                    continue
                }
                const message = error instanceof Error ? error.message : String(error)
                throw new Error(`${dir}: ${message}`, { cause: error })
            }
        }
    } catch (error: unknown) {
        handleCliError(error)
    }
}

run().catch((err) => {
    console.error('Error during build:', err)
    process.exit(1)
})
