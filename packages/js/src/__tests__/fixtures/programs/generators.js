// Generator protocol, yield precedence, delegation, return and throw.
;(function () {
    function* counter(limit) {
        let received = []
        for (let i = 0; i < limit; i++) {
            const got = yield i * 2
            received.push(got)
        }
        try {
            yield 'last'
        } finally {
            log('cleanup', received)
        }
        return 'done'
    }
    const it = counter(3)
    log(it.next('ignored'), it.next('one'), it.next('two'), it.next('three'))
    log(it.return('early'), it.next())

    function* inner() {
        const x = yield 'inner-1'
        return x + 1
    }
    function* outer() {
        const result = yield* inner()
        yield result
        yield [yield 'a', yield 'b']
    }
    const o = outer()
    log(o.next(), o.next(41), o.next(), o.next('A'), o.next('B'), o.next())

    function* thrower() {
        try {
            yield 1
        } catch (error) {
            yield `caught ${error}`
        }
    }
    const t = thrower()
    t.next()
    log(t.throw('boom'), t.next())

    const obj = {
        *[Symbol.iterator]() {
            yield* [1, 2]
            yield 3
        },
    }
    log([...obj])

    function* precedence() {
        const a = (yield 1) + 1
        const b = yield 2,
            c = 3
        yield a + b + c
    }
    const p = precedence()
    p.next()
    p.next(10)
    log(p.next(100))
})()
