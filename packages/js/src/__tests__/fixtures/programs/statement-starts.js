// Expression statements that must not start with `{`, `function`, `class` or `let [`.
var let = [10, 20]
;(function () {
    ;({}).toString()
    ;({ a: 1 }).a
    ;(function () {
        log('iife')
    })()
    ;(function named() {
        log('named iife')
    }).call(null)
    ;(class {
        static {
            log('class static block')
        }
    })
    ;(async function () {})
    ;(() => log('arrow iife'))()
    ;({ x: log('object start') })
    ;({} = {})
    ;[] = []
    ;(function () {}).name.length
    ;`template ${log('template start')}`
    ;(function* () {})().next()
    ;(async () => {})()
    ;(class {}).name
    ;(function () {
        log('iife with call outside')
    }())
})()
;(let[0]) = 99
log(let[0])
let
x = 5
log(x)
;(let)[1] = 77
log(let)
