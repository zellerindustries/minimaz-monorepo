// Destructuring defaults, evaluation order, holes, rest and shorthand.
;(function () {
    const order = []
    const track = (label, value) => (order.push(label), value)
    const {
        a = track('a-default', 1),
        b = track('b-default', 2),
        ...rest
    } = { b: 20, c: 30, d: 40 }
    log(a, b, rest, order)

    const [first, , third = 'def', ...others] = [1, 2, undefined, 4, 5]
    log(first, third, others)

    const { nested: { deep = 'fallback', list: [head] = ['none'] } = {} } = {
        nested: { list: undefined },
    }
    log(deep, head)

    function params({ x, y = x * 2 } = {}, [z = y + 1] = []) {
        return [x, y, z]
    }
    log(params(), params({ x: 3 }), params({ x: 1, y: 1 }, [9]))

    let left = 1
    let right = 2
    ;[left, right] = [right, left]
    log(left, right)

    const key = 'dynamic'
    const { [key]: renamed = 'none', [`${key}2`]: other = 'none2' } = { dynamic: 'yes' }
    log(renamed, other)

    const target = {}
    ;({ p: target.q, r: target['s'] = 7 } = { p: 'P' })
    log(target)

    const value = 5
    const shorthand = { value, other: value + 1 }
    const { value: v2 } = shorthand
    log(shorthand, v2)
    for (const [k, { n = k.length }] of [
        ['abc', {}],
        ['de', { n: 0 }],
    ]) {
        log(k, n)
    }
    let assigned, fallback
    ;({ assigned, fallback = 'fb' } = { assigned: 'as' })
    log(assigned, fallback)
})()
