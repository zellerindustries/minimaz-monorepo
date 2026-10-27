// HTML-like comments are only comments in scripts; the printer must not create new ones.
;(function () {
    let a = 5
    let b = 3
    log(a < !--b, b)
    let c = 4
    log(c-- > 2, c)
    let d = 1
    const e = d-->0
    log(e, d)
    log(a<!--b
    )
    let f = 2
    log(f--
    >1)
    const g = [3]
    log(g[0]-- > 1, g)
    log(a < ! --b, a<!-b)
})()
<!-- an HTML open comment at the end of a script line
--> an HTML close comment at the start of a line
log('after html comments')
