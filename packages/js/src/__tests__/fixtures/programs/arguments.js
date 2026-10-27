// The arguments object: mapping in sloppy mode, arrows inheriting it, and a parameter named arguments.
;(function () {
    function mapped(a, b) {
        arguments[0] = 'changed'
        b = 'b-changed'
        return [a, arguments[1], arguments.length]
    }
    log(mapped(1, 2, 3))
    function unmapped(a, b = 2) {
        arguments[0] = 'changed'
        return [a, b, arguments.length]
    }
    log(unmapped(1))
    function strict(a) {
        'use strict'
        arguments[0] = 'changed'
        return a
    }
    log(strict('original'))
    function viaArrow() {
        const inner = () => arguments[0]
        return inner('ignored')
    }
    log(viaArrow('outer-arg'))
    function param(arguments) {
        return arguments
    }
    log(param('param-value'))
    function localVar() {
        var arguments = 'local'
        return arguments
    }
    log(localVar(1))
    function sum() {
        let total = 0
        for (const value of arguments) total += value
        return total
    }
    log(sum(1, 2, 3, 4))
    function rest(first, ...others) {
        return [first, others, arguments.length]
    }
    log(rest(1, 2, 3))
    function callee() {
        return typeof arguments.callee
    }
    log(callee())
    function letArguments() {
        let arguments = 'let arguments'
        return arguments
    }
    log(letArguments(1))
    function fnArguments() {
        function arguments() {}
        return typeof arguments
    }
    log(fnArguments(1))
    function defaultSees(a, b = arguments.length) {
        return b
    }
    log(defaultSees(1), defaultSees(1, undefined, 3))
})()
