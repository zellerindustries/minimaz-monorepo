// Iterator protocol, destructuring from iterators and early return closing.
;(function () {
    const events = []
    const iterable = {
        [Symbol.iterator]() {
            let i = 0
            return {
                next: () => (events.push(`next${i}`), { value: i++, done: i > 3 }),
                return: () => (events.push('return'), { done: true }),
            }
        },
    }
    const [x, y] = iterable
    log(x, y, events.splice(0))
    for (const v of iterable) {
        if (v === 1) break
    }
    log(events.splice(0))
    log([...iterable], Array.from(iterable, (v) => v * 10))
    const map = new Map([['k1', 1], ['k2', 2]])
    for (const [key, value] of map) log(key, value)
    const set = new Set('hello')
    log([...set].join(''))
    outer: for (const a of iterable) {
        for (const b of iterable) {
            if (b === 1) continue outer
        }
    }
    log(events.splice(0).length)
})()
