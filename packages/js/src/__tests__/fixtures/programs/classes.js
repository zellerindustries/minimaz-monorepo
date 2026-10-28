// Private fields and methods, static blocks, accessors and the class's inner name binding.
;(function () {
    class Account {
        static #count = 0
        static registry = []
        #balance = 0
        owner
        static {
            this.registry.push('init')
            Account.#count = 100
        }
        constructor(owner, initial = 0) {
            this.owner = owner
            this.#balance = initial
            Account.#count++
        }
        get balance() {
            return this.#balance
        }
        set balance(value) {
            this.#balance = Math.max(0, value)
        }
        #log(action) {
            return `${this.owner}:${action}:${this.#balance}`
        }
        deposit(amount) {
            this.#balance += amount
            return this.#log('deposit')
        }
        static count() {
            return Account.#count
        }
        static isAccount(value) {
            return #balance in value
        }
        get #secret() {
            return 's3cret'
        }
        reveal() {
            return this.#secret
        }
    }
    const acct = new Account('ann', 5)
    log(acct.deposit(10), acct.balance, Account.count(), Account.registry)
    acct.balance = -5
    log(acct.balance, Account.isAccount(acct), Account.isAccount({}), acct.reveal())

    class Base {
        constructor() {
            this.kind = new.target === Base ? 'base' : 'derived'
        }
        greet() {
            return 'base'
        }
        static create() {
            return new this()
        }
    }
    class Derived extends Base {
        field = this.kind + '!'
        greet() {
            return `derived>${super.greet()}`
        }
    }
    const d = Derived.create()
    log(d.kind, d.field, d.greet(), d instanceof Base)

    const Expr = class Named {
        static self() {
            return Named
        }
    }
    log(Expr.self() === Expr)

    class Inner {
        static ref() {
            return Inner
        }
    }
    const Saved = Inner
    Inner = null
    log(Saved.ref() === Saved, Inner)

    const x = 'outer-x'
    class Fields {
        x = x;
        ['computed' + x.length] = 1
        static y = x.toUpperCase()
        static z
        w;
        ['v'] = 2
    }
    log(new Fields(), Fields.y, Fields.z)

    class Members {
        static() {
            return 'static-method'
        }
        get() {
            return 'get-method'
        }
        set() {
            return 'set-method'
        }
        async() {
            return 'async-method'
        }
        static static() {
            return 'static-static'
        }
        'constructor'() {
            this.made = true
        }
        ['constructor']() {
            return 'computed constructor is a method'
        }
    }
    const m = new Members()
    log(m.static(), m.get(), m.set(), m.async(), Members.static(), m.made, typeof m.constructor)
    log(Object.getOwnPropertyNames(Members.prototype))

    class Proto {
        static ['prototype2'] = 1
        static get [`name`]() {
            return 'computed static name'
        }
    }
    log(Proto.prototype2, Proto.name)
})()
