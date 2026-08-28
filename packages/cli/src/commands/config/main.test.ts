import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { config } from "./main.js";

describe("config", () => {
    let globalDir: string;
    let templatesDir: string;

    beforeEach(async () => {
        globalDir = await mkdtemp(path.join(tmpdir(), "site-builder-config-"));
        templatesDir = path.join(globalDir, "templates");
    });

    afterEach(async () => {
        await rm(globalDir, { recursive: true, force: true });
    });

    it("seeds default templates and settings.json", async () => {
        await config(globalDir, templatesDir, false);

        const defaultConfig = await readFile(
            path.join(templatesDir, "default", "minimaz.config.json"),
            "utf8",
        );
        expect(defaultConfig).toContain("input");

        const settings = await readFile(
            path.join(globalDir, "settings.json"),
            "utf8",
        );
        expect(JSON.parse(settings)).toHaveProperty(
            "templatesPath",
            templatesDir,
        );
    });
});
