// Function and var hoisting, including a var that redeclares a function.
;(function () {
    log(typeof early, early())
    function early() {
        return 'hoisted'
    }
    log(typeof later)
    var later = 1
    log(typeof later)

    function shadowing() {
        log(typeof inner)
        var inner = 5
        function inner() {}
        return typeof inner
    }
    log(shadowing())

    function order() {
        return value
        function value() {}
        var value = 1
    }
    log(typeof order())

    var x = 'outer'
    function readsLocal() {
        log(x)
        var x = 'inner'
        return x
    }
    log(readsLocal(), x)
})()
