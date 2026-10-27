// Closures capturing per-iteration `let` bindings vs a shared `var`.
;(function () {
    const fromLet = []
    for (let index = 0; index < 3; index++) {
        fromLet.push(() => index)
    }
    const fromVar = []
    for (var counter = 0; counter < 3; counter++) {
        fromVar.push(() => counter)
    }
    log(
        fromLet.map((fn) => fn()),
        fromVar.map((fn) => fn()),
    )

    // Closures created in the init and update of a for-let loop see different copies.
    const seen = []
    for (let i = 0, peek = () => i; i < 3; i++, seen.push(peek())) {
        seen.push(i)
    }
    log(seen)

    const makers = {}
    for (const key of ['alpha', 'beta']) {
        let calls = 0
        makers[key] = () => `${key}:${++calls}`
    }
    log(makers.alpha(), makers.alpha(), makers.beta())

    function counterFactory(start) {
        let value = start
        return {
            next: () => ++value,
            reset() {
                value = start
            },
        }
    }
    const c1 = counterFactory(10)
    const c2 = counterFactory(20)
    c1.next()
    c1.next()
    c2.next()
    log(c1.next(), c2.next())
    c1.reset()
    log(c1.next())
})()
