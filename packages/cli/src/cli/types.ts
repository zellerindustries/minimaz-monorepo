/** Parsed CLI arguments: `_` holds positional args, other keys are flags. */
export interface Args {
    _: string[];
    [key: string]: string | boolean | string[];
}

/** A dispatch-table entry for one CLI command; may run synchronously or async. */
export type CommandFn = () => void | Promise<void>;
