// Object literal getters/setters, odd method names and __proto__.
;(function () {
    let backing = 1
    const obj = {
        get value() {
            return backing * 10
        },
        set value(v) {
            backing = v
        },
        get: 'a property named get',
        set: 'a property named set',
        async: 'async prop',
        get get2() {
            return 'getter named get2'
        },
        'quoted-key': 1,
        'validIdent': 2,
        '1': 'one',
        '01': 'zero-one',
        0x10: 'sixteen',
        1e3: 'thousand',
        0.5: 'half',
        [`comp${'uted'}`]: 'computed',
        async *gen() {
            yield 1
        },
        async get3() {
            return 'async method named get3'
        },
    }
    obj.value = 3
    log(obj.value, obj.get, obj.set, obj.async, obj.get2, Object.keys(obj))
    obj.get3().then((v) => log(v))
    const proto = { inherited: 'yes' }
    const literal = { __proto__: proto }
    const quoted = { '__proto__': proto }
    const computed = { ['__proto__']: proto }
    const __proto__ = proto
    const short = { __proto__ }
    log(literal.inherited, quoted.inherited, computed.inherited, short.inherited)
    log(Object.keys(literal), Object.keys(computed), Object.keys(short))
    const withSuper = {
        __proto__: {
            hello() {
                return 'proto hello'
            },
        },
        hello() {
            return `own > ${super.hello()}`
        },
    }
    log(withSuper.hello())
    const desc = Object.getOwnPropertyDescriptor(obj, 'value')
    log(typeof desc.get, typeof desc.set)
    const methodProto = { __proto__() { return 'method named __proto__' } }
    log(Object.keys(methodProto), Object.getPrototypeOf(methodProto) === Object.prototype)
})()
