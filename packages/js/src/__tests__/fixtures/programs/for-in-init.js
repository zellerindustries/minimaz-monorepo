// The `in` operator inside for-loop headers needs parentheses.
;(function () {
    const obj = { key: 1 }
    const out = []
    for (let i = ('key' in obj) ? 0 : 5; i < 2; i++) out.push(i)
    for (let f = () => ('key' in obj), n = 0; n < 1; n++) out.push(f())
    for (let f = (() => 'key' in obj), n = 0; n < 1; n++) out.push(f())
    for (let g = function () { return 'key' in obj }, n = 0; n < 1; n++) out.push(g())
    for (let [k = ('key' in obj)] = []; out.length < 6; ) out.push(k)
    for (var key in obj) out.push(key)
    for (const ch of 'ab') out.push(ch)
    for (const [k, v] of Object.entries({ p: 1 })) out.push(k + v)
    let async = { x: 0 }
    for (async.x of [7]);
    out.push(async.x)
    let h
    for (h = ('key' in obj); out.length < 12; ) out.push(h)
    for (const z = [('key' in obj)]; out.length < 13; ) out.push(z)
    for (let m = { v: 'key' in obj }; out.length < 14; ) out.push(m.v)
    for (let t = `${'key' in obj}`; out.length < 15; ) out.push(t)
    for (let c = class { static v = 'key' in obj }; out.length < 16; ) out.push(c.v)
    for (let q = (x = 'key' in obj) => x; out.length < 17; ) out.push(q())
    for (let r = obj['key' in obj ? 'key' : 'no']; out.length < 18; ) out.push(r)
    let target = { v: 0 }
    for ((target).v in { prop: 1 });
    out.push(target.v)
    for (let of of [1]) out.push(of)
    var of = [3]
    for (of in { k: 1 }) out.push(of)
    for (let [x] of [[8]]) out.push(x)
    log(out)
})()
