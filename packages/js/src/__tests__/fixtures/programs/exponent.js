// Exponent precedence and associativity with unary operators and await.
;(function () {
    const two = 2
    log(2 ** 3 ** 2, (2 ** 3) ** 2, (-2) ** 2, -(2 ** 2), 2 ** -1)
    log((+two) ** 2, (~two) ** 2, (typeof two).length ** 2, (!two) ** 2, (void two) ** 2)
    let n = 3
    n **= 2
    log(n, (n++) ** 2, n, (--n) ** 2, n-- ** 2)
    log(two ** two ** 0, (two ** two) ** 0)
    log(10 ** 21, 10 ** -7, 2 ** 53 + 1)
    const viaAwait = async () => (await 3) ** 2
    viaAwait().then((v) => log('await', v))
    log(-(-two), +(+two), - -two, typeof typeof two, !(!two))
    log((-two) ** 3, -(two ** 3), 2 ** (-two), (2 ** two) * 3, 2 ** (two * 3))
    const obj = { p: 3 }
    log(obj.p ** 2, (delete obj.q) ** 2, 2 ** obj.p ** 0)
})()
