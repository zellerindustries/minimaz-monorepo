// A module with top-level await and export default.
const delay = (value) => new Promise((resolve) => setTimeout(() => resolve(value), 0))
const first = await delay('first')
log(first)
const [a, b] = await Promise.all([delay(1), delay(2)])
log(a + b)
export default function () {
    return first
}
let local = 'local'
{
    let local = 'block'
    log(local)
}
log(local)
for await (const item of [delay('x'), 'y']) log(item)
const viaAwait = (await delay(3)) ** 2
log(viaAwait, (await delay({ p: 'prop' })).p)
export let later
later = 'assigned after export'
log(later)
