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
minimaz help | h
minimaz version | v
minimaz validate --path=<file>
minimaz init [name] [--template=<name>] [--npm] [--git] [--gitprovider=<provider>]
minimaz config [--overwrite]
minimaz template [path] [--list] [--delete=<name>] [--update[=<name>]]
minimaz docs <init|build>
```

- `validate` — validate a CSS, HTML, JS, TS, or JSON file.
- `init` — scaffold a new project from a global template (`--template`, default `"default"`); `--npm`/`--git`
  skip their respective interactive prompts; `--gitprovider` accepts `local`, `github`, `gitlab`, or a remote URL
  (GitHub/GitLab remote creation requires `gh`/`glab` to be installed).
- `config` — seed (or `--overwrite` to re-seed) the global `~/.minimaz` directory with default templates and
  settings. `@minimaz/sitekit` (the bin that wraps this package) runs it automatically (non-fatally) on
  `npm postinstall`.
- `template` — manage global templates at `~/.minimaz/templates`: `--list`, `--delete=<name>`, `--update[=<name>]`
  (omit the name to re-seed all templates from the package's bundled defaults), or save the current/given folder
  as a new template by default. Destructive actions prompt for confirmation.
- `docs init` / `docs build` — scaffold or build a directory of Markdown into HTML/PDF, per `minimaz.config.json`'s
  `docs` section.

This covers `minimaz-cli`'s full command set except `build`/`clear`, which aren't implemented yet — see
`.claude/status.md` in the monorepo root for current status and known gaps (e.g. `validate` is currently single-file
only, unlike the original's recursive directory mode).

Depends on [`@minimaz/core`](../core), [`@minimaz/logger`](../logger), [`@minimaz/config`](../config),
[`@minimaz/markdown`](../markdown), [`@minimaz/templates`](../templates), [`@minimaz/validate`](../validate), and
`cross-spawn`.
