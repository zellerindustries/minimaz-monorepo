// BigInt arithmetic, literal forms and mixing errors.
;(function () {
    const big = 2n ** 64n
    log(big, 0x1fn, 0o17n, 0b101n, 1_000_000n, 0n, 0xFFFF_FFFF_FFFF_FFFFn)
    log(-big / 3n, big % 7n, -(5n), typeof 1n, (-1n) ** 2n)
    try {
        log(1n + 1)
    } catch (error) {
        log(error.constructor.name)
    }
    log(1n < 2, 2n == 2, 2n === 2, BigInt.asIntN(8, 255n))
    log(5n << 2n, -5n >> 1n, ~0n, 10n .toString(), 10n.toString(2))
    const obj = { 1n: 'bigint key', [2n]: 'computed bigint key' }
    log(Object.keys(obj))
})()
