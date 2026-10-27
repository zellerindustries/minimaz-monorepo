// Bundles the current package's entry points with esbuild. Run from a package directory, after `tsc` has emitted
// declarations: `tsc -b tsconfig.build.json && node ../../scripts/bundle.mjs`.
//
// Each `main`/`bin` path in package.json (`dist/<name>.js`) is bundled from `src/<name>.ts`. Dependencies and Node
// built-ins stay external, so cross-package `@minimaz/*` imports still resolve through the workspace at runtime.
import { copyFile, readdir, readFile, rm } from 'node:fs/promises'
import { builtinModules } from 'node:module'
import { join } from 'node:path'
import { build } from 'esbuild'

const pkg = JSON.parse(await readFile('package.json', 'utf8'))

const bins = typeof pkg.bin === 'string' ? [pkg.bin] : Object.values(pkg.bin ?? {})
const outfiles = new Set(
    [pkg.main, ...bins]
        .filter((path) => path !== undefined)
        .map((path) => path.replace(/^\.\//, '')),
)

const external = [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...builtinModules,
    ...builtinModules.map((name) => `node:${name}`),
]

for (const outfile of outfiles) {
    if (!/^dist\/.+\.js$/.test(outfile)) {
        throw new Error(`${pkg.name}: entry point "${outfile}" must be a dist/*.js path`)
    }

    await build({
        entryPoints: [outfile.replace(/^dist\//, 'src/').replace(/\.js$/, '.ts')],
        outfile,
        bundle: true,
        minify: true,
        platform: 'node',
        format: 'esm',
        target: 'node24',
        legalComments: 'none',
        external,
    })
}

// A plain `tsc -b` (npm run typecheck) also compiles the __tests__ files into dist/ — keep them out of the package:
// whole __tests__/__mocks__ directories (test helpers included), plus *.test/*.spec files anywhere else.
const distEntries = await readdir('dist', { recursive: true, withFileTypes: true }).catch(() => [])
for (const entry of distEntries) {
    const path = join(entry.parentPath, entry.name)
    if (entry.isDirectory() && (entry.name === '__tests__' || entry.name === '__mocks__')) {
        await rm(path, { recursive: true, force: true })
    } else if (entry.isFile() && /\.(test|spec)\.(js|d\.ts)(\.map)?$/.test(entry.name)) {
        await rm(path, { force: true })
    }
}

// npm only auto-includes a LICENSE found in the package root, so ship the repo's one with every package.
await copyFile('../../LICENSE', 'LICENSE')

console.log(`Bundled ${pkg.name}`)
