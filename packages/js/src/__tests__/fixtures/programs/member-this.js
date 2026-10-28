// Parentheses that change `this` or the callee: (0, obj.m)(), sequences, new.
;(function () {
    'use strict'
    const obj = {
        name: 'obj',
        who() {
            return this === undefined ? 'undefined' : this.name
        },
    }
    log(obj.who(), (obj.who)(), (0, obj.who)(), (obj.who, obj.who)(), (obj?.who)())
    const fn = obj.who
    log(fn === obj.who ? 'same' : 'different')
    function Factory() {
        return function Inner() {
            this.made = 'inner'
        }
    }
    function Plain() {
        this.made = 'plain'
    }
    Plain.make = function () {
        return function Made() {
            this.made = 'made'
        }
    }
    log(new (Factory())().made, typeof new Factory())
    log(new Plain().made, new (Plain.make())().made, typeof new Plain.make())
    const ns = { Ctor: Plain }
    log(new ns.Ctor().made, new (ns.Ctor)().made, new ns.Ctor, new ns['Ctor']().made)
    const getNs = () => ns
    log(new (getNs().Ctor)().made, new (getNs()).Ctor().made)
    log((1, 2, 3), [(1, 2)], obj[(0, 'name')])
    const arr = [obj.who]
    log(arr[0](), (0, arr[0])())
    const tagged = (strings) => this
    log(typeof tagged``)
})()
