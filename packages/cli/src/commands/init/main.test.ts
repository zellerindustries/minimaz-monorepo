import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathExists } from "@minimaz/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { init } from "./main.js";

describe("init", () => {
    let root: string;
    let templatesDir: string;
    let targetDir: string;

    beforeEach(async () => {
        root = await mkdtemp(path.join(tmpdir(), "site-builder-init-"));
        templatesDir = path.join(root, "templates");
        await mkdir(path.join(templatesDir, "simple"), { recursive: true });
        await writeFile(
            path.join(templatesDir, "simple", "index.html"),
            "<html></html>",
        );
        targetDir = path.join(root, "my-project");
    });

    afterEach(async () => {
        await rm(root, { recursive: true, force: true });
    });

    it("copies the chosen template and writes minimaz.config.json, with npm/git disabled", async () => {
        await init(
            "my-project",
            { template: "simple", npm: false, git: false },
            targetDir,
            templatesDir,
        );

        const html = await readFile(path.join(targetDir, "index.html"), "utf8");
        expect(html).toBe("<html></html>");

        const config = await readFile(
            path.join(targetDir, "minimaz.config.json"),
            "utf8",
        );
        expect(JSON.parse(config)).toHaveProperty("input");
    });

    it("throws when the target directory already exists", async () => {
        await mkdir(targetDir, { recursive: true });

        await expect(
            init(
                "my-project",
                { template: "simple", npm: false, git: false },
                targetDir,
                templatesDir,
            ),
        ).rejects.toThrow("already exists");
    });

    it("does not overwrite an existing minimaz.config.json", async () => {
        const templateCustomConfig = {
            custom: true,
            externals: { mylib: "path" },
        };
        await writeFile(
            path.join(templatesDir, "simple", "minimaz.config.json"),
            JSON.stringify(templateCustomConfig),
        );

        await init(
            "my-project",
            { template: "simple", npm: false, git: false },
            targetDir,
            templatesDir,
        );

        const config = await readFile(
            path.join(targetDir, "minimaz.config.json"),
            "utf8",
        );
        expect(JSON.parse(config)).toEqual(templateCustomConfig);
    });

    it("removes targetDir and preserves the original error when git init fails", async () => {
        await expect(
            init(
                "my-project",
                {
                    template: "simple",
                    npm: false,
                    git: true,
                    gitprovider: "not-a-real-provider",
                },
                targetDir,
                templatesDir,
            ),
        ).rejects.toThrow("Unsupported git provider");

        expect(await pathExists(targetDir)).toBe(false);
    });
});
