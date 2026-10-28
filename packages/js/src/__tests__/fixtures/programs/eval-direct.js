// Direct eval sees (and can add) locals, so scopes around it must keep their names.
;(function () {
    function reads() {
        const secret = 'visible to eval'
        return eval('secret')
    }
    log(reads())
    function nested() {
        const outerName = 'outer-name'
        function inner() {
            return eval('outerName')
        }
        return inner()
    }
    log(nested())
    function adds() {
        eval('var created = 42')
        return created
    }
    log(adds())
    function param(x, y = eval('x + 1')) {
        return y
    }
    log(param(1))
    function arrowEval() {
        const localValue = 'arrow sees it'
        return (() => eval('localValue'))()
    }
    log(arrowEval())
    function sibling() {
        const untouched = 'renamable'
        function evals() {
            const here = 'here'
            return eval('here')
        }
        return [untouched, evals()]
    }
    log(sibling())
    function optional() {
        const opt = 'optional call'
        return eval?.('typeof opt')
    }
    log(optional())
    function shadowsGlobal() {
        const Math = 'local Math'
        return eval('Math')
    }
    log(shadowsGlobal())
    function evalInBlock() {
        const outside = 'outside block'
        {
            const inside = 'inside block'
            return eval('outside + "/" + inside')
        }
    }
    log(evalInBlock())
})()
