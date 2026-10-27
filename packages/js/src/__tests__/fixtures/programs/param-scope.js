// Parameter scopes with expressions: body vars start from the parameter's value.
;(function () {
    function f(a, b = () => a) {
        var a
        const before = a
        a = 'body'
        return [before, a, b()]
    }
    log(f('param'))
    function g(x, getX = () => x) {
        var x = 'redeclared'
        return [x, getX()]
    }
    log(g('original'))
    function h(p, setP = (v) => (p = v)) {
        setP('set via closure')
        var p
        return p
    }
    log(h('start'))
    function simple(a) {
        var a
        return a
    }
    log(simple('kept'))
    function arrowDefault(n = 1, m = (() => n + 1)()) {
        let inner = n + m
        return inner
    }
    log(arrowDefault(), arrowDefault(5))
    const outer = 'outer'
    function shadowInDefault(x = outer, outer2 = x) {
        const outer = 'body outer'
        return [x, outer2, outer]
    }
    log(shadowInDefault())
    function destructuredVar({ d } = { d: 'default d' }, e = () => d) {
        var d
        const first = d
        d = 'changed'
        return [first, d, e()]
    }
    log(destructuredVar())
    function fnInBody(q, r = () => q) {
        function q() {}
        return [typeof q, typeof r()]
    }
    log(fnInBody('param q'))
    function closureInDefault(z, w = () => typeof y) {
        var y = 'body y'
        return w()
    }
    log(closureInDefault())
    function restVar(...rest) {
        var rest
        return rest
    }
    log(restVar(1, 2))
    const arrowVar = (k, l = () => k) => {
        var k
        return [k, l()]
    }
    log(arrowVar('arrow k'))
})()
