/**
 * CLI options for the `init` command.
 *
 * `gitremote` is accepted for CLI-flag parity with `minimaz-cli` but is
 * currently unused — `initGit`/`linkRemoteRepo` never read it, matching
 * `minimaz-cli`'s original behavior exactly (verified while porting).
 */
export interface InitCommandOptions {
    template: string
    npm?: boolean
    git?: boolean
    gitprovider?: string
    gitremote?: string
}
