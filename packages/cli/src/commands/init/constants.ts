/**
 * `package.json` template for a freshly scaffolded project. Scripts call the
 * `minimaz` bin from `@minimaz/sitekit`, so no separate static server is needed.
 *
 * @param {string} name - Project name
 */
export function createPkgTemplate(name: string): Record<string, unknown> {
    return {
        name,
        version: '0.0.1',
        license: 'ISC',
        type: 'module',
        scripts: {
            build: 'minimaz build',
            start: 'minimaz serve',
        },
        devDependencies: {
            '@minimaz/sitekit': 'latest',
        },
    }
}

export const gitignoreTemplate = `node_modules
dist
dist-docs
*.minimaz-tmp
*.minimaz-old
.env
.vscode
.DS_Store
`
