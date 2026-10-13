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
const fencePattern = /^ {0,3}(`{3,}|~{3,})(.*)$/
// Reference-style definition at line start: `[label]: target "title"`. Footnotes (`[^1]: ...`) are not matched.
const definitionPattern = /^(\s{0,3}\[[^\]^][^\]]*\]:\s*)(<[^>]*>|\S+)(.*)$/
// Inline code spans are masked out before tokenizing (see maskCodeSpans), so link-looking text inside them is
// skipped. The pattern has these alternatives: an inline link or image whose text may itself contain an embedded
// image, e.g. [`core`](../packages/core) or [![logo](logo.png)](index.md), with the target optionally wrapped in
// angle brackets; an <a> or <img> tag of raw HTML; and, only when `withReferences`, a reference-style use
// (`[text][label]`, `[label][]`, `[label]`).
const linkSource = String.raw`(?<bang>!?)\[(?<text>(?:!\[[^[\]]*\]\([^()\s]*\)|[^\]\`]){0,1000})\]\((?<target><[^>]*>|[^)\s]+)(?<title>(?:\s+"[^"]*")?)\)`
const htmlSource = String.raw`<(?<tag>a|img)(?=[\s/>])(?<attrs>(?:"[^"]*"|'[^']*'|[^<>"'])*)>`
const referenceSource = String.raw`(?<rbang>!?)\[(?<rtext>(?:!\[[^[\]]*\]\([^()\s]*\)|[^\][\`]){0,1000})\](?:\[(?<rlabel>[^\][]*)\])?`
const plainTokenPattern = new RegExp(`${linkSource}|${htmlSource}`, 'gi')
const referenceTokenPattern = new RegExp(`${linkSource}|${htmlSource}|${referenceSource}`, 'gi')
const htmlTagTest = /<(?:a|img)[\s/>]/i
const attributePattern = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

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
            // A backtick fence's info string cannot contain a backtick (that is an inline code span).
            if (match && !(match[1][0] === '`' && match[2].includes('`'))) {
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
 * Percent-decodes the path part of a link target, keeping it as written when it is malformed.
 * @param {string} path - the target without query and fragment.
 * @returns {string} the decoded path.
 */
function decodePath(path) {
    try {
        return decodeURIComponent(path)
    } catch {
        return path
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
    const fragment = hashIndex === -1 ? '' : target.slice(hashIndex)
    const withQuery = hashIndex === -1 ? target : target.slice(0, hashIndex)
    const queryIndex = withQuery.indexOf('?')
    const linkPath = decodePath(queryIndex === -1 ? withQuery : withQuery.slice(0, queryIndex))
    // A root-relative target ('/packages/core') starts from the repo root, not from the source file.
    const rooted = linkPath.startsWith('/')
    // '.' stands for the repo root itself and keeps its single character.
    const resolved = posix
        .normalize(
            posix.join(
                rooted ? '' : posix.dirname(sourceFile),
                rooted ? linkPath.slice(1) : linkPath,
            ),
        )
        .replace(/(?<=.)\/$/, '')

    if (resolved === '..' || resolved.startsWith('../')) {
        warn(`${sourceFile}: link "${target}" points outside the repository`)
        return { target }
    }
    const docsMatch = isImage ? null : /^docs\/([^/]+\.md)$/.exec(resolved)
    if (docsMatch && docsPages.has(docsMatch[1])) {
        return { target: `${wikiTarget(pageName(docsMatch[1]))}${fragment}` }
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
    // encodeURI leaves '#' and '?' alone; after decoding they belong to the path, not to a fragment or query.
    const path =
        resolved === '.' ? '' : `/${encodeURI(resolved).replace(/#/g, '%23').replace(/\?/g, '%3F')}`
    return { target: `https://github.com/${repo}/${mode}/${branch}${path}${fragment}` }
}

/**
 * Formats a rewritten target for `(...)`, wrapping it in angle brackets when it has whitespace or parentheses.
 * @param {string} target - the new target.
 * @returns {string} the target as it should appear in the markdown.
 */
function formatTarget(target) {
    return /[\s()]/.test(target) ? `<${target}>` : target
}

/**
 * Makes a wiki page name usable as a link target: characters that would start a fragment or query, or break out
 * of angle brackets, are percent-encoded (the wiki decodes them back to the page name).
 * @param {string} name - the page name.
 * @returns {string} the target, before {@link formatTarget}.
 */
function wikiTarget(name) {
    return name.replace(/[%#?<>]/g, (char) => encodeURIComponent(char))
}

/**
 * Escapes the characters that would turn a title into link markup, leaving inline code spans alone.
 * @param {string} title - plain title text.
 * @returns {string} the title for use inside `[...]`.
 */
function escapeLinkText(title) {
    return title.replace(/(`+)(?:(?!\1)[\s\S])+?\1(?!`)|[[\]\\]/g, (match) =>
        match.startsWith('`') ? match : `\\${match}`,
    )
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
 * Replaces every inline code span in a line with a placeholder of the same length, so the tokenizer cannot see
 * inside it while match offsets still index the original line. A span opens with a run of N backticks and closes
 * at the next run of exactly N backticks; a run with no partner is literal text.
 * @param {string} line - the line.
 * @returns {string} the line with code spans (backticks included) replaced by `\u0001` characters.
 */
function maskCodeSpans(line) {
    if (!line.includes('`')) {
        return line
    }
    const runs = [...line.matchAll(/`+/g)].map((run) => ({
        start: run.index,
        length: run[0].length,
    }))
    // nextSame[i] is the following run with the same length as run i, found in one backward pass.
    const nextSame = new Array(runs.length).fill(-1)
    const seen = new Map()
    for (let index = runs.length - 1; index >= 0; index -= 1) {
        nextSame[index] = seen.get(runs[index].length) ?? -1
        seen.set(runs[index].length, index)
    }
    let masked = ''
    let copied = 0
    for (let index = 0; index < runs.length; index += 1) {
        const close = nextSame[index]
        if (close === -1) {
            continue
        }
        const end = runs[close].start + runs[close].length
        masked += line.slice(copied, runs[index].start) + '\u0001'.repeat(end - runs[index].start)
        copied = end
        index = close
    }
    return masked + line.slice(copied)
}

/**
 * Normalizes a reference label the way Markdown matches them: trimmed, whitespace collapsed, case-insensitive.
 * @param {string} label - the label text.
 * @returns {string} the normalized label.
 */
function normalizeLabel(label) {
    return label.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Rewrites the relative `href` of an `<a>` or `src` of an `<img>` tag found in raw HTML.
 * @param {string} tag - `a` or `img`, any case.
 * @param {string} source - the whole tag as written, e.g. `<a href="x.md">`.
 * @param {string} attrs - the attribute text inside the tag.
 * @param {object} options - see {@link rewriteLinks}.
 * @returns {{ source: string } | { drop: true, alt: string }} the tag to emit, or a request to drop it (with the
 *   `alt` attribute, for an image).
 */
function rewriteHtmlTag(tag, source, attrs, options) {
    const wanted = tag.toLowerCase() === 'a' ? 'href' : 'src'
    const attrsStart = source.length - 1 - attrs.length
    let alt = ''
    let found = null
    for (const attribute of attrs.matchAll(attributePattern)) {
        const name = attribute[1].toLowerCase()
        const value = attribute[2] ?? attribute[3] ?? attribute[4]
        if (name === 'alt' && value !== undefined) {
            alt = value
        }
        if (name === wanted && value !== undefined && found === null) {
            const raw =
                attribute[2] === undefined
                    ? attribute[3] === undefined
                        ? attribute[4]
                        : `'${attribute[3]}'`
                    : `"${attribute[2]}"`
            found = {
                value,
                start: attrsStart + attribute.index + attribute[0].length - raw.length,
                length: raw.length,
            }
        }
    }
    if (found === null || found.value === '') {
        return { source }
    }
    const target = found.value.replace(/&amp;/g, '&')
    const result = rewriteTarget(target, options, wanted === 'src')
    if ('drop' in result) {
        return { drop: true, alt }
    }
    if (result.target === target) {
        return { source }
    }
    const escaped = result.target.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    return {
        source: `${source.slice(0, found.start)}"${escaped}"${source.slice(found.start + found.length)}`,
    }
}

/**
 * Rewrites the links, images, raw-HTML links and dropped reference uses found in one line outside any fenced
 * block. Inline code spans are left as they are.
 * @param {string} line - the line.
 * @param {object} options - see {@link rewriteLinks}; may carry `droppedLabels`, a Set of normalized labels of
 *   reference definitions that were dropped.
 * @returns {string} the rewritten line.
 */
function rewriteLine(line, options) {
    const labels = options.droppedLabels
    const withReferences = labels !== undefined && labels.size > 0
    // Cheap exit that also keeps lines like '!['.repeat(n) from rescanning to the end of the line.
    if (
        !line.includes('](') &&
        !htmlTagTest.test(line) &&
        !(withReferences && line.includes('['))
    ) {
        return line
    }
    const masked = maskCodeSpans(line)
    const pattern = new RegExp(withReferences ? referenceTokenPattern : plainTokenPattern)
    let output = ''
    let copied = 0
    for (let match = pattern.exec(masked); match !== null; match = pattern.exec(masked)) {
        const start = match.index
        const original = line.slice(start, start + match[0].length)
        const groups = match.groups ?? {}
        let replacement
        let end = start + match[0].length
        if (groups.tag !== undefined) {
            const result = rewriteHtmlTag(groups.tag, original, groups.attrs ?? '', options)
            if ('drop' in result) {
                if (groups.tag.toLowerCase() === 'img') {
                    replacement = result.alt
                } else {
                    // Only an <a> whose content is plain text can be unwrapped on a single line.
                    const closing = /^[^<]*<\/a\s*>/i.exec(masked.slice(end))
                    if (closing === null) {
                        options.warn(
                            `${options.sourceFile}: ${original} points into .claude/ but cannot be unwrapped (not a single plain-text link); left unchanged`,
                        )
                        pattern.lastIndex = end
                        continue
                    }
                    const inner = line.slice(
                        end,
                        end + closing[0].length - closing[0].replace(/^[^<]*/, '').length,
                    )
                    replacement = rewriteLine(inner, options)
                    end += closing[0].length
                }
            } else {
                replacement = result.source
            }
        } else if (groups.target !== undefined) {
            const bang = groups.bang ?? ''
            const textStart = start + bang.length + 1
            const text = line.slice(textStart, textStart + (groups.text ?? '').length)
            const titleLength = (groups.title ?? '').length
            const rawTarget = line.slice(
                end - 1 - titleLength - groups.target.length,
                end - 1 - titleLength,
            )
            const title = line.slice(end - 1 - titleLength, end - 1)
            const isImage = bang === '!'
            const target = unwrapTarget(rawTarget)
            const result = rewriteTarget(target, options, isImage)
            // A link's text may hold an image or HTML, which are rewritten on their own.
            const inner = isImage ? text : rewriteLine(text, options)
            if ('drop' in result) {
                replacement = inner
            } else {
                const shown = result.target === target ? rawTarget : formatTarget(result.target)
                replacement = `${bang}[${inner}](${shown}${title})`
            }
        } else {
            // A reference-style use: plain text when its definition was dropped, otherwise left for the
            // tokenizer to look inside (a linked image's inner image, say).
            const textStart = start + (groups.rbang ?? '').length + 1
            const text = line.slice(textStart, textStart + (groups.rtext ?? '').length)
            const label = groups.rlabel === undefined || groups.rlabel === '' ? text : groups.rlabel
            if (!labels?.has(normalizeLabel(label))) {
                pattern.lastIndex = start + 1
                continue
            }
            replacement = groups.rbang === '!' ? text : rewriteLine(text, options)
        }
        output += line.slice(copied, start) + replacement
        copied = end
        pattern.lastIndex = end
    }
    return output + line.slice(copied)
}

/**
 * Collects the normalized labels of the reference definitions that point under `.claude/` and so get dropped.
 * @param {string[]} lines - the file's lines, without line endings.
 * @param {object} options - see {@link rewriteLinks}.
 * @returns {Set<string>} the labels.
 */
function collectDroppedLabels(lines, options) {
    // Targets are resolved again when the definition is rewritten, so this pass must not repeat the warnings.
    const quiet = { ...options, warn: () => undefined }
    const inFence = createFenceTracker()
    const labels = new Set()
    for (const line of lines) {
        if (inFence(line)) {
            continue
        }
        const definition = definitionPattern.exec(line)
        if (
            definition !== null &&
            'drop' in rewriteTarget(unwrapTarget(definition[2]), quiet, false)
        ) {
            labels.add(normalizeLabel(/\[([^\]]*)\]/.exec(definition[1])?.[1] ?? ''))
        }
    }
    return labels
}

/**
 * Rewrites the links, images, raw-HTML links and reference-style definitions of one docs file for use in the
 * wiki. Fenced code blocks and inline code spans are left as they are. Links, images and reference definitions
 * that point under `.claude/` (gitignored, so a GitHub URL would 404) are dropped and their text kept; so are the
 * uses of such a definition.
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
    const rawLines = markdown.split('\n')
    // Keep CRLF endings: patterns see the line without its \r, which is put back on output.
    const parsed = rawLines.map((rawLine) =>
        rawLine.endsWith('\r')
            ? { rawLine, line: rawLine.slice(0, -1), eol: '\r' }
            : { rawLine, line: rawLine, eol: '' },
    )
    const lineOptions = {
        ...options,
        droppedLabels: collectDroppedLabels(
            parsed.map((entry) => entry.line),
            options,
        ),
    }
    const inFence = createFenceTracker()
    const lines = []
    for (const { rawLine, line, eol } of parsed) {
        if (inFence(line)) {
            lines.push(rawLine)
            continue
        }
        const definition = definitionPattern.exec(line)
        if (definition === null) {
            lines.push(rewriteLine(line, lineOptions) + eol)
            continue
        }
        const target = unwrapTarget(definition[2])
        const result = rewriteTarget(target, options, false)
        if ('drop' in result) {
            continue
        }
        lines.push(
            result.target === target
                ? rawLine
                : `${definition[1]}${formatTarget(result.target)}${definition[3]}${eol}`,
        )
    }
    return lines.join('\n')
}

/**
 * Reduces inline links, images and reference links to their text (the alt text for an image).
 * @param {string} text - inline markdown.
 * @returns {string} the text without link markup.
 */
function plainLinkText(text) {
    return text
        .replace(/!\[([^[\]]*)\]\((?:<[^>]*>|[^)\s]*)(?:\s+"[^"]*")?\)/g, '$1')
        .replace(/\[([^[\]]*)\]\((?:<[^>]*>|[^)\s]*)(?:\s+"[^"]*")?\)/g, '$1')
        .replace(/!?\[([^[\]]*)\]\[[^[\]]*\]/g, '$1')
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
            // An ATX heading may end in a closing '#' sequence, which is not part of the title.
            const title = plainLinkText(match[1].replace(/(?:^|[ \t]+)#+[ \t]*$/, '')).trim()
            return title === '' ? null : title
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
 * Tells whether a directory is a clone of a GitHub wiki: it has a `.git` directory (not a worktree-style file)
 * whose config lists a remote url ending in `.wiki.git`. Reads the config directly instead of spawning git.
 * @param {string} dir - absolute directory.
 * @returns {Promise<boolean>} true for a wiki clone.
 */
async function isWikiClone(dir) {
    try {
        if (!(await lstat(join(dir, '.git'))).isDirectory()) {
            return false
        }
        const config = await readFile(join(dir, '.git', 'config'), 'utf8')
        return /^\s*url\s*=\s*\S*\.wiki\.git\/?\s*$/m.test(config)
    } catch {
        return false
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
 *   `outDir` is a non-empty directory that is not a wiki clone (a `.git` directory whose config has a remote url ending in
 *   `.wiki.git`); an empty or nonexistent one is fine.
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
    if (existing.length > 0 && !(await isWikiClone(target))) {
        throw new Error(
            `Refusing to clear "${target}": it is not empty and is not a wiki clone (expected a .git directory whose config has a remote url ending in .wiki.git); use an empty directory or a clone of the wiki repo`,
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
    const reservedNames = ['Home.md', '_Sidebar.md']
    for (const file of files) {
        const reserved = reservedNames.find((name) => name.toLowerCase() === file.toLowerCase())
        if (reserved !== undefined) {
            throw new Error(
                `docs/${file} collides with a generated wiki page (${reserved}; Home comes from docs/README.md, _Sidebar.md is generated; names are compared case-insensitively); rename it`,
            )
        }
    }

    // Read and rewrite everything in memory first: the output is only wiped once every page has succeeded.
    const docsPages = new Set(files)
    const kindOf = makeKindOf(root)
    const pages = []
    const outputs = []
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
        outputs.push({ file: `${name}.md`, content: rewritten })
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
    const sidebar = pages
        .map((page) => `- [${escapeLinkText(page.title)}](${formatTarget(wikiTarget(page.name))})`)
        .join('\n')
    outputs.push({ file: '_Sidebar.md', content: `${sidebar}\n` })

    await mkdir(target, { recursive: true })
    for (const entry of await readOutputDir(target)) {
        if (entry !== '.git') {
            await rm(join(target, entry), { recursive: true, force: true })
        }
    }
    for (const { file, content } of outputs) {
        await writeFile(join(target, file), content)
    }

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
