// Strict and sloppy functions side by side: `this`, assignments to undeclared names, octal escapes.
;(function () {
    function sloppy() {
        return typeof this
    }
    function strict() {
        'use strict'
        return typeof this
    }
    log(sloppy(), strict())
    function sloppyAssign() {
        undeclaredSloppy = 'created'
        return typeof undeclaredSloppy
    }
    log(sloppyAssign())
    function strictAssign() {
        'use strict'
        try {
            undeclaredStrict = 1
        } catch (error) {
            return error.constructor.name
        }
    }
    log(strictAssign())
    class Implicit {
        m() {
            try {
                undeclaredInClass = 1
            } catch (error) {
                return error.constructor.name
            }
        }
    }
    log(new Implicit().m())
    function frozen() {
        'use strict'
        const o = Object.freeze({ p: 1 })
        try {
            o.p = 2
        } catch (error) {
            return error.constructor.name
        }
    }
    log(frozen())
    function sloppyFrozen() {
        const o = Object.freeze({ p: 1 })
        o.p = 2
        return o.p
    }
    log(sloppyFrozen(), '\101', '\8')
    function nestedStrict() {
        'use strict'
        return function () {
            return typeof this
        }()
    }
    log(nestedStrict())
})()
