/**
 * `package.json` template for a freshly scaffolded project. No `build`
 * script yet — `@minimaz/cli`'s `build` command doesn't exist (blocked on
 * JS/TS dependency-graph bundling, out of scope for this pass); wiring a
 * script to a nonexistent command would be worse than omitting it. Revisit
 * once `build` ships.
 *
 * @param {string} name - Project name
 */
export function createPkgTemplate(name: string): Record<string, unknown> {
    return {
        name,
        version: "0.0.1",
        license: "ISC",
        type: "commonjs",
        scripts: {
            start: "npx serve dist",
        },
        devDependencies: {
            serve: "latest",
        },
    };
}

export const GITIGNORE_TEMPLATE = `node_modules
dist
.env
.vscode
.DS_Store
`;
