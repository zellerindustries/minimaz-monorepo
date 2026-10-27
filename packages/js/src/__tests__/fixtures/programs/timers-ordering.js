// Interleaving of timers, promises and async functions.
;(function () {
    const out = []
    setTimeout(() => out.push('timeout-1'), 0)
    Promise.resolve().then(() => out.push('promise-1'))
    ;(async () => {
        out.push('async-sync')
        await undefined
        out.push('async-after')
        await new Promise((r) => setTimeout(r, 0))
        out.push('async-after-timeout')
        log(out)
    })()
    out.push('sync')
    async function rejects() {
        throw new RangeError('async throw')
    }
    rejects().catch((error) => log('caught', error.constructor.name))
    const all = Promise.all([1, Promise.resolve(2), (async () => 3)()])
    all.then((values) => log('all', values))
    Promise.race([new Promise((r) => setTimeout(() => r('slow'), 5)), 'fast']).then((v) => log('race', v))
})()
