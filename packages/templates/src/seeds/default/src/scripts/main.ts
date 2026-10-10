const toggle = document.querySelector<HTMLButtonElement>('.nav-toggle')
const nav = document.querySelector<HTMLElement>('#site-nav')

if (toggle !== null && nav !== null) {
    toggle.hidden = false
    nav.hidden = true

    toggle.addEventListener('click', () => {
        const isOpen = toggle.getAttribute('aria-expanded') === 'true'
        toggle.setAttribute('aria-expanded', String(!isOpen))
        nav.hidden = isOpen
    })
}
