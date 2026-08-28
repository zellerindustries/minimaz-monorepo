import { extname } from "node:path";
import { getFileContent, pathExists } from "@minimaz/core";
import { log } from "@minimaz/logger";
import {
    validateCss,
    validateHtml,
    validateJs,
    validateJson,
    validateTs,
} from "@minimaz/validate";

/**
 * Validates a CSS, HTML, JS, TS, or JSON file (dispatched by extension)
 * using `@minimaz/validate`. Logs a success message and returns on a valid
 * file; throws (propagating the validator's own collected `errors`) on an
 * invalid one, missing file, missing `path`, or unsupported extension.
 *
 * @param {string} path - Path to the file to validate
 */
export async function validate(path: string): Promise<void> {
    if (!path) {
        throw new Error("validate: --path is required");
    }

    if (!(await pathExists(path))) {
        throw new Error(`validate: file not found: ${path}`);
    }

    const content = await getFileContent(path);
    const ext = extname(path).toLowerCase();

    switch (ext) {
        case ".css":
            validateCss(content);
            break;
        case ".html":
        case ".htm":
            validateHtml(content);
            break;
        case ".js":
        case ".mjs":
        case ".cjs":
            validateJs(content);
            break;
        case ".ts":
        case ".mts":
        case ".cts":
            validateTs(content);
            break;
        case ".tsx":
            validateTs(content, { jsx: true });
            break;
        case ".json":
            validateJson(content);
            break;
        default:
            throw new Error(`validate: unsupported file extension "${ext}"`);
    }

    log.success(`Valid: ${path}`);
}
