// Same-precedence right operands that must keep their parentheses.
;(function () {
    const a = 1
    const b = 2
    const s = '3'
    log(a + (b + s), a + b + s, (a + b) + s, s + (a + b), a + (b - s), a - (b + s))
    log(10 - (4 - 3), 10 - 4 - 3, 2 * (3 / 4), (2 * 3) / 4, 2 / (3 * 4))
    log(0.1 * (3 * 0.1), (0.1 * 3) * 0.1, 1e308 * (10 / 10), (1e308 * 10) / 10)
    log(7 % (5 % 3), (7 % 5) % 3, 7 * (5 % 3), (7 * 5) % 3)
    log(1 << (2 << 1), (1 << 2) << 1, -16 >> (1 >>> 0))
    log(a < b === true, a < (b === true), (a == b) == false, a == (b == false))
    log(a ? b : (a, b), (a ? b : s) ? 'x' : 'y', a ? (b ? 'bb' : 'bs') : 's')
    let x
    log((x = 5) + 1, x, (x += 1) * 2)
    log(!(a && b), !a && b, -(a - b), typeof (a + b))
    log((a || b) && s, a || (b && s), (a && b) || s, a & (b | 4), (a & b) | 4, a ^ (b & 3))
    log((a, b) + 1, [a, b].map((v) => (v, v * 2)))
    const fn = () => ({ object: true })
    const fn2 = () => ({}).constructor === Object
    const fn3 = () => (a, b)
    const fn4 = () => ({}.constructor)
    let k
    const fn5 = () => ({ k } = { k: 9 })
    log(fn(), fn2(), fn3(), fn4() === Object, fn5(), k)
    log(void (a + b), typeof void 0, -(+a), +(-a))
    log(('a' in { a: 1 }) === true, !('b' in {}))
    let y = 1
    log((y = 2, y + 1), y, ((y)) = 3, y)
    const arr = []
    log((arr.length = 2), arr.length, (arr[0] = 'z') + '!')
    log(typeof (() => {}), typeof function () {}, (function () { return 'fe' })())
    log(((a)), -(-(-a)), !(a instanceof Object), (a instanceof Object) === false)
    log(a + +b, a - -b, a + -b, a - +b, a+(+b), a+(++x), a-(--x))
    log(!(!a), ~(~b), ~-a, -~a)
    log((() => 'arrow')(), (async () => 1)() instanceof Promise)
    log(new Date(0).getTime(), new (class { v = 'anon' })().v)
})()
