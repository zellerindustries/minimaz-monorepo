import { extname } from 'node:path'

const mimeTypes: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain; charset=utf-8',
}

const defaultMimeType = 'application/octet-stream'

/**
 * Resolves the content type for a file path based on its extension,
 * falling back to a generic binary type for anything unrecognized.
 *
 * @param {string} filePath - The file path to resolve a content type for
 * @returns {string} The resolved `Content-Type` header value
 */
export function resolveMimeType(filePath: string): string {
    const ext = extname(filePath).toLowerCase()
    return mimeTypes[ext] ?? defaultMimeType
}
