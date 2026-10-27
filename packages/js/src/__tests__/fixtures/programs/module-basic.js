// A module: top-level bindings are renamed (exports keep their names), import.meta is module syntax.
export const exported = 'exported value'
const privateValue = 'private'
let counter = 0
function increment() {
    return ++counter
}
class Widget {
    static count = increment()
    label() {
        return `${privateValue}:${Widget.count}`
    }
}
export function useAll() {
    increment()
    return [exported, new Widget().label(), counter, typeof import.meta]
}
export { counter as count, Widget }
log(useAll(), counter)
const undefinedCheck = undefined
log(undefinedCheck === void 0, this)
var moduleVar = 'module var'
function readsModuleVar() {
    const local = 'local'
    return [moduleVar, local, typeof globalThis.moduleVar]
}
log(readsModuleVar())
const { a: destructuredA, ...restOfIt } = { a: 1, b: 2 }
export const usesDestructured = destructuredA
log(destructuredA, restOfIt)
