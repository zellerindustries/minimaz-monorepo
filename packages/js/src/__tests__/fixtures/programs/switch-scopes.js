// Lexical declarations shared across switch cases, and functions declared in a case.
;(function () {
    function run(x) {
        const out = []
        switch (x) {
            case 1:
                let shared = 'one'
                out.push(shared)
            case 2:
                shared = 'two'
                out.push(shared)
                break
            case 3:
                function inCase() {
                    return 'in case'
                }
                out.push(inCase())
                break
            default: {
                const scoped = 'default'
                out.push(scoped)
            }
        }
        return out
    }
    log(run(1), run(3), run(9))
    try {
        log(run(2))
    } catch (error) {
        log(error.constructor.name)
    }
    function discriminantScope(v) {
        const v2 = v
        switch (v2) {
            case v2:
                const v2Inner = v2 + '!'
                return v2Inner
        }
    }
    log(discriminantScope('d'))
    function caseOrder() {
        const seen = []
        const t = (x) => (seen.push(x), x)
        switch (t(3)) {
            case t(1):
            case t(3):
                seen.push('matched')
            case t(4):
                seen.push('fell')
        }
        return seen
    }
    log(caseOrder())
})()
