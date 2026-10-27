// Directives vs string expression statements that only look like them.
var probeThis = function () {
    return this
}
;(function () {
    function sloppy() {
        return this === undefined
    }
    function strict() {
        'use strict'
        return this === undefined
    }
    function notDirective() {
        ;('use strict')
        return this === undefined
    }
    function secondDirective() {
        'other'
        'use strict'
        return this === undefined
    }
    function afterStatement() {
        var x = 1
        'use strict'
        return this === undefined
    }
    function parenthesized() {
        ('use strict')
        return this === undefined
    }
    function concatenated() {
        'use ' + 'strict'
        return this === undefined
    }
    function escaped() {
        'use\x20strict'
        return this === undefined
    }
    function doubleQuoted() {
        "use strict"
        return this === undefined
    }
    function memberAfter() {
        'use strict'.length
        return this === undefined
    }
    const arrowStrict = () => {
        'use strict'
        return typeof this
    }
    log(sloppy(), strict(), notDirective(), secondDirective(), afterStatement())
    log(parenthesized(), concatenated(), escaped(), doubleQuoted(), memberAfter(), arrowStrict())
    log(typeof probeThis())
    class InClass {
        m() {
            return this
        }
    }
    const m = new InClass().m
    log(m() === undefined)
})()
