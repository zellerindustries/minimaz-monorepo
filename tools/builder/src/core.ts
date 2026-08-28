import { build } from "esbuild";
import { readdir, readFile, rm, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import type { EntryPoint, PackageManifest } from "./types.js";

/**
 * Resolves a package's real esbuild entry points from its `main`/`bin`
 * fields, mapping each `dist/*.js` path back to the matching `src/*.ts`
 * source path. Multiple `bin` entries that point at the same compiled file
 * (e.g. `minimaz`/`mz` both resolving to `dist/cli/main.js`) collapse into
 * one entry point.
 *
 * @param {PackageManifest} manifest - Parsed `package.json` of the target package
 * @param {string} packageDir - Absolute path to the package directory
 * @returns {EntryPoint[]}
 */
export function resolveEntryPoints(
    manifest: PackageManifest,
    packageDir: string,
): EntryPoint[] {
    const distPaths = new Set<string>();

    if (manifest.main !== undefined) {
        distPaths.add(manifest.main);
    }

    if (typeof manifest.bin === "string") {
        distPaths.add(manifest.bin);
    } else if (manifest.bin !== undefined) {
        for (const binPath of Object.values(manifest.bin)) {
            distPaths.add(binPath);
        }
    }

    return [...distPaths].map((distPath) => {
        const normalized = distPath.replace(/^\.\//, "");

        if (!normalized.startsWith("dist/") || !normalized.endsWith(".js")) {
            throw new Error(
                `Cannot resolve entry point "${distPath}" - expected a "dist/*.js" path`,
            );
        }

        const srcRelative = normalized
            .slice("dist/".length)
            .replace(/\.js$/, ".ts");

        return {
            srcPath: join(packageDir, "src", srcRelative),
            outfile: join(packageDir, normalized),
        };
    });
}

/**
 * Builds the `esbuild` `external` list from a package's declared
 * dependencies plus Node builtins.
 *
 * @param {PackageManifest} manifest - Parsed `package.json` of the target package
 * @returns {string[]}
 */
export function resolveExternals(manifest: PackageManifest): string[] {
    return [
        ...Object.keys(manifest.dependencies ?? {}),
        ...Object.keys(manifest.devDependencies ?? {}),
        "node:*",
    ];
}

/**
 * Deletes leftover `*.test.d.ts` (and matching `.map`) declaration files
 * from a build output directory. `tsc` type-checks and declares every file
 * in the program, including colocated tests, so these are the only test
 * artifacts that survive `emitDeclarationOnly` + esbuild's reachability-based
 * bundling.
 *
 * @param {string} distDir - Absolute path to the package's `dist` directory
 * @returns {Promise<boolean>} Whether any file was deleted
 */
export async function cleanupTestDeclarations(
    distDir: string,
): Promise<boolean> {
    let entries: string[];

    try {
        entries = await readdir(distDir, { recursive: true });
    } catch {
        return false;
    }

    let deletedAny = false;

    for (const entry of entries) {
        if (/\.(test|spec)\.d\.ts(\.map)?$/.test(entry)) {
            const fullPath = join(distDir, entry);
            const stats = await stat(fullPath);

            if (stats.isFile()) {
                await rm(fullPath, { force: true });
                deletedAny = true;
            }
        }
    }

    return deletedAny;
}

/**
 * Bundles a single package's `main`/`bin` entry points with `esbuild` and
 * removes the leftover `*.test.d.ts` files `tsc`'s declaration pass leaves
 * behind. Reads `package.json` from `packageDir`; `dependencies` and
 * `devDependencies` are externalized rather than bundled, so cross-package
 * `@minimaz/*` imports resolve at runtime the normal npm-workspace way, and
 * bundling order across packages doesn't matter. Also removes that
 * package's `.tsbuildinfo` cache file whenever a test declaration was
 * deleted, forcing a full rebuild next time instead of a `tsc -b`
 * incremental-state mismatch (TS6305).
 *
 * @param {string} packageDir - Absolute path to the package directory
 */
export async function buildPackage(packageDir: string): Promise<void> {
    const manifestRaw = await readFile(
        join(packageDir, "package.json"),
        "utf8",
    );
    const manifest = JSON.parse(manifestRaw) as PackageManifest;

    const entryPoints = resolveEntryPoints(manifest, packageDir);
    const external = resolveExternals(manifest);

    for (const entry of entryPoints) {
        await build({
            entryPoints: [entry.srcPath],
            outfile: entry.outfile,
            bundle: true,
            minify: true,
            platform: "node",
            format: "esm",
            sourcemap: false,
            treeShaking: true,
            legalComments: "none",
            target: "node24",
            external,
        });
    }

    const deletedTestDeclarations = await cleanupTestDeclarations(
        join(packageDir, "dist"),
    );

    if (deletedTestDeclarations) {
        const tsBuildInfoPath = join(
            packageDir,
            "node_modules",
            ".cache",
            "tsc",
            `${basename(packageDir)}.tsbuildinfo`,
        );

        await rm(tsBuildInfoPath);
    }
}

/**
 * Discovers every `packages/*` and `toolkits/*` package directory, for the
 * CLI's `--all` mode. Must be called with the repo root as `repoRoot` — the
 * root build script's contract is that it always invokes this from there.
 *
 * @param {string} repoRoot - Absolute path to the repo root
 * @returns {Promise<string[]>}
 */
export async function discoverPackageDirs(repoRoot: string): Promise<string[]> {
    const groups = ["packages", "toolkits"];
    const dirs: string[] = [];

    for (const group of groups) {
        const groupDir = join(repoRoot, group);
        let entries;

        try {
            entries = await readdir(groupDir, { withFileTypes: true });
        } catch (error: unknown) {
            if (
                error instanceof Error &&
                "code" in error &&
                error.code === "ENOENT"
            ) {
                continue;
            }

            throw error;
        }

        for (const entry of entries) {
            if (entry.isDirectory()) {
                dirs.push(join(groupDir, entry.name));
            }
        }
    }

    return dirs;
}
