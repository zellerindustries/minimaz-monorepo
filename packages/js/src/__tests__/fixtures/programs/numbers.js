// Numeric literal forms the printer may shorten.
;(function () {
    log(1_000, 1_000.000_1, 0b1010_1010, 0o7_7, 0xFF_FF, 1e1_0)
    log(0.5, 0.000001, 0.0000001, 1000000, 123456789012345680000, 1e21, 1e-7)
    log(5e-324, Number.MAX_SAFE_INTEGER, 1.7976931348623157e308, 9007199254740993)
    log(-0 === 0, Object.is(-0, 0), 1 / -0, Object.is(0 * -1, -0))
    log(1..toString(), 1.5.toFixed(2), (1).toString(2), 1.0.toFixed(1), 1e3.toString())
    log(0.1 + 0.2, 100 / 3, 2 ** 0.5, 255..toString(16), 0x10.toString(), 1e21.toString())
    log(010, 08, 0.0, 00, 0xa, -0x10, 09.5, 1e400, -1e400)
    log(.5 + .25, 5., 1E3, 1e+3, 2e-0, 0.1e1, 100e-2, 123e5, 1234500000)
    log(4294967295, 4294967296, 0xFFFFFFFF | 0, 2147483648 >> 0, 1e15, 1e16, 12e20)
    log(1 / 3, 2 / 3, 0.30000000000000004, 1.5e-10, 3.14159)
    const big = 1000000000000000128
    log(big, big.toString(), 1000000000000000128.5)
})()
