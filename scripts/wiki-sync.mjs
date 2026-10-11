import { execFileSync } from 'node:child_process'
import { realpathSync, statSync } from 'node:fs'
import { lstat, mkdir, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

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
const fencePattern = /^\s*(`{3,}|~{3,})(.*)$/
// Reference-style definition at line start: `[label]: target "title"`. Footnotes (`[^1]: ...`) are not matched.
const definitionPattern = /^(\s{0,3}\[[^\]^][^\]]*\]:\s+)(<[^>]*>|\S+)(.*)$/
// Alternative 1 consumes a whole inline code span so link-looking text inside it is skipped. Alternative 2 is an
// inline link or image whose text may itself contain code spans or an embedded image, e.g.
// [`core`](../packages/core) or [![logo](logo.png)](index.md). The target may be wrapped in angle brackets.
const tokenPattern =
    /`[^`]*`|(!?)\[((?:`[^`]*`|!\[[^\]]*\]\([^)\s]*\)|[^\]`])*)\]\((<[^>]*>|[^)\s]+)((?:\s+"[^"]*")?)\)/g

/**
 * Creates a stateful fenced-code-block tracker. A fence opens with 3+ backticks or tildes and closes only on a
 * line of the same character, at least as long as the opener, with no info string.
 * @returns {(line: string) => boolean} true when the given line is a fence marker or inside a fenced block.
 */
function createFenceTracker() {
    let open = null
    return (line) => {
        const match = fencePattern.exec(line)
        if (open === null) {
            if (match) {
                open = { char: match[1][0], length: match[1].length }
                return true
            }
            return false
        }
        if (
            match &&
            match[1][0] === open.char &&
            match[1].length >= open.length &&
            match[2].trim() === ''
        ) {
            open = null
        }
        return true
    }
}

/**
 * Resolves one link or image target for the wiki.
 * @param {string} target - the raw target inside `(...)`, angle brackets already removed.
 * @param {object} options - see {@link rewriteLinks}.
 * @param {boolean} isImage - true for `![alt](target)`: resolves to a raw file URL, never to a wiki page.
 * @returns {{ target: string } | { drop: true }} the new target, or a request to drop the link or image.
 */
function rewriteTarget(target, options, isImage) {
    const { sourceFile, docsPages, repo, kindOf, warn } = options
    if (target.startsWith('#') || externalPattern.test(target)) {
        return { target }
    }
    const hashIndex = target.indexOf('#')
    const linkPath = hashIndex === -1 ? target : target.slice(0, hashIndex)
    const fragment = hashIndex === -1 ? '' : target.slice(hashIndex)
    // '.' stands for the repo root itself and keeps its single character.
    const resolved = posix
        .normalize(posix.join(posix.dirname(sourceFile), linkPath))
        .replace(/(?<=.)\/$/, '')

    if (resolved === '..' || resolved.startsWith('../')) {
        warn(`${sourceFile}: link "${target}" points outside the repository`)
        return { target }
    }
    const docsMatch = isImage ? null : /^docs\/([^/]+\.md)$/.exec(resolved)
    if (docsMatch && docsPages.has(docsMatch[1])) {
        return { target: `${pageName(docsMatch[1])}${fragment}` }
    }
    // .claude/ is gitignored, so a GitHub URL into it would 404.
    if (resolved === '.claude' || resolved.startsWith('.claude/')) {
        return { drop: true }
    }
    const kind = resolved === '.' ? 'dir' : kindOf(resolved)
    if (kind === null) {
        warn(`${sourceFile}: link "${target}" points at a path that does not exist`)
        return { target }
    }
    const mode = isImage ? 'raw' : kind === 'dir' ? 'tree' : 'blob'
    const path = resolved === '.' ? '' : `/${resolved}`
    return { target: `https://github.com/${repo}/${mode}/${branch}${path}${fragment}` }
}

/**
 * Formats a rewritten target for `(...)`, wrapping it in angle brackets when it contains whitespace.
 * @param {string} target - the new target.
 * @returns {string} the target as it should appear in the markdown.
 */
function formatTarget(target) {
    return /\s/.test(target) ? `<${target}>` : target
}

/**
 * Strips the angle brackets from a raw link target.
 * @param {string} rawTarget - the target as written, e.g. `<x y.md>`.
 * @returns {string} the bare target.
 */
function unwrapTarget(rawTarget) {
    return rawTarget.startsWith('<') ? rawTarget.slice(1, -1) : rawTarget
}

/**
 * Rewrites the links and images found in one line outside any fenced block.
 * @param {string} line - the line.
 * @param {object} options - see {@link rewriteLinks}.
 * @returns {string} the rewritten line.
 */
function rewriteLine(line, options) {
    return line.replace(tokenPattern, (match, bang, text, rawTarget, title) => {
        if (text === undefined) {
            return match
        }
        const isImage = bang === '!'
        const target = unwrapTarget(rawTarget)
        const result = rewriteTarget(target, options, isImage)
        // A link's text may hold an image, which is rewritten on its own.
        const inner = isImage ? text : rewriteLine(text, options)
        if ('drop' in result) {
            return inner
        }
        const shown = result.target === target ? rawTarget : formatTarget(result.target)
        return `${bang}[${inner}](${shown}${title})`
    })
}

/**
 * Rewrites the links, images and reference-style definitions of one docs file for use in the wiki. Fenced code
 * blocks and inline code spans are left as they are.
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
    const inFence = createFenceTracker()
    const lines = []
    for (const line of markdown.split('\n')) {
        if (inFence(line)) {
            lines.push(line)
            continue
        }
        const definition = definitionPattern.exec(line)
        if (definition === null) {
            lines.push(rewriteLine(line, options))
            continue
        }
        const target = unwrapTarget(definition[2])
        const result = rewriteTarget(target, options, false)
        if ('drop' in result) {
            continue
        }
        lines.push(
            result.target === target
                ? line
                : `${definition[1]}${formatTarget(result.target)}${definition[3]}`,
        )
    }
    return lines.join('\n')
}

/**
 * Finds the first `# ` heading outside fenced code, scanning line by line.
 * @param {string} markdown - the file's contents.
 * @returns {string | null} the heading text, or null when there is none.
 */
function firstHeading(markdown) {
    const inFence = createFenceTracker()
    for (const line of markdown.split(/\r?\n/)) {
        if (inFence(line)) {
            continue
        }
        const match = /^#[ \t]+(\S.*)$/.exec(line)
        if (match) {
            return match[1].trim()
        }
    }
    return null
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
 * Resolves symlinks in a path that may not exist yet: the nearest existing ancestor is resolved with
 * `fs.realpath` and the missing remainder is appended.
 * @param {string} path - any path.
 * @returns {Promise<string>} the absolute real path.
 * @throws {Error} when the path cannot be resolved, or is (below) a dangling symlink.
 */
async function realPathLoose(path) {
    const absolute = resolve(path)
    try {
        return await realpath(absolute)
    } catch (error) {
        if (error?.code !== 'ENOENT') {
            throw new Error(`Cannot resolve path ${absolute}`, { cause: error })
        }
    }
    if (
        await lstat(absolute).then(
            () => true,
            () => false,
        )
    ) {
        throw new Error(`Refusing to use "${absolute}": it is a dangling symlink`)
    }
    const parent = dirname(absolute)
    if (parent === absolute) {
        throw new Error(`Cannot resolve path ${absolute}`)
    }
    return join(await realPathLoose(parent), basename(absolute))
}

/**
 * Lists a directory, treating a missing one as empty.
 * @param {string} dir - absolute directory.
 * @returns {Promise<string[]>} the entry names.
 * @throws {Error} `Cannot read output directory <dir>` (with the cause) for any other failure.
 */
async function readOutputDir(dir) {
    try {
        return await readdir(dir)
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return []
        }
        throw new Error(`Cannot read output directory ${dir}`, { cause: error })
    }
}

/**
 * Builds the wiki tree from docs/ into `outDir`, replacing its previous contents (except `.git`).
 * @param {object} options
 * @param {string} options.repoRoot - absolute repository root containing docs/.
 * @param {string} options.outDir - directory to write the wiki into (normally a clone of the wiki repo).
 * @param {string} options.repo - `owner/name`, used for absolute GitHub URLs.
 * @param {(message: string) => void} [options.warn] - receives non-fatal problems.
 * @returns {Promise<{ pages: { name: string, title: string }[] }>} the pages written, Home first.
 * @throws {Error} when docs/README.md is missing, a docs file collides with a generated page (Home.md,
 *   _Sidebar.md), `outDir` (after resolving symlinks) is the repo root, one of its ancestors, or inside it, or
 *   `outDir` is a non-empty directory without a `.git` entry (an empty or nonexistent one is fine).
 */
export async function buildWikiTree({ repoRoot, outDir, repo, warn = () => undefined }) {
    const root = await realPathLoose(repoRoot)
    const target = await realPathLoose(outDir)
    if (contains(target, root) || contains(root, target)) {
        throw new Error(
            `Refusing to clear "${target}": it overlaps the repository root "${root}" (use a directory outside the repo)`,
        )
    }
    const existing = await readOutputDir(target)
    if (existing.length > 0 && !existing.includes('.git')) {
        throw new Error(
            `Refusing to clear "${target}": it is not empty and has no .git entry (use an empty directory or a clone of the wiki repo)`,
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
    for (const reserved of ['Home.md', '_Sidebar.md']) {
        if (files.includes(reserved)) {
            throw new Error(
                `docs/${reserved} collides with a generated wiki page (Home comes from docs/README.md, _Sidebar.md is generated); rename it`,
            )
        }
    }

    await mkdir(target, { recursive: true })
    for (const entry of await readOutputDir(target)) {
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
        pages.push({ name, title: firstHeading(source) ?? name })
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
 * @throws {Error} when GITHUB_REPOSITORY is unset and the origin remote cannot be read.
 */
function resolveRepo(repoRoot) {
    const fromEnv = process.env.GITHUB_REPOSITORY
    if (fromEnv) {
        return fromEnv
    }
    let remote
    try {
        remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
            cwd: repoRoot,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        })
    } catch (error) {
        throw new Error(
            'Cannot determine the GitHub repository. Set GITHUB_REPOSITORY or add an origin remote',
            {
                cause: error,
            },
        )
    }
    return parseRepo(remote)
}

/**
 * Formats an error and its `cause` chain for the terminal.
 * @param {unknown} error - whatever was thrown.
 * @returns {string} the message, followed by one `  caused by: ...` line per cause.
 */
function describeError(error) {
    const lines = [error instanceof Error ? error.message : String(error)]
    let cause = error instanceof Error ? error.cause : undefined
    for (let depth = 0; cause !== undefined && depth < 10; depth += 1) {
        lines.push(`  caused by: ${cause instanceof Error ? cause.message : String(cause)}`)
        cause = cause instanceof Error ? cause.cause : undefined
    }
    return lines.join('\n')
}

/**
 * Tells whether this module is the process entry point, comparing real paths so a symlinked or substituted
 * path to the script still counts.
 * @returns {boolean} true when `node` was started on this file.
 */
function isEntryPoint() {
    if (!process.argv[1]) {
        return false
    }
    try {
        return (
            realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))
        )
    } catch {
        return false
    }
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

if (isEntryPoint()) {
    main().catch((error) => {
        console.error(describeError(error))
        process.exitCode = 1
    })
}
