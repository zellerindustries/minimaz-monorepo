// Optional chaining: short-circuit extent, parentheses that end a chain, calls and `this`.
;(function () {
    const probe = (fn) => {
        try {
            return fn()
        } catch (error) {
            return error.constructor.name
        }
    }
    const nil = null
    const obj = { a: { b: { c: 'deep' } }, method() { return this === obj } }
    log(nil?.a.b.c, obj?.a.b.c, obj.x?.y.z)
    log(probe(() => (nil?.a).b), probe(() => nil?.a.b))
    log(obj.method?.(), obj.missing?.(), probe(() => (obj.missing)?.()))
    log(obj?.['a']?.['b'], nil?.[(() => { throw new Error('not evaluated') })()])
    log((obj?.method)(), probe(() => (nil?.method)()), obj?.method())
    const deletable = { a: 1 }
    log(delete deletable?.a, 'a' in deletable, delete nil?.a)
    let count = 0
    nil?.[count++]
    obj?.[count++]
    log(count)
    const fn = null
    log(fn?.(count++), count)
    log(obj.a?.b?.c?.length)
    log(nil ?? 'default', 0 ?? 'zero kept', (nil || 0) ?? 'x', nil || (0 ?? 'y'))
    log((nil ?? 0) || 'z', nil ?? (0 || 'w'), (nil && 1) ?? 'v')
    let maybe = null
    maybe ??= 'set'
    maybe ||= 'not set'
    let truthy = 1
    truthy &&= 'and-set'
    log(maybe, truthy)
    log(obj?.a.b.c.toUpperCase?.())
    log(probe(() => new (nil?.constructor ?? Object)()))
    log(obj?.a?.b ? 1 : 2, nil?.a ? 1 : 2, obj?.a ? .5 : 1)
})()
