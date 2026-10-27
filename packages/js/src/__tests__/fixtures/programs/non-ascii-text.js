// Non-ASCII string and template text, printed as ASCII escapes, must keep its exact value.
;(function () {
    const words = ['café', 'naïve', '中文', '😀', '\u0085', ' ', '  ', '﻿']
    for (const word of words) {
        log(word, word.length, word.codePointAt(0))
    }
    const lone = ['\ud800', '\udfff', '\udc00\ud800', '\ud83d' + '\ude00']
    for (const value of lone) {
        log(value.length, value.charCodeAt(0), value === '😀')
    }
    const name = 'Zoë'
    log(`Hi ${name} — ü\é\
 x 😀`)
    const tag = (strings) => strings.raw.join('|')
    log(tag`é\é${1}😀`)
    log(String.raw`ü\ü`)
    log(/é+/.test('éé'), /😀/u.test('😀'), /é/.source)
    const map = { 'ä': 1, ö: 2, '😀': 3 }
    log(Object.keys(map).join(), map['ä'], map.ö)
})()
