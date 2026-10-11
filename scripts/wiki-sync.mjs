import { posix } from 'node:path'

// Builds the GitHub wiki tree from docs/. Run from the workflow: `node scripts/wiki-sync.mjs <outDir>`.
//
// docs/README.md becomes the wiki Home page, every other docs/*.md keeps its name, relative links are rewritten
// to wiki links (or absolute GitHub URLs), and a _Sidebar.md is generated. <outDir> is emptied first (except
// .git), so removed docs disappear from the wiki. Pure functions are exported for tests; main() only runs when
// this file is the process entry point.

/**
 * Maps a docs filename to its wiki page name.
 * @param {string} file - filename inside docs/, e.g. `README.md`.
 * @returns {string} `Home` for README.md, otherwise the filename without `.md`.
 */
export function pageName(file) {
    return file === 'README.md' ? 'Home' : file.replace(/\.md$/, '')
}

/**
 * Extracts `owner/name` from a GitHub remote URL (SSH or HTTPS).
 * @param {string} remoteUrl - e.g. `git@github.com:owner/name.git`.
 * @returns {string} `owner/name`.
 * @throws {Error} when the URL isn't a GitHub remote.
 */
export function parseRepo(remoteUrl) {
    const match = /github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/.exec(remoteUrl.trim())
    if (!match) {
        throw new Error(`Cannot derive a GitHub repository from remote URL "${remoteUrl.trim()}"`)
    }
    return match[1]
}

const branch = 'main'
const externalPattern = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i
const fencePattern = /^\s*(?:```|~~~)/
// Alternative 1 consumes a whole inline code span so link-looking text inside it is skipped. Alternative 2 is an
// inline link whose text may itself contain code spans, e.g. [`core`](../packages/core).
const tokenPattern = /`[^`]*`|(!?)\[((?:`[^`]*`|[^\]`])*)\]\(([^)\s]+)((?:\s+"[^"]*")?)\)/g

/**
 * Resolves one link target for the wiki.
 * @param {string} target - the raw target inside `(...)`.
 * @param {RewriteOptions} options - see {@link rewriteLinks}.
 * @returns {{ target: string } | { drop: true }} the new target, or a request to drop the link.
 */
function rewriteTarget(target, options) {
    const { sourceFile, docsPages, repo, kindOf, warn } = options
    if (target.startsWith('#') || externalPattern.test(target)) {
        return { target }
    }
    const hashIndex = target.indexOf('#')
    const linkPath = hashIndex === -1 ? target : target.slice(0, hashIndex)
    const fragment = hashIndex === -1 ? '' : target.slice(hashIndex)
    const resolved = posix
        .normalize(posix.join(posix.dirname(sourceFile), linkPath))
        .replace(/\/$/, '')

    if (resolved.startsWith('..')) {
        warn(`${sourceFile}: link "${target}" points outside the repository`)
        return { target }
    }
    const docsMatch = /^docs\/([^/]+\.md)$/.exec(resolved)
    if (docsMatch && docsPages.has(docsMatch[1])) {
        return { target: `${pageName(docsMatch[1])}${fragment}` }
    }
    // .claude/ is gitignored, so a GitHub URL into it would 404.
    if (resolved === '.claude' || resolved.startsWith('.claude/')) {
        return { drop: true }
    }
    const kind = kindOf(resolved)
    if (kind === null) {
        warn(`${sourceFile}: link "${target}" points at a path that does not exist`)
        return { target }
    }
    return {
        target: `https://github.com/${repo}/${kind === 'dir' ? 'tree' : 'blob'}/${branch}/${resolved}${fragment}`,
    }
}

/**
 * Rewrites the inline links of one docs file for use in the wiki. Fenced code blocks, inline code spans and
 * images are left as they are.
 * @param {string} markdown - the file's contents.
 * @param {object} options
 * @param {string} options.sourceFile - repo-relative path of the file, e.g. `docs/getting-started.md`.
 * @param {Set<string>} options.docsPages - filenames in docs/ that become wiki pages (README.md included).
 * @param {string} options.repo - `owner/name`, used for absolute GitHub URLs.
 * @param {(repoPath: string) => 'file' | 'dir' | null} options.kindOf - what a repo-relative path is, or null.
 * @param {(message: string) => void} options.warn - receives non-fatal problems.
 * @returns {string} the rewritten markdown.
 */
export function rewriteLinks(markdown, options) {
    let inFence = false
    return markdown
        .split('\n')
        .map((line) => {
            if (fencePattern.test(line)) {
                inFence = !inFence
                return line
            }
            if (inFence) {
                return line
            }
            return line.replace(tokenPattern, (match, bang, text, target, title) => {
                if (text === undefined || bang) {
                    return match
                }
                const result = rewriteTarget(target, options)
                return 'drop' in result ? text : `[${text}](${result.target}${title})`
            })
        })
        .join('\n')
}
