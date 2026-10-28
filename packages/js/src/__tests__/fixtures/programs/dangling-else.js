// Dangling else and single-statement bodies.
;(function () {
    function test(a, b) {
        if (a) {
            if (b) return 'ab'
        } else return 'not a'
        return 'a only'
    }
    log(test(1, 1), test(1, 0), test(0, 1))
    function nested(a, b) {
        if (a) {
            for (;;) {
                if (b) return 'b'
                break
            }
        } else return 'else'
        return 'end'
    }
    log(nested(1, 0), nested(0, 0), nested(1, 1))
    function labelled(a) {
        if (a) {
            l: if (a > 1) return 'big'
        } else return 'zero'
        return 'small'
    }
    log(labelled(2), labelled(1), labelled(0))
    function whileElse(a) {
        if (a) {
            while (a-- > 5) if (a === 7) return 'seven'
        } else return 'falsy'
        return 'done'
    }
    log(whileElse(9), whileElse(3), whileElse(0))
    function forOfElse(list) {
        if (list) {
            for (const item of list) if (item) return 'truthy item'
        } else return 'no list'
        return 'no truthy'
    }
    log(forOfElse([0, 1]), forOfElse([0]), forOfElse(null))
    function withElse(o) {
        if (o) {
            with (o) if (v) return 'v'
        } else return 'no o'
        return 'no v'
    }
    log(withElse({ v: 1 }), withElse({ v: 0 }), withElse(null))
    function ifElseIf(a, b) {
        if (a) {
            if (b) return 1
            else if (!b) return 2
        } else return 3
    }
    log(ifElseIf(1, 1), ifElseIf(1, 0), ifElseIf(0, 0))
    let count = 0
    if (count === 0);
    else count = 9
    for (let i = 0; i < 3; i++);
    while (count++ < 3);
    log(count)
})()
