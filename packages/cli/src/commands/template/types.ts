/**
 * CLI options for the `template` command.
 *
 * `update` is `true` (no name given → re-seed all templates from bundled
 * defaults) or a string (name of a specific template to update from
 * `sourcePath`). `list`, `delete`, `update`, and the default save action
 * are mutually exclusive — see the `.claude/status.md` "Known bugs found"
 * entry for why (the original `minimaz-cli` command ran save and update
 * together; fixed here).
 */
export interface TemplateCommandOptions {
    list?: boolean
    delete?: string
    update?: string | boolean
}
