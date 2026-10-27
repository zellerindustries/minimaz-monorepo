// new.target, super property access in objects and classes, and super in arrow functions.
;(function () {
    function Check() {
        return { called: new.target === undefined ? 'call' : 'new' }
    }
    log(Check().called, new Check().called)
    class Parent {
        constructor(x) {
            this.x = x
        }
        describe() {
            return `parent ${this.x}`
        }
        static make() {
            return 'parent static'
        }
    }
    class Child extends Parent {
        constructor(x) {
            const pre = x * 2
            super(pre)
            this.y = (() => super.describe())()
        }
        describe() {
            return `child of ${super.describe()}`
        }
        static make() {
            return `child > ${super.make()}`
        }
    }
    const c = new Child(2)
    log(c.describe(), c.y, Child.make())
    const base = { greet() { return 'base greet' } }
    const derived = {
        greet() {
            const arrow = () => super.greet()
            return `derived > ${arrow()}`
        },
    }
    Object.setPrototypeOf(derived, base)
    log(derived.greet())
    class Early extends Parent {
        constructor() {
            try {
                this.x = 1
            } catch (error) {
                log('before super:', error.constructor.name)
            }
            super('late')
        }
    }
    log(new Early().x)
    class SuperProp extends Parent {
        get described() {
            return super['describe']()
        }
    }
    log(new SuperProp('p').described)
})()
