// Annex B: a `var` initializer in a for-in head (sloppy scripts only); the minifier may fall back.
;(function () {
    var seen = []
    for (var w = 'initial' in {}) seen.push(w)
    log(w, seen)
    function inner() {
        for (var v = (log('init runs'), 'value') in { k: 1 }) seen.push(v)
        return v
    }
    log(inner())
})()
