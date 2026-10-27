// Deep closure chains where inner scopes reuse short names that outer scopes also want.
;(function () {
    function level1(p1) {
        const l1 = 'l1'
        return function level2(p2) {
            const l2 = 'l2'
            return function level3(p3) {
                const l3 = 'l3'
                const unrelated1 = 'u1', unrelated2 = 'u2'
                return function level4() {
                    return [p1, p2, p3, l1, l2, l3, unrelated1, unrelated2].join(',')
                }
            }
        }
    }
    log(level1('a')('b')('c')())
    function siblings() {
        function left() {
            const leftOnly = 'left'
            return leftOnly
        }
        function right() {
            const rightOnly = 'right'
            const sharedName = left()
            return rightOnly + sharedName
        }
        return right()
    }
    log(siblings())
    const memo = (fn) => {
        const cache = new Map()
        return (n) => {
            if (!cache.has(n)) cache.set(n, fn(n))
            return cache.get(n)
        }
    }
    const fib = memo((n) => (n < 2 ? n : fib(n - 1) + fib(n - 2)))
    log(fib(40))
    function curry(f) {
        return (a) => (b) => (c) => f(a, b, c)
    }
    log(curry((x, y, z) => x * y + z)(2)(3)(4))
    function outerUsesLater() {
        const later = () => captured
        let captured = 'captured late'
        return later()
    }
    log(outerUsesLater())
    function hoistedUse() {
        return helper()
        function helper() {
            return local
        }
        var local
    }
    log(hoistedUse())
    function innerShadowsAfterUse() {
        const value = 'outer value'
        function read() {
            const first = value
            {
                const value = 'inner value'
                return [first, value]
            }
        }
        return read()
    }
    log(innerShadowsAfterUse())
    function manyInner() {
        const keep = 'keep'
        const fns = []
        for (let i = 0; i < 3; i++) {
            const a = i, b = i * 2, c = i * 3
            fns.push(() => [a, b, c, keep].join(''))
        }
        return fns.map((f) => f())
    }
    log(manyInner())
})()
