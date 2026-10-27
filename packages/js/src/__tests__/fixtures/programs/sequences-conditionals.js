// Sequence expressions, conditionals and assignment chains.
;(function () {
    let a, b, c
    a = b = c = 3
    log(a, b, c)
    const r = (a++, b--, c * 2)
    log(r, a, b)
    const t = a > 3 ? b > 1 ? 'both' : 'a' : c ? 'c' : 'none'
    log(t)
    const u = (a > 10 ? a : b) ? 'truthy' : 'falsy'
    log(u)
    let x = 0
    const v = x ? (x = 1) : (x = 2)
    log(v, x)
    const w = (x = 5) ? x : 0
    log(w)
    const arr = [(1, 2), 3]
    log(arr, [((a, b))])
    const fn = (p = (1, 2)) => p
    log(fn())
    for (let i = 0, j = 10; i < j; i += 4, j -= 4) log(i, j)
    const nestedArrow = (q) => (r) => q ? r : (s) => s
    log(nestedArrow(1)(2), nestedArrow(0)(2)(3))
    const cond = a ? (b, c) : (c, b)
    log(cond)
    const assignInCond = (x = 1) ? (x += 1) : (x -= 1)
    log(assignInCond, x)
    const arrowInCond = a ? () => 'yes' : () => 'no'
    log(arrowInCond())
    const yieldLike = (function* () {
        const y = yield (1, 2)
        return y ? yield : 0
    })()
    log(yieldLike.next(), yieldLike.next(1), yieldLike.next('final'))
    let z = 1
    z += z *= 2
    log(z)
    const obj = {}
    obj.a = obj.b = obj.c = 'chained'
    log(obj)
    log(a ? b : c ? a : b, (a ? b : c) ? a : b)
})()
