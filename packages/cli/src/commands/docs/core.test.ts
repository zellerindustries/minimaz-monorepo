import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CONFIG_FILE_NAME } from "@minimaz/config";
import { buildDocs } from "./core.js";

async function writeConfig(dir: string, docs: unknown): Promise<void> {
    await writeFile(path.join(dir, CONFIG_FILE_NAME), JSON.stringify({ docs }));
}

describe("buildDocs", () => {
    let dir: string;

    beforeEach(async () => {
        dir = await mkdtemp(path.join(tmpdir(), "docs-builder-core-"));
    });

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    it("converts each file individually, preserving relative subfolders", async () => {
        await mkdir(path.join(dir, "docs", "guides"), { recursive: true });
        await writeFile(path.join(dir, "docs", "index.md"), "# Home");
        await writeFile(
            path.join(dir, "docs", "guides", "start.md"),
            "# Start",
        );
        await writeConfig(dir, {
            input: { dir: "docs" },
            output: { bundle: false, formats: ["html", "pdf"] },
        });

        await buildDocs(dir);

        const home = await readFile(
            path.join(dir, "dist", "html", "index.html"),
            "utf8",
        );
        expect(home).toContain("<!DOCTYPE html>");
        expect(home).toContain("<h1>Home</h1>");

        const guide = await readFile(
            path.join(dir, "dist", "html", "guides", "start.html"),
            "utf8",
        );
        expect(guide).toContain("<h1>Start</h1>");

        const pdf = await readFile(
            path.join(dir, "dist", "pdf", "index.pdf"),
            "utf8",
        );
        expect(pdf.startsWith("%PDF-1.4\n")).toBe(true);
    });

    it("bundles every file into a single converted output when docs.output.bundle is true", async () => {
        await mkdir(path.join(dir, "docs"), { recursive: true });
        await writeFile(path.join(dir, "docs", "a.md"), "First.");
        await writeFile(path.join(dir, "docs", "b.md"), "Second.");
        await writeConfig(dir, {
            input: { dir: "docs" },
            output: { bundle: true, formats: ["html"] },
        });

        await buildDocs(dir);

        const bundled = await readFile(
            path.join(dir, "dist", "html", "bundle.html"),
            "utf8",
        );
        expect(bundled).toContain("First.");
        expect(bundled).toContain("Second.");
        await expect(
            readFile(path.join(dir, "dist", "html", "a.html"), "utf8"),
        ).rejects.toThrow();
    });
});
