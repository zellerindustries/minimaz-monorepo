// Property keys that must stay quoted, computed or numeric.
;(function () {
    const obj = {
        'a b': 1,
        'class': 2,
        'if': 3,
        '1e3': 4,
        1e3: 5,
        '-1': 6,
        'NaN': 7,
        '': 8,
        '0x10': 9,
        '00': 10,
        '1.0': 11,
        '1.5': 12,
        1.5: 13,
        '2': 14,
        '4294967295': 15,
        '9007199254740993': 16,
        'é': 17,
        'a': 18,
        '-0': 19,
        0.0000001: 20,
        1e21: 21,
    }
    log(Object.entries(obj))
    log(obj['a b'], obj.class, obj['if'], obj[1000], obj['1e3'], obj[-1], obj.NaN, obj[''], obj.a)
    log(obj['1'], obj[1.5], obj['é'], obj.é, obj['00'], obj[0], obj['-0'], obj[1e-7], obj['1e+21'])
    class K {
        'quoted method'() {
            return 'qm'
        }
        static 'static quoted' = 'sq'
        42() {
            return 'numeric method'
        }
        'class'() {
            return 'keyword method'
        }
        static 'prototype2' = 'p2'
    }
    log(new K()['quoted method'](), K['static quoted'], new K()[42](), new K().class(), K.prototype2)
    const access = { x: { 'y-z': 1, w: 2, 3: 4, '05': 'zero five' } }
    log(access['x']['y-z'], access['x']['w'], access.x['3'], access.x[3], access['x']['05'])
})()
