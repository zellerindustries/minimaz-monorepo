// ASI traps: restricted productions, no-ASI continuations and comments containing newlines.
;(function () {
    function ret() {
        return
        42
    }
    log(ret())
    function retComment() {
        return /*
        */ 42
    }
    log(retComment())
    function retSameLine() {
        return /* same line */ 42
    }
    log(retSameLine())
    let i = 1
    let j = 5
    i
    ++j
    log(i, j)
    const fn = (x) => () => `called with ${typeof x}`
    const r = fn
    (function () {})()
    log(r)
    const list = [1, 2]
    const m = list
    [0]
    log(m)
    let s = 'a'
    s
    += 'b'
    log(s)
    const t = 1
    -1
    log(t)
    function brk() {
        let n = 0
        for (;;) {
            n++
            if (n > 2) break
        }
        return n
    }
    log(brk())
    let k = 0
    do k++; while (k < 3) log('after do-while', k)
    var y = 1, z = y
    + 1
    log(z)
    function* gen() {
        yield
        1
    }
    log([...gen()])
    let q = 1
    q
    --
    q
    log(q)
    const tplCall = (strings) => strings[0]
    const viaTag = tplCall
    `template continues the expression`
    log(viaTag)
    const obj = { a: 1 }
    const member = obj
    .a
    log(member)
    const ternary = true
    ? 'yes'
    : 'no'
    log(ternary)
})()
