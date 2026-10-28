// Method names, shorthand properties and computed keys must not be confused with bindings.
;(function () {
    const value = 'bound value'
    const fn = () => 'arrow'
    const obj = {
        value,
        fn,
        value2: value,
        method() {
            return value
        },
        [value]: 'computed from binding',
        'value'() {
            return 'overrides shorthand'
        },
    }
    log(obj.value(), obj.fn(), obj.value2, obj.method(), obj['bound value'])
    const { fn: renamedFn, method } = obj
    log(renamedFn(), method())
    const short = { fn, value }
    log(Object.keys(short), short.value)
    const nested = { inner: { value } }
    log(nested.inner.value)
    function returnsShorthand(param) {
        const local = param + '!'
        return { param, local }
    }
    log(returnsShorthand('p'))
    const withDefaults = ({ value = 'default', fn: f = () => 'df' } = {}) => [value, f()]
    log(withDefaults(), withDefaults({ value: 'given' }))
    const assigned = {}
    ;({ value: assigned.value, fn: assigned.fn } = obj)
    log(typeof assigned.value, typeof assigned.fn)
})()
