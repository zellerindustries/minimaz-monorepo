// Class heritage expressions, accessors with computed keys and static inheritance.
;(function () {
    class A {
        static who() {
            return 'A'
        }
        get kind() {
            return 'a'
        }
    }
    class B {
        static who() {
            return 'B'
        }
    }
    const pick = (flag) => class extends (flag ? A : B) {}
    log(pick(true).who(), pick(false).who())
    const Seq = class extends (0, A) {}
    log(Seq.who(), new Seq().kind)
    const key = 'dyn'
    class C extends A {
        static get [key]() {
            return 'static getter'
        }
        get [key + 2]() {
            return `${super.kind}-getter`
        }
        static [Symbol.hasInstance](x) {
            return x === 1
        }
    }
    log(C.dyn, new C().dyn2, 1 instanceof C, C.who())
    function mixin(Base) {
        return class extends Base {
            mixed() {
                return 'mixed'
            }
        }
    }
    log(new (mixin(A))().mixed())
    class Null extends null {}
    log(Object.getPrototypeOf(Null.prototype))
    const factory = () => A
    class FromCall extends factory() {}
    log(FromCall.who())
    const ns = { A }
    class FromMember extends ns.A {}
    log(FromMember.who())
    class FromNew extends new Function('return class { static who() { return "fn" } }')() {}
    log(FromNew.who())
    class Shadow {
        static Shadow = 'static field named like the class'
        static check() {
            return Shadow.Shadow
        }
    }
    log(Shadow.check())
    let Outer = class Outer {
        static name2 = Outer.name
    }
    log(Outer.name2 === Outer.name)
})()
