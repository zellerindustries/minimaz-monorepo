// `with` makes every name inside it dynamic.
;(function () {
    const scope = { a: 'from object', b: 'b from object' }
    const a = 'local a'
    const c = 'local c'
    with (scope) {
        log(a, b, c)
        var declared = a + '!'
    }
    log(declared)
    function inner() {
        const shadow = 'local'
        with ({ shadow: 'object' }) {
            return shadow
        }
    }
    log(inner())
    function deeper(obj) {
        const value = 'closure'
        with (obj) {
            return () => value
        }
    }
    log(deeper({})(), deeper({ value: 'property' })())
    function unrelatedSibling() {
        const sibling = 'sibling of a with'
        return sibling
    }
    log(unrelatedSibling())
})()
