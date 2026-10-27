// A small app-shaped program: an event emitter, a tokenizer-ish parser and a scheduler.
;(function () {
    'use strict'

    class Emitter {
        #handlers = new Map()
        on(event, handler) {
            const list = this.#handlers.get(event) ?? []
            list.push(handler)
            this.#handlers.set(event, list)
            return () => this.off(event, handler)
        }
        off(event, handler) {
            const list = this.#handlers.get(event)
            if (!list) return false
            const index = list.indexOf(handler)
            if (index === -1) return false
            list.splice(index, 1)
            return true
        }
        emit(event, ...args) {
            for (const handler of [...(this.#handlers.get(event) ?? [])]) handler.apply(this, args)
            return this
        }
    }

    function tokenize(input) {
        const tokens = []
        let position = 0
        const isDigit = (ch) => ch >= '0' && ch <= '9'
        while (position < input.length) {
            const ch = input[position]
            if (ch === ' ') {
                position++
                continue
            }
            if (isDigit(ch)) {
                let end = position
                while (end < input.length && isDigit(input[end])) end++
                tokens.push({ type: 'num', value: Number(input.slice(position, end)) })
                position = end
                continue
            }
            if ('+-*/()'.includes(ch)) {
                tokens.push({ type: 'op', value: ch })
                position++
                continue
            }
            throw new SyntaxError(`unexpected ${ch} at ${position}`)
        }
        return tokens
    }

    function evaluate(tokens) {
        let index = 0
        const peek = () => tokens[index]
        const next = () => tokens[index++]
        function primary() {
            const token = next()
            if (token?.type === 'num') return token.value
            if (token?.value === '(') {
                const value = sum()
                next()
                return value
            }
            if (token?.value === '-') return -primary()
            throw new SyntaxError('bad primary')
        }
        function product() {
            let value = primary()
            while (peek()?.value === '*' || peek()?.value === '/') {
                value = next().value === '*' ? value * primary() : value / primary()
            }
            return value
        }
        function sum() {
            let value = product()
            while (peek()?.value === '+' || peek()?.value === '-') {
                value = next().value === '+' ? value + product() : value - product()
            }
            return value
        }
        return sum()
    }

    const emitter = new Emitter()
    const results = []
    const off = emitter.on('expr', function (text) {
        try {
            results.push([text, evaluate(tokenize(text))])
        } catch (error) {
            results.push([text, error.name])
        }
    })
    for (const text of ['1 + 2 * 3', '(1 + 2) * 3', '10 / 4 - -2', '2 * (3 + 4) * 5', '1 + ', '7 $ 1']) {
        emitter.emit('expr', text)
    }
    log(results, off(), off())

    const queue = []
    const schedule = (label, delay) =>
        new Promise((resolve) => setTimeout(() => (queue.push(label), resolve(label)), delay))
    Promise.all([schedule('slow', 3), schedule('fast', 0), Promise.resolve('instant')]).then(
        (values) => log(values, queue),
    )
})()
