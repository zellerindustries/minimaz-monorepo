import {
    cp,
    lstat,
    mkdir,
    readdir,
    readFile,
    rm,
    stat,
    writeFile,
} from "node:fs/promises";

import { dirname } from "node:path";

import { log } from "@minimaz/logger";

/* =========================================================
    VALIDATION / INSPECTION
========================================================= */

/**
 * Checks whether a filesystem path exists.
 *
 * Returns:
 * - true → path is accessible
 * - false → path does not exist or cannot be accessed
 *
 * Uses `stat()` internally to support both files and directories.
 *
 * @param {string} path - File or directory path
 * @returns {Promise<boolean>}
 */
export async function pathExists(path: string): Promise<boolean> {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

/**
 * Reads and parses a JSON file.
 *
 * Provides:
 * - existence validation
 * - UTF-8 decoding
 * - normalized parse errors
 *
 * @template T
 * @param {string} file - Path to JSON file
 * @returns {Promise<T>}
 */
export async function readJsonFile<T>(file: string): Promise<T> {
    const exists = await pathExists(file);

    if (!exists) {
        throw new Error(`NOT FOUND: "${file}" does not exist`);
    }

    try {
        const content = await readFile(file, "utf8");

        return JSON.parse(content) as T;
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);

        throw new Error(
            `PARSE ERROR: Failed to parse JSON in "${file}" - ${message}`,
            {
                cause: error,
            },
        );
    }
}

/**
 * Reads directory contents and returns file/folder names.
 *
 * Returns an empty array when the directory does not exist
 * instead of throwing.
 *
 * @param {string} dir - Directory path
 * @returns {Promise<string[]>}
 */
export async function getDirElements(dir: string): Promise<string[]> {
    log.debug(`Reading directory: ${dir}`);

    const exists = await pathExists(dir);

    if (!exists) {
        log.warn(`Directory does not exist: ${dir}`);
        return [];
    }

    return await readdir(dir);
}

/* =========================================================
    FILESYSTEM MUTATION
========================================================= */

/**
 * Removes a file or directory recursively.
 *
 * Behavior mirrors `rm -rf`:
 * - recursive deletion enabled
 * - ignores missing targets
 *
 * @param {string} path - File or directory path to remove
 */
export async function remove(path: string): Promise<void> {
    await rm(path, {
        recursive: true,
        force: true,
    });
}

/**
 * Ensures a directory exists.
 *
 * Creates the full directory tree when missing
 * (equivalent to `mkdir -p`).
 *
 * Safe to call on existing directories.
 *
 * @param {string} path - Directory path to create
 */
export async function ensureDir(path: string): Promise<void> {
    await mkdir(path, {
        recursive: true,
    });
}

/**
 * Copies a file or directory.
 *
 * Supports:
 * - recursive directory copy
 * - optional overwrite behavior
 *
 * @param {string} src - Source path
 * @param {string} dest - Destination path
 * @param {boolean} [overwrite=false] - Replace existing targets when true
 */
export async function copy(
    src: string,
    dest: string,
    overwrite = false,
): Promise<void> {
    if (overwrite) {
        log.debug(`${dest} exists, removing...`);
        await rm(dest, { recursive: true, force: true });
    }

    log.debug(`[COPY] ${src} to ${dest}...`);
    await cp(src, dest, { recursive: true });
}

/**
 * Writes a file while ensuring parent directories exist.
 *
 * Equivalent to `fs-extra.outputFile`.
 *
 * Responsibilities:
 * - resolve parent directory
 * - create missing directory tree
 * - write file content
 *
 * @param {string} path - Destination file path
 * @param {string | Uint8Array} data - File content
 * @param options - Optional writeFile options
 */
export async function outputFile(
    path: string,
    data: string | Uint8Array,
    options?: Parameters<typeof writeFile>[2],
): Promise<void> {
    const dir = dirname(path);

    // Ensure target directory exists before writing
    await mkdir(dir, {
        recursive: true,
    });

    // Default to UTF-8 for text content
    await writeFile(path, data, options ?? "utf8");
}
/**
 * Checks if a path is a directory.
 *
 * Returns false if the path does not exist or is a file.
 *
 * @param {string} path - Path to check
 * @returns {Promise<boolean>}
 */
export async function isDirectory(path: string): Promise<boolean> {
    return lstat(path)
        .then((stats) => stats.isDirectory())
        .catch(() => false);
}

/**
 * Reads the content of a file as a UTF-8 string.
 *
 * Returns an empty string if the file cannot be read,
 * ensuring the CLI continues execution.
 *
 * @param {string} path - Path to the file
 * @returns {Promise<string>}
 */
export async function getFileContent(path: string): Promise<string> {
    try {
        return await readFile(path, "utf8");
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`Failed to read file at "${path}": ${message}`);
        return "";
    }
}
