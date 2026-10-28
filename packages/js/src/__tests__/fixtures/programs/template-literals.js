// Template literal edge cases: expressions with braces, nested quotes and line breaks.
;(function () {
    const o = { a: { b: 'B' } }
    const f = (x) => ({ x })
    log(`${o.a.b}${f(1).x}${{}.constructor === Object}${`}`}`)
    log(`a${'}'}b${"${"}c${`\${`}d`)
    log(`${(() => { return '{}' })()}`)
    log(`multi
  line ${1 +
        2} end`)
    log(`A\x42\n\``)
    const fn = function () {
        return `${this?.v ?? 'none'}`
    }
    log(fn.call({ v: 'bound' }), fn.call(null))
    log(`${[1, 2].map((n) => `<${n}>`).join('')}`)
    log(`${o.a.b}`.length, `x`.length, `${1}${2}`, `${{ toString: () => 'custom' }}`)
    log(`\r\n`.length, `a\
b`, `\0`.length)
    const re = `${/}/.source}`
    log(re)
    log(`${(1, 2)}`, `${'a' in o}`, `${class {}}`.slice(0, 5), `${function () {}}`.slice(0, 8))
})()
