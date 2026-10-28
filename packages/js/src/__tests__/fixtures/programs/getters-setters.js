// Accessors via defineProperty, class static accessors and setters with destructured params.
;(function () {
    const calls = []
    const target = {}
    let hidden = 0
    Object.defineProperty(target, 'v', {
        get() {
            calls.push('get')
            return hidden
        },
        set({ amount = 1 }) {
            calls.push('set')
            hidden += amount
        },
    })
    target.v = {}
    target.v = { amount: 5 }
    log(target.v, calls)
    class Temp {
        static #c = 0
        static get celsius() {
            return Temp.#c
        }
        static set celsius(v) {
            Temp.#c = v
        }
        static get fahrenheit() {
            return (Temp.celsius * 9) / 5 + 32
        }
    }
    Temp.celsius = 100
    log(Temp.fahrenheit)
    const counter = {
        _n: 0,
        get next() {
            return ++this._n
        },
    }
    log(counter.next, counter.next, counter._n)
    const chained = { set x(v) { this._x = v } }
    const result = (chained.x = 'assignment value')
    log(result, chained._x)
    const objSetter = {
        set [`dyn${1}`](value) {
            this.stored = value
        },
        get 'quoted getter'() {
            return 'qg'
        },
        get 42() {
            return 'numeric getter'
        },
    }
    objSetter.dyn1 = 'dynamic'
    log(objSetter.stored, objSetter['quoted getter'], objSetter[42])
})()
