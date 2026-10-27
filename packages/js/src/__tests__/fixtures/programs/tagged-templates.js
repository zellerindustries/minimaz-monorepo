// Tagged templates: raw strings, cooked undefined, call-site caching and `this`.
;(function () {
    function tag(strings, ...values) {
        return JSON.stringify({ cooked: strings, raw: strings.raw, values })
    }
    const name = 'world'
    log(tag`hello ${name}!\n${1 + 1}`)
    log(tag`\unicode bad escape ${name}`)
    log(String.raw`a\tb${name}A`)
    const sites = []
    function capture(strings) {
        sites.push(strings)
        return strings
    }
    for (let i = 0; i < 2; i++) capture`same site`
    capture`same site`
    log(sites[0] === sites[1], sites[0] === sites[2])
    const obj = {
        prefix: '>',
        tag(strings, value) {
            return this.prefix + strings[0] + value
        },
    }
    log(obj.tag`x${1}`, obj['tag']`y${2}`)
    log(`nested ${`inner ${`deep ${name}`}`}`)
    log(`${name}${name}`, `$${name}`, `\${name}`, `$\{name}`)
    const fnTag = () => tag
    log(fnTag()`call result tag ${2}`)
    log(`line1
line2	tab`)
    const newTag = function () {
        return function Made() {
            this.v = 'made by new tag'
        }
    }
    log(new (newTag`x`)().v)
})()
