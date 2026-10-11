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
