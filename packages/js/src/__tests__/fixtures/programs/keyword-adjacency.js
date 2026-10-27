// Keywords next to operands where the printer drops spaces.
;(function () {
    const s = 'x'
    const o = { x: 1 }
    log(typeof s, typeof (s), void s, s in o, !(s in o), o instanceof Object)
    function r1() { return !0 }
    function r2() { return 'str' }
    function r3() { return [1] }
    function r4() { return -1 }
    function r5() { return .5 }
    function r6() { return `t` }
    function r7() { return (1, 2) }
    function r8() { return { a: 1 } }
    function r9() { return function () { return 'fn' } }
    function r10() { return class {} }
    function r11() { return ++o.x }
    log(r1(), r2(), r3(), r4(), r5(), r6(), r7(), r8(), r9()(), typeof r10(), r11())
    switch (s) {
        case 'x':
            log('case string')
        case `y`:
            log('fallthrough')
            break
        default:
            log('no')
    }
    switch (-1) {
        case -1:
            log('negative case')
    }
    switch ([1].length) {
        case [1].length:
            log('array case')
    }
    function* gen() {
        yield /re/.source
        yield -1
        yield [2]
        yield 'q'
        yield* 'ab'
        yield
    }
    log([...gen()])
    const del = { p: 1 }
    log(delete del.p, delete del['q'], del)
    let n = 2
    log(- -n, + +n, - - -n, -(-n), + -n, n - -1, n + +1, n - - - 1)
    let m = 3
    log(m-- - -m, m++ + +m, m - --m, m + ++m, m - -(-m), m+ +m, m- -m)
    log(1 - -1, 1 + +'2', 1 - - '1')
    throwIt()
    function throwIt() {
        try {
            throw 'x'
        } catch (e) {
            log(e)
        }
        try {
            throw { t: 'object' }
        } catch (e) {
            log(e)
        }
        try {
            throw [1]
        } catch (e) {
            log(e)
        }
    }
    const arr = ['a', 'b']
    for (const i in arr) log(i)
    for (const v of[3]) log(v)
    if (s) log('if no space')
    else log('else')
    do log('do once'); while (false)
    log(typeof typeof void 0, void typeof 0, typeof !0, typeof -0, typeof +s, typeof [], typeof {})
    log('x' in o ? 'in' : 'out', 'y'in o, 1 instanceof Number, s instanceof Object)
})()
