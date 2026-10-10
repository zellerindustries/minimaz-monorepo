import { config, type ContactFormData, type FieldName } from './form-types.js'
import { debounce, sanitize } from './form-utils.js'
import { validateAll } from './form-validators.js'

const loadedAt = Date.now()
const fieldNames: FieldName[] = ['name', 'email', 'subject', 'message']

function initForm(): void {
    const form = document.querySelector<HTMLFormElement>('#contact-form')
    const status = document.querySelector<HTMLElement>('#form-status')
    const submit = document.querySelector<HTMLButtonElement>('#submit-btn')
    if (form === null || status === null || submit === null) {
        return
    }

    const read = (): ContactFormData => ({
        name: sanitize(form.querySelector<HTMLInputElement>('#name')?.value ?? ''),
        email: sanitize(form.querySelector<HTMLInputElement>('#email')?.value ?? ''),
        subject: form.querySelector<HTMLSelectElement>('#subject')?.value ?? '',
        message: sanitize(form.querySelector<HTMLTextAreaElement>('#message')?.value ?? ''),
    })

    const showErrors = (errors: Partial<Record<FieldName, string>>): void => {
        for (const field of fieldNames) {
            const slot = form.querySelector<HTMLElement>(`#${field}-error`)
            if (slot !== null) {
                slot.textContent = errors[field] ?? ''
            }
        }
    }

    const setStatus = (kind: 'error' | 'success' | '', text: string): void => {
        status.className = kind === '' ? 'form-status' : `form-status ${kind}`
        status.textContent = text
    }

    const revalidate = debounce(() => {
        showErrors(validateAll(read()))
    }, 300)
    form.addEventListener('input', revalidate)

    form.addEventListener('submit', (event) => {
        event.preventDefault()

        const honeypot = form.querySelector<HTMLInputElement>('[name="website"]')
        if ((honeypot?.value ?? '') !== '' || Date.now() - loadedAt < config.minFillMs) {
            return
        }

        const last = Number(localStorage.getItem(config.storageKey) ?? '0')
        if (Date.now() - last < config.rateLimitMs) {
            setStatus('error', 'You already sent a message today. Please try again tomorrow.')
            return
        }

        const data = read()
        const errors = validateAll(data)
        showErrors(errors)
        if (Object.keys(errors).length > 0) {
            setStatus('error', 'Please fix the highlighted fields.')
            return
        }
        if (form.querySelector<HTMLInputElement>('#privacy')?.checked !== true) {
            setStatus('error', 'Please accept the privacy policy.')
            return
        }

        submit.disabled = true
        setStatus('', 'Sending…')
        void fetch(config.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        })
            .then((response) => {
                if (!response.ok) {
                    throw new Error(String(response.status))
                }
                localStorage.setItem(config.storageKey, String(Date.now()))
                form.reset()
                setStatus('success', 'Thanks! Your message has been sent.')
            })
            .catch(() => {
                setStatus('error', 'Something went wrong. Please try again later.')
            })
            .finally(() => {
                submit.disabled = false
            })
    })
}

initForm()
