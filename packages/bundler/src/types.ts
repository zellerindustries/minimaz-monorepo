/**
 * Result of walking a module's relative import graph: every reachable
 * module's rewritten contents, keyed by absolute source path (the entry
 * file included).
 */
export interface ModuleGraphResult {
    modules: Map<string, string>
}
