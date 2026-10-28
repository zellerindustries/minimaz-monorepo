// Sloppy-mode block functions (Annex B) and var redeclaring a catch parameter.
;(function () {
    log(typeof blockFn)
    {
        function blockFn() {
            return 'block function'
        }
    }
    log(typeof blockFn, blockFn())
    function conditional(flag) {
        if (flag) {
            function choose() {
                return 'chosen'
            }
        }
        return typeof choose
    }
    log(conditional(true), conditional(false))
    function catchVar() {
        try {
            throw 'e'
        } catch (err) {
            var err = 'reassigned'
            log(err)
        }
        return err
    }
    log(catchVar())
    function strictBlock() {
        'use strict'
        {
            function hidden() {}
        }
        return typeof hidden
    }
    log(strictBlock())
    function blockedByLet() {
        let shadow = 'let shadow'
        {
            function shadow() {}
        }
        return typeof shadow
    }
    log(blockedByLet())
    function innerUse() {
        const result = []
        {
            result.push(typeof later)
            function later() {
                return 'later'
            }
        }
        result.push(typeof later)
        return result
    }
    log(innerUse())
})()
