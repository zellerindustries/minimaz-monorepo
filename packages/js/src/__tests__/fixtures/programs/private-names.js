// Private names are per class: same names in nested and sibling classes, brand checks.
;(function () {
    class Outer {
        #value = 'outer'
        static #make() {
            return 'outer static private'
        }
        static read(o) {
            return o.#value
        }
        nested() {
            const self = this
            class Inner {
                #value = 'inner'
                both(innerObj) {
                    // `#value` here is Inner's own: the inner declaration shadows Outer's.
                    return [Outer.read(self), innerObj.#value, Outer.#make()]
                }
            }
            return new Inner().both(new Inner())
        }
    }
    class Sibling {
        #value = 'sibling'
        static has(o) {
            return #value in o
        }
    }
    const o = new Outer()
    log(Outer.read(o), o.nested(), Sibling.has(o), Sibling.has(new Sibling()))
    try {
        Outer.read(new Sibling())
    } catch (error) {
        log(error.constructor.name)
    }
    class Counter {
        #count = 0
        #inc() {
            return ++this.#count
        }
        get #double() {
            return this.#count * 2
        }
        set #direct(v) {
            this.#count = v
        }
        run() {
            this.#inc()
            this.#inc()
            this.#direct = this.#double + 1
            this.#count++
            this.#count **= 2
            this.#count ??= 0
            return [this.#count, this?.#count]
        }
    }
    log(new Counter().run())
    class Destructure {
        #a = 1
        get() {
            const { length } = 'abc'
            ;[this.x] = [this.#a + length]
            return this.x
        }
    }
    log(new Destructure().get())
})()
