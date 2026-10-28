/** CLI options for the `init` command. */
export interface InitCommandOptions {
    template: string
    npm?: boolean
    git?: boolean
    gitprovider?: string
}
