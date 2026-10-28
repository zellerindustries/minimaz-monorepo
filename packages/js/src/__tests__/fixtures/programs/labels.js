// Labels share names with variables; break/continue to outer labels.
;(function () {
    const out = []
    let outer = 'variable named outer'
    outer: for (let i = 0; i < 3; i++) {
        inner: for (let j = 0; j < 3; j++) {
            if (j === 1) continue outer
            if (i === 2) break outer
            out.push(`${i}${j}`)
            if (j > 5) break inner
        }
    }
    log(out, outer)
    block: {
        out.push('in-block')
        if (out.length) break block
        out.push('unreachable')
    }
    log(out.length)
    let a = 0
    a: while (true) {
        a++
        if (a > 2) break a
    }
    log(a)
    const label = 1
    label: label
    log(label)
    b: c: d: for (;;) {
        break c
    }
    log('nested labels')
})()
