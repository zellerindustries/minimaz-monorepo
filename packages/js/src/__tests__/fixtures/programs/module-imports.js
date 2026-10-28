// Imports are renamed locally but keep their imported names; every export form keeps its name.
import { join as joinPath, sep } from 'node:path'
import * as util from 'node:util'
import assert, { strictEqual } from 'node:assert'
const local = joinPath('a', 'b')
log(local === `a${sep}b`, typeof util.inspect, typeof assert, typeof strictEqual)
export { local as renamedExport, sep as reexportedImport }
export * as pathNamespace from 'node:path'
export { basename } from 'node:path'
export { local as 'string name' }
function useImports() {
    const sepCopy = sep
    const { inspect } = util
    return [sepCopy === sep, joinPath('x'), typeof inspect]
}
log(useImports())
export default class {
    static value = 'default class'
}
let mutable = 1
export { mutable }
function bump() {
    mutable++
    return mutable
}
log(bump(), mutable)
const shadowed = 'module level'
{
    const shadowed = 'block level'
    log(shadowed)
}
log(shadowed, typeof import.meta.url)
