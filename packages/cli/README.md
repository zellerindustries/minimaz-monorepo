# @minimaz/cli

The library implementing the `minimaz`/`mz` commands.

## Install

This package is no longer published as a global bin. Install [`@minimaz/sitekit`](../../toolkits/sitekit) instead:

```bash
npm install -g @minimaz/sitekit
```

`@minimaz/cli` implements the `minimaz`/`mz` commands as a library; `@minimaz/sitekit` is the published executable that runs them.

## Commands

```
minimaz help [command]
minimaz version
minimaz validate --path=<file>
minimaz init [name] [--template=<name>] [--npm] [--git] [--gitprovider=<provider>]
minimaz config [--overwrite]
minimaz template [path] [--list] [--delete=<name>] [--update[=<name>]]
minimaz docs <init|build>
minimaz build [--overwrite]
minimaz clear
minimaz serve
```

Single-letter aliases: `h` (help), `v` (version), `i` (init), `t` (template), `b` (build), `c` (clear).

- `validate` — validate a CSS, HTML, JS, TS, or JSON file.
- `init` — scaffold a new project from a global template (`--template`, default `"default"`); `--npm`/`--git`
  skip their respective interactive prompts; `--gitprovider` accepts `local`, `github`, `gitlab`, or a remote URL
  (GitHub/GitLab remote creation requires `gh`/`glab` to be installed). If the npm/git step fails, the scaffolded
  project directory is left in place and the error names it, so the step can be rerun manually.
- `config` — seed (or `--overwrite` to re-seed) the global `~/.minimaz` directory with default templates and
  settings. `@minimaz/sitekit` (the bin that wraps this package) runs it automatically (non-fatally) on
  `npm postinstall`.
- `template` — manage global templates at `~/.minimaz/templates`: `--list`, `--delete=<name>`, `--update[=<name>]`
  (omit the name to re-seed all templates from the package's bundled defaults), or save the current/given folder
  as a new template by default. Destructive actions prompt for confirmation.
- `docs init` / `docs build` — scaffold or build a directory of Markdown into HTML/PDF, per `minimaz.config.json`'s
  `docs` section. `docs build` writes to `<output.dir>-docs/html` and `<output.dir>-docs/pdf` (default
  `dist-docs/`), outside `output.dir` so `build`/`clear` never wipe it. It fails, writing nothing, if any file has a structural Markdown error (e.g. an
  unterminated code fence), listing each as `<file>: <error>`; bundled files are separated by a horizontal rule.
- `build` — build `input.dir` into `output.dir` per `minimaz.config.json`, minifying/bundling CSS, JS, TS and HTML.
  Refuses to run (without deleting anything) when `output.dir` isn't inside the project, when it overlaps
  `input.dir` or a local `input.externals` source, or when `input.dir` is missing or empty. If `output.dir`
  already exists, it asks `[y/N]` before replacing it (declining aborts and leaves it untouched); without a TTY
  it refuses instead, and `--overwrite` skips the question. Terminals that aren't detected as interactive (e.g.
  some Git Bash/mintty setups without winpty) refuse with a hint to use `--overwrite`. With
  `output.js.bundling: true`, relative JS/TS imports are rewritten to the emitted `.js` paths (native ES modules,
  one output file per source file, not concatenated, so HTML must use `<script type="module">`; npm/bare
  specifiers are left untouched, and an unresolvable relative import is an error). The build is written to a sibling
  `<output.dir>.minimaz-tmp` directory first. `output.dir` is only replaced once the build succeeds: the previous output
  is moved aside to `<output.dir>.minimaz-old`, the new build is moved in, and the backup is deleted. A failed build
  leaves the previous output untouched. If the final swap fails, the previous output is restored and the error names
  the directory that holds the new build. Both scratch directories are normally gone after a build. A crashed run can
  leave one behind, and the next build cleans it up (`minimaz init`'s `.gitignore` ignores both).
- `clear` — delete `output.dir`, with the same safety checks as `build`.
- `serve` — start a local HTTP server on `output.dir`, honoring `minimaz.config.json`'s `serve` section (clean
  URLs, SPA fallback, directory listing, cache-control, live reload). `serve.port` defaults to `4173`, with a
  warning when it isn't set; `serve` fails if the port is already in use.

This covers `minimaz-cli`'s full command set — see `.claude/status.md` in the monorepo root for current status and
known gaps (e.g. `validate` is currently single-file only, unlike the original's recursive directory mode).

Depends on [`@minimaz/config`](../config), [`@minimaz/core`](../core),
[`@minimaz/logger`](../logger), [`@minimaz/markdown`](../markdown), [`@minimaz/templates`](../templates),
[`@minimaz/validate`](../validate), [`@minimaz/css`](../css), [`@minimaz/js`](../js), [`@minimaz/html`](../html),
[`@minimaz/ts`](../ts), [`@minimaz/bundler`](../bundler), [`@minimaz/local-server`](../local-server), and `cross-spawn`.
