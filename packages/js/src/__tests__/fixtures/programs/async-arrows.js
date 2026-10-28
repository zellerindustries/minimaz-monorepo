// `async` as an identifier vs async arrows; `await`/`yield`/`let`/`static` as sloppy identifiers.
var async = function (x) {
    return `async called with ${x}`
}
var await = 'await identifier'
var yield = 'yield identifier'
;(function () {
    log(async(1), await, yield)
    const a1 = async (x) => x * 2
    const a2 = async x => x * 3
    const a3 = async () => 'no args'
    a1(1).then((v) => log('a1', v))
    a2(1).then((v) => log('a2', v))
    a3().then((v) => log('a3', v))
    const notArrow = async
    (5)
    log(notArrow)
    function usesYield() {
        var yield = 'local yield'
        return yield
    }
    log(usesYield())
    function usesAwait() {
        var await = 'local await'
        return await
    }
    log(usesAwait())
    function usesStatic() {
        var static = 'local static', implements = 'impl', of = 'of', get = 'get', set = 'set'
        return [static, implements, of, get, set]
    }
    log(usesStatic())
    const obj = { async, await }
    log(typeof obj.async, obj.await)
    const asyncMember = { async: (v) => `member ${v}` }
    log(asyncMember.async(2))
    const asyncArrowInCall = [1, 2].map(async (v) => v)
    log(asyncArrowInCall.length)
    log(async
    (6))
})()
