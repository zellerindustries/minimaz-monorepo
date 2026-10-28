import type { Analysis, Binding, Scope } from './scope.js'

/*
 * Renames local bindings to the shortest available names. Correctness rests on one invariant: after
 * renaming, every identifier still resolves to the same binding (or stays free) as before.
 *
 * Scopes are named top-down, so when a binding B of scope S is named, every binding of an
 * enclosing scope already has its final name. B's new name must differ from:
 * - every free name of the program (and a fixed list of global-ish names): B would capture it;
 * - the final name of every binding in `S.through` (declared outside S, used inside): B would
 *   capture those uses;
 * - every other final name in S, and every name of a binding below S that is never renamed
 *   (unsafe scopes): those would capture B's uses (or redeclare it);
 * - for a function body below a `params` scope, or a catch body below its `catch` scope, the names
 *   of the parameters: redeclaring one there is an early error, or (a body `var`) silently starts
 *   from the parameter's value.
 * A binding named later, in a scope below S, checks B through its own `through` set in turn.
 *
 * Never renamed: bindings in unsafe scopes (eval, with, Annex B), exported bindings, script
 * top-level bindings (globals), `arguments`/`eval` bindings, and everything in a program parsed as
 * a module without module syntax: it may really be a sloppy script (see `hasModuleSyntax`), where
 * the strict-mode scope model does not hold.
 */

const firstChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_$'
const laterChars = `${firstChars}0123456789`

/** Names a renamed binding never gets: reserved words, contextual keywords and global values. */
const reservedNames: ReadonlySet<string> = new Set(
    (
        'break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with implements interface let package private protected public static yield ' +
        'arguments as async await eval from get Infinity NaN of set undefined'
    ).split(' '),
)

/** Binding names that are never renamed: their meaning depends on the name itself. */
const keptNames = new Set(['arguments', 'eval'])

/**
 * The candidate name at `index` in the order names are handed out: `a`…`z`, `A`…`Z`, `_`, `$`, then
 * two characters (`aa`, `ba`, …), and so on. Reserved words are not filtered here.
 * @param index - Zero-based position in the sequence.
 * @returns The candidate name.
 */
export function candidateName(index: number): string {
    let rest = index
    let name = firstChars.charAt(rest % firstChars.length)
    rest = Math.floor(rest / firstChars.length)
    while (rest > 0) {
        rest--
        name += laterChars.charAt(rest % laterChars.length)
        rest = Math.floor(rest / laterChars.length)
    }
    return name
}

class Renamer {
    /** Final name of every binding already named (fixed ones included). */
    private readonly finalNames = new Map<Binding, string>()
    private readonly fixed = new Set<Binding>()
    /** Names of fixed bindings declared in a scope or below it (only non-empty sets stored). */
    private readonly fixedBelow = new Map<Scope, Set<string>>()
    private readonly candidates: string[] = []
    private readonly analysis: Analysis
    private readonly globalNames: Set<string>

    constructor(analysis: Analysis) {
        this.analysis = analysis
        this.globalNames = analysis.unresolved
    }

    run(): void {
        const root = this.analysis.root
        // A module without import/export/import.meta may be a sloppy script that uses `await` as
        // an identifier; the analysis assumed strict mode, so nothing in it can be trusted.
        if (root.kind === 'module' && !this.analysis.hasModuleSyntax) {
            return
        }
        this.collectFixed(root)
        const scopes = [root]
        for (const scope of scopes) {
            this.nameScope(scope)
            scopes.push(...scope.children)
        }
    }

    private renamable(binding: Binding): boolean {
        const scope = binding.scope
        if (scope.unsafe || binding.exported || keptNames.has(binding.name)) {
            return false
        }
        if (scope.parent === null && (scope.kind === 'script' || !this.analysis.hasModuleSyntax)) {
            return false
        }
        if (binding.identifiers.length === 0) {
            return false
        }
        return binding.identifiers.every((id) => id.name === binding.name)
    }

    /** Records every fixed binding's name and the fixed names declared in each subtree. */
    private collectFixed(scope: Scope): Set<string> | undefined {
        let names: Set<string> | undefined
        for (const binding of scope.bindings.values()) {
            if (!this.renamable(binding)) {
                this.fixed.add(binding)
                this.finalNames.set(binding, binding.name)
                names ??= new Set()
                names.add(binding.name)
            }
        }
        for (const child of scope.children) {
            const below = this.collectFixed(child)
            if (below !== undefined) {
                names ??= new Set()
                for (const name of below) {
                    names.add(name)
                }
            }
        }
        if (names !== undefined) {
            this.fixedBelow.set(scope, names)
        }
        return names
    }

    private nameScope(scope: Scope): void {
        const pending: Binding[] = []
        for (const binding of scope.bindings.values()) {
            if (!this.fixed.has(binding)) {
                pending.push(binding)
            }
        }
        if (pending.length === 0) {
            return
        }
        // Stable sort: ties keep declaration order, so the result is deterministic.
        pending.sort((a, b) => b.identifiers.length - a.identifiers.length)
        const taken = new Set(this.fixedBelow.get(scope))
        for (const binding of scope.through) {
            taken.add(this.finalName(binding))
        }
        const parent = scope.parent
        if (parent !== null && (parent.kind === 'params' || parent.kind === 'catch')) {
            for (const binding of parent.bindings.values()) {
                taken.add(this.finalName(binding))
            }
        }
        let index = 0
        for (const binding of pending) {
            let name = this.candidate(index)
            while (reservedNames.has(name) || this.globalNames.has(name) || taken.has(name)) {
                index++
                name = this.candidate(index)
            }
            taken.add(name)
            this.finalNames.set(binding, name)
            for (const id of binding.identifiers) {
                id.name = name
            }
        }
    }

    private finalName(binding: Binding): string {
        const name = this.finalNames.get(binding)
        if (name === undefined) {
            throw new Error(`rename: "${binding.name}" used before it was named`)
        }
        return name
    }

    private candidate(index: number): string {
        let name = this.candidates[index]
        if (name === undefined) {
            name = candidateName(index)
            this.candidates[index] = name
        }
        return name
    }
}

/**
 * Renames local bindings in place to the shortest names that keep every identifier resolving
 * exactly as before. Mutates `Identifier.name` of every identifier of each renamed binding.
 * @param analysis - The result of `analyze` for the program to rename; its bindings and scopes
 *   describe the program before renaming and are stale afterwards.
 */
export function rename(analysis: Analysis): void {
    new Renamer(analysis).run()
}
