// Microtask ordering across async functions, thenables and async generators.
;(function () {
    const events = []
    const note = (label) => events.push(label)

    async function first() {
        note('first:start')
        await null
        note('first:after-await')
        await new Promise((resolve) => resolve())
        note('first:after-promise')
        return 'first-result'
    }
    async function second() {
        note('second:start')
        const value = await {
            then(resolve) {
                note('thenable')
                resolve(7)
            },
        }
        note(`second:${value}`)
        try {
            await Promise.reject(new TypeError('x'))
        } catch (error) {
            note(`second:caught:${error.name}`)
        }
    }
    async function* ticker() {
        for (let i = 0; i < 2; i++) {
            await null
            yield i
        }
    }
    async function consume() {
        for await (const tick of ticker()) {
            note(`tick:${tick}`)
        }
    }
    first().then((r) => note(r))
    second()
    consume()
    Promise.resolve()
        .then(() => note('micro-1'))
        .then(() => note('micro-2'))
    note('sync-end')
    const arrow = async (x) => (await x) ** 2
    arrow(3).then((v) => note(`arrow:${v}`))
    const member = async (p) => (await p).length
    member(Promise.resolve('four')).then((v) => note(`member:${v}`))
    setTimeout(() => log(events), 0)
})()
