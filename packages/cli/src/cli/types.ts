export interface Args {
    _: string[];
    [key: string]: string | boolean | string[];
}

export type CommandFn = () => void | Promise<void>;
