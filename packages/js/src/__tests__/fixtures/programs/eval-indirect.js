// Indirect eval only sees globals, so locals around it may be renamed.
var globalName = 'global'
;(function () {
    const globalName = 'local'
    const indirect = (0, eval)('globalName')
    const alias = eval
    const viaAlias = alias('globalName')
    log(indirect, viaAlias, globalName)
    function localEval() {
        const eval = (s) => `local eval: ${s}`
        return eval('globalName')
    }
    log(localEval())
    log(new Function('return typeof globalName')())
    const parenthesized = (eval)('typeof globalName')
    log(parenthesized)
})()
