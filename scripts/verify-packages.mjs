import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Checks what `npm pack` would publish for every workspace: each tarball must carry LICENSE, package.json,
// dist/ and dist/README.md, and must not carry sources, tests, build caches or secrets. Run after `npm run build`
// (the build step copies LICENSE and the README into each package): `node scripts/verify-packages.mjs`. Pure functions are exported for tests; main() only
// runs when this file is the process entry point.

const forbiddenPatterns = [
    // Top level only: @minimaz/templates legitimately ships seed projects with their own src/ under dist/seeds/.
    [/^src\//, 'source file'],
    [/(^|\/)__tests__\//, 'test directory'],
    [/\.(test|spec)\.(js|d\.ts)(\.map)?$/, 'compiled test file'],
    [/\.tsbuildinfo$/, 'tsbuildinfo cache'],
    [/(^|\/)\.claude\//, '.claude directory'],
    [/(^|\/)\.env(\.|$)/, 'env file'],
]

/**
 * Parses the stdout of `npm pack --json`, ignoring any non-JSON noise printed before the array (lifecycle script
 * output, warnings).
 * @param {string} stdout - raw command output.
 * @returns {Array<{ name: string, files: Array<{ path: string }> }>} the parsed pack results.
 * @throws {Error} when no JSON array is found or it does not parse.
 */
export function parsePackOutput(stdout) {
    const start = stdout.search(/^\[\s*[{\]]/m)
    if (start === -1) {
        throw new Error('npm pack produced no JSON output to check')
    }
    try {
        return JSON.parse(stdout.slice(start))
    } catch (error) {
        throw new Error(`npm pack output is not valid JSON: ${String(error)}`, { cause: error })
    }
}

/**
 * Lists every way the packed tarballs deviate from what should be published.
 * @param {Array<{ name: string, files: Array<{ path: string }> }>} packs - parsed `npm pack --json` result.
 * @returns {string[]} one human-readable line per offence; empty when everything is fine.
 */
export function findProblems(packs) {
    if (packs.length === 0) {
        return ['npm pack reported no packages']
    }
    const problems = []
    for (const pack of packs) {
        const paths = pack.files.map((file) => file.path.replaceAll('\\', '/'))
        for (const required of ['LICENSE', 'package.json']) {
            if (!paths.includes(required)) {
                problems.push(`${pack.name}: missing ${required}`)
            }
        }
        if (!paths.some((path) => path.startsWith('dist/'))) {
            problems.push(`${pack.name}: contains no dist/ files (was the package built?)`)
        } else if (!paths.includes('dist/README.md')) {
            problems.push(`${pack.name}: missing dist/README.md`)
        }
        for (const path of paths) {
            for (const [pattern, label] of forbiddenPatterns) {
                if (pattern.test(path)) {
                    problems.push(`${pack.name}: unexpected ${label} ${path}`)
                }
            }
        }
    }
    return problems
}

/** Runs `npm pack --dry-run` over every workspace and exits 1 listing offenders. */
function main() {
    // --ignore-scripts: each package's `prepack` prints "Bundled …" lines that would corrupt the JSON.
    const stdout = execSync('npm pack --dry-run --workspaces --ignore-scripts --json', {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'inherit'],
    })
    const packs = parsePackOutput(stdout)
    const problems = findProblems(packs)
    if (problems.length > 0) {
        console.error(
            `Package contents check failed:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
        )
        process.exitCode = 1
        return
    }
    console.log(`Package contents OK: ${packs.length} tarballs`)
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
    main()
}
