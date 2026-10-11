import { execFileSync } from 'node:child_process'
import { statSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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

/**
 * Builds a `kindOf` lookup that stats paths relative to the repository root.
 * @param {string} repoRoot - absolute repository root.
 * @returns {(repoPath: string) => 'file' | 'dir' | null} `null` when the path doesn't exist.
 */
function makeKindOf(repoRoot) {
    return (repoPath) => {
        try {
            return statSync(join(repoRoot, repoPath)).isDirectory() ? 'dir' : 'file'
        } catch {
            return null
        }
    }
}

/**
 * Lower-cases a path on case-insensitive filesystems, so `C:\DEV` and `c:\dev` compare as the same path.
 * @param {string} path - absolute path.
 * @returns {string} the path, lower-cased where the platform's filesystem ignores case.
 */
function normalizeCase(path) {
    return process.platform === 'win32' || process.platform === 'darwin' ? path.toLowerCase() : path
}

/**
 * Tells whether `child` is `parent` itself or lies inside it.
 * @param {string} parent - absolute path.
 * @param {string} child - absolute path.
 * @returns {boolean} true when `child` is `parent` or one of its descendants.
 */
function contains(parent, child) {
    const rel = relative(normalizeCase(parent), normalizeCase(child))
    return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

/**
 * Builds the wiki tree from docs/ into `outDir`, replacing its previous contents (except `.git`).
 * @param {object} options
 * @param {string} options.repoRoot - absolute repository root containing docs/.
 * @param {string} options.outDir - directory to write the wiki into (normally a clone of the wiki repo).
 * @param {string} options.repo - `owner/name`, used for absolute GitHub URLs.
 * @param {(message: string) => void} [options.warn] - receives non-fatal problems.
 * @returns {Promise<{ pages: { name: string, title: string }[] }>} the pages written, Home first.
 * @throws {Error} when docs/README.md is missing, or `outDir` is the repo root, one of its ancestors, or inside it.
 */
export async function buildWikiTree({ repoRoot, outDir, repo, warn = () => undefined }) {
    const root = resolve(repoRoot)
    const target = resolve(outDir)
    if (contains(target, root) || contains(root, target)) {
        throw new Error(
            `Refusing to clear "${target}": it overlaps the repository root "${root}" (use a directory outside the repo)`,
        )
    }

    const docsDir = join(root, 'docs')
    let entries
    try {
        entries = await readdir(docsDir, { withFileTypes: true })
    } catch (error) {
        throw new Error(`Cannot read ${docsDir}`, { cause: error })
    }
    const files = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
        .map((entry) => entry.name)
        .sort()
    if (!files.includes('README.md')) {
        throw new Error('docs/README.md is required: it becomes the wiki Home page')
    }

    await mkdir(target, { recursive: true })
    for (const entry of await readdir(target)) {
        if (entry !== '.git') {
            await rm(join(target, entry), { recursive: true, force: true })
        }
    }

    const docsPages = new Set(files)
    const kindOf = makeKindOf(root)
    const pages = []
    for (const file of files) {
        const source = await readFile(join(docsDir, file), 'utf8')
        const name = pageName(file)
        const rewritten = rewriteLinks(source, {
            sourceFile: `docs/${file}`,
            docsPages,
            repo,
            kindOf,
            warn,
        })
        await writeFile(join(target, `${name}.md`), rewritten)
        pages.push({ name, title: /^#\s+(.+)$/m.exec(source)?.[1].trim() ?? name })
    }

    pages.sort((a, b) => {
        if (a.name === 'Home' || b.name === 'Home') {
            return a.name === 'Home' ? -1 : 1
        }
        const left = a.name.toLowerCase()
        const right = b.name.toLowerCase()
        if (left === right) {
            return 0
        }
        return left < right ? -1 : 1
    })
    const sidebar = pages.map((page) => `- [${page.title}](${page.name})`).join('\n')
    await writeFile(join(target, '_Sidebar.md'), `${sidebar}\n`)

    return { pages }
}

/**
 * Resolves `owner/name` from the Actions environment, falling back to the `origin` remote.
 * @param {string} repoRoot - repository root used as the git working directory.
 * @returns {string} `owner/name`.
 */
function resolveRepo(repoRoot) {
    const fromEnv = process.env.GITHUB_REPOSITORY
    if (fromEnv) {
        return fromEnv
    }
    return parseRepo(
        execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: repoRoot, encoding: 'utf8' }),
    )
}

async function main() {
    const outArg = process.argv[2]
    if (!outArg) {
        throw new Error('Usage: node scripts/wiki-sync.mjs <outDir>')
    }
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
    const outDir = resolve(outArg)
    const { pages } = await buildWikiTree({
        repoRoot,
        outDir,
        repo: resolveRepo(repoRoot),
        warn: (message) => console.warn(`warning: ${message}`),
    })
    console.log(`Wrote ${pages.length} wiki pages to ${outDir}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error))
        process.exitCode = 1
    })
}
