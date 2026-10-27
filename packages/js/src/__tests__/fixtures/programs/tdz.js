// Temporal dead zone errors caught and logged by error type.
;(function () {
    function probe(fn) {
        try {
            return fn()
        } catch (error) {
            return `${error.constructor.name}`
        }
    }
    log(
        probe(() => {
            const before = value
            let value = 1
            return before
        }),
    )
    log(
        probe(() => {
            return typeof notYet
            let notYet
        }),
    )
    log(probe(() => typeof neverDeclaredAnywhere))
    log(probe(() => new Klass()))
    class Klass {}
    log(
        probe(() => {
            function f(a = b, b = 1) {
                return [a, b]
            }
            return f()
        }),
    )
    log(
        probe(() => {
            function f(a = 1, b = a + 1) {
                return [a, b]
            }
            return f()
        }),
    )
    log(
        probe(() => {
            switch (1) {
                case 0:
                    let inSwitch = 'x'
                    return inSwitch
                case 1:
                    return inSwitch
            }
        }),
    )
    log(
        probe(() => {
            let self = self + 1
            return self
        }),
    )
    log(
        probe(() => {
            const fixed = 1
            fixed = 2
            return fixed
        }),
    )
})()
