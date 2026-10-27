// `undefined` may only become `void 0` when it is the global one.
;(function () {
    log(undefined, typeof undefined)
    function param(undefined) {
        return undefined
    }
    log(param('shadowed by param'))
    function local() {
        var undefined = 'shadowed by var'
        return undefined
    }
    log(local())
    function block() {
        {
            let undefined = 'shadowed by let'
            if (undefined) return undefined
        }
        return undefined
    }
    log(block())
    const obj = { undefined: 'prop' }
    log(obj.undefined, void 0 === undefined, obj?.undefined)
    function destructured({ undefined }) {
        return undefined
    }
    log(destructured({ undefined: 'destructured' }))
    function catchUndefined() {
        try {
            throw 'caught as undefined'
        } catch (undefined) {
            return undefined
        }
    }
    log(catchUndefined())
    const undefinedArrow = (undefined) => undefined
    log(undefinedArrow('arrow param'), (() => undefined)())
})()
