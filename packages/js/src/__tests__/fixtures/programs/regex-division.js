// Regex literals vs division in every context the printer can produce.
;(function () {
    let a = 12
    const b = 3
    const g = 2
    log(a / b / g, a / b, (a / b) / g, a / (b / g))
    log(/=/.test('a=b'), /[/]/.test('/'), /\//.source)
    const re = /ab+c/gi
    log(re.flags, 'xABBCabc'.match(re))
    let x = 10
    x /= 2
    log(x, x / /2/.source.length)
    const arr = [4]
    log(arr[0] / 2, (1) / 2)
    function ret() {
        return /re/.test('re')
    }
    log(ret(), typeof /x/, !/x/.test('y'))
    if (true) /a/g.lastIndex
    const tpl = `${a}` / 2
    log(tpl)
    log(a++ / 2, a)
    log(/[\]/]/.test(']'), /a\/b/.test('a/b'))
    const obj = { v: 8 }
    log(obj.v / 2 / 2)
    log(+/1/.source, -/2/.source)
    log([/a/, /b/].length)
    log(a / b > 1 ? /yes/.source : /no/.source)
    log(/a/u.unicode, /(?<year>\d{4})/.exec('in 2024').groups.year, /\p{L}+/v.test('é'))
    const after = {} / 2
    log(after)
    log(a
    /2/
    1)
})()
