// Unicode and escaped identifiers.
;(function () {
    const café = 'coffee'
    const 日本 = 'japan'
    const abc = 'escaped abc'
    const \u{62}cd = 'escaped bcd'
    const ℮ = 'estimated'
    log(café, 日本, abc, bcd, ℮)
    const obj = { café, 日本, def: 'def', ['ghi']: 'ghi' }
    log(obj.café, obj['日本'], obj.def, obj.ghi, obj.def)
    const $ = 'dollar', _ = 'underscore', $_ = 'both'
    log($, _, $_)
    const ǅ = 'title case letter', ゛ = 'katakana mark'
    log(ǅ, ゛)
    const { abc: renamedEscape } = { abc: 'destructured escape' }
    log(renamedEscape)
})()
