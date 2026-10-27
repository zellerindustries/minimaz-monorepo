// Nested shadowing, catch parameters and named function expressions.
;(function () {
    const value = 'outer'
    function a() {
        const value = 'a'
        return function b() {
            {
                const value = 'block'
                if (value !== 'block') throw new Error('wrong')
            }
            return value
        }
    }
    log(a()(), value)
    try {
        throw 'thrown'
    } catch (value) {
        log(value)
        {
            let value = 'inside catch block'
            log(value)
        }
    }
    try {
        throw { code: 7, msg: 'm' }
    } catch ({ code, msg = 'default' }) {
        log(code, msg)
    }
    try {
        throw 1
    } catch {
        log('no binding')
    }
    const fn = function self(n) {
        return n <= 0 ? 'bottom' : self(n - 1)
    }
    log(fn(3))
    const named = function g() {
        var g = 'shadowed'
        return g
    }
    log(named())
    const typeofSelf = function h() {
        return typeof h
    }
    log(typeofSelf())
    const assignsSelf = function k() {
        k = 'ignored in sloppy mode'
        return typeof k
    }
    log(assignsSelf())
    function param(p) {
        {
            let p = 'block-p'
            log(p)
        }
        return p
    }
    log(param('arg-p'))
    function sameName(sameName) {
        return sameName
    }
    log(sameName('param wins'))
    let x = 1
    {
        let x = 2
        {
            let x = 3
            log(x)
        }
        log(x)
    }
    log(x)
    const catchShadow = (() => {
        let e = 'outer e'
        try {
            throw 'inner e'
        } catch (e) {
            e = 'reassigned'
        }
        return e
    })()
    log(catchShadow)
})()
