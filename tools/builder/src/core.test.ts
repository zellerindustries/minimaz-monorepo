import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    cleanupTestDeclarations,
    discoverPackageDirs,
    resolveEntryPoints,
    resolveExternals,
} from "./core.js";

describe("resolveEntryPoints", () => {
    it("resolves a single main entry point", () => {
        const result = resolveEntryPoints(
            { name: "@minimaz/logger", main: "dist/index.js" },
            "/pkg",
        );

        expect(result).toEqual([
            {
                srcPath: path.join("/pkg", "src", "index.ts"),
                outfile: path.join("/pkg", "dist", "index.js"),
            },
        ]);
    });

    it("resolves main plus multiple bin entries, collapsing duplicates", () => {
        const result = resolveEntryPoints(
            {
                name: "@minimaz/cli",
                main: "./dist/index.js",
                bin: {
                    minimaz: "./dist/cli/main.js",
                    mz: "./dist/cli/main.js",
                },
            },
            "/pkg",
        );

        expect(result).toEqual([
            {
                srcPath: path.join("/pkg", "src", "index.ts"),
                outfile: path.join("/pkg", "dist", "index.js"),
            },
            {
                srcPath: path.join("/pkg", "src", "cli", "main.ts"),
                outfile: path.join("/pkg", "dist", "cli", "main.js"),
            },
        ]);
    });

    it("throws when a bin/main path is not shaped like dist/*.js", () => {
        expect(() =>
            resolveEntryPoints({ name: "bad", main: "index.js" }, "/pkg"),
        ).toThrow('Cannot resolve entry point "index.js"');
    });
});

describe("resolveExternals", () => {
    it("combines dependencies and devDependencies with node builtins", () => {
        const result = resolveExternals({
            name: "@minimaz/cli",
            dependencies: { "@minimaz/core": "*", "cross-spawn": "7.0.6" },
            devDependencies: { "@types/cross-spawn": "6.0.6" },
        });

        expect(result).toEqual([
            "@minimaz/core",
            "cross-spawn",
            "@types/cross-spawn",
            "node:*",
        ]);
    });

    it("returns just node:* when there are no dependencies", () => {
        expect(resolveExternals({ name: "@minimaz/json" })).toEqual(["node:*"]);
    });
});

describe("cleanupTestDeclarations", () => {
    let distDir: string;

    beforeEach(async () => {
        distDir = await mkdtemp(path.join(tmpdir(), "builder-cleanup-"));
    });

    afterEach(async () => {
        await rm(distDir, { recursive: true, force: true });
    });

    it("removes *.test.d.ts (and .map) while leaving other .d.ts untouched", async () => {
        await writeFile(path.join(distDir, "index.d.ts"), "export {};");
        await writeFile(path.join(distDir, "core.test.d.ts"), "export {};");
        await writeFile(path.join(distDir, "core.test.d.ts.map"), "{}");
        await mkdir(path.join(distDir, "cli"), { recursive: true });
        await writeFile(
            path.join(distDir, "cli", "main.test.d.ts"),
            "export {};",
        );

        const deleted = await cleanupTestDeclarations(distDir);

        expect(deleted).toBe(true);

        const remaining = new Set(await readdir(distDir, { recursive: true }));

        expect(remaining.has("index.d.ts")).toBe(true);
        expect(remaining.has("core.test.d.ts")).toBe(false);
        expect(remaining.has("core.test.d.ts.map")).toBe(false);
        expect(remaining.has(path.join("cli", "main.test.d.ts"))).toBe(false);
    });

    it("removes *.spec.d.ts (and .map) while leaving other .d.ts untouched", async () => {
        await writeFile(path.join(distDir, "index.d.ts"), "export {};");
        await writeFile(path.join(distDir, "core.spec.d.ts"), "export {};");
        await writeFile(path.join(distDir, "core.spec.d.ts.map"), "{}");

        const deleted = await cleanupTestDeclarations(distDir);

        expect(deleted).toBe(true);

        const remaining = new Set(await readdir(distDir, { recursive: true }));

        expect(remaining.has("index.d.ts")).toBe(true);
        expect(remaining.has("core.spec.d.ts")).toBe(false);
        expect(remaining.has("core.spec.d.ts.map")).toBe(false);
    });

    it("returns false when there is nothing to delete", async () => {
        await writeFile(path.join(distDir, "index.d.ts"), "export {};");

        await expect(cleanupTestDeclarations(distDir)).resolves.toBe(false);
    });

    it("does nothing when the dist directory does not exist", async () => {
        await expect(
            cleanupTestDeclarations(path.join(distDir, "missing")),
        ).resolves.toBe(false);
    });
});

describe("discoverPackageDirs", () => {
    let repoRoot: string;

    beforeEach(async () => {
        repoRoot = await mkdtemp(path.join(tmpdir(), "builder-discover-"));
    });

    afterEach(async () => {
        await rm(repoRoot, { recursive: true, force: true });
    });

    it("returns packages/* dirs without throwing when toolkits/ does not exist", async () => {
        await mkdir(path.join(repoRoot, "packages", "fake-package"), {
            recursive: true,
        });

        const result = await discoverPackageDirs(repoRoot);

        expect(result).toEqual([
            path.join(repoRoot, "packages", "fake-package"),
        ]);
    });
});
