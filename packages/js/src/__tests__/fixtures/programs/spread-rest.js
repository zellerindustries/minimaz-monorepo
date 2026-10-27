// Spread and rest in calls, arrays, objects and parameters; array holes.
;(function () {
    const nums = [1, 2, 3]
    log(Math.max(...nums), [...nums, ...'ab'], [0, ...nums, 4])
    const sparse = [, 1, , 2, ,]
    log(sparse.length, 0 in sparse, 1 in sparse, [...sparse])
    log([,].length, [1, ,].length, [, ,].length, [1,].length, [, 1].length)
    const base = { a: 1, b: 2 }
    const merged = { ...base, b: 3, ...null, ...'xy' }
    log(merged)
    function collect(first, ...rest) {
        return { first, rest }
    }
    log(collect(...nums, ...[4, 5]))
    const { a, ...others } = merged
    log(a, others)
    class Point {
        constructor(...coords) {
            this.coords = coords
        }
    }
    log(new Point(...nums).coords)
    const args = [[1, 2], [3]]
    log([].concat(...args))
    const arrow = (...all) => all.length
    log(arrow(), arrow(...[, ,]))
    const [, ...tail] = 'xyz'
    log(tail)
    log([...[...[...'deep']]].length, { ...{ ...{ k: 'nested' } } })
    log([(1, 2), ...[3, 4]], [...(nums.length ? nums : [])])
})()
