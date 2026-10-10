import type { ContactFormData, FieldErrors, FieldName } from './form-types.js'

type Validator = (value: string) => string | null

export const validators: Record<FieldName, Validator> = {
    name: (value) => (value.trim().length >= 2 ? null : 'Please enter your name.'),
    email: (value) =>
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? null : 'Please enter a valid email address.',
    subject: (value) => (value !== '' ? null : 'Please choose a subject.'),
    message: (value) => (value.trim().length >= 10 ? null : 'Please write at least 10 characters.'),
}

export function validateAll(data: ContactFormData): FieldErrors {
    const errors: FieldErrors = {}
    for (const field of Object.keys(validators) as FieldName[]) {
        const message = validators[field](data[field])
        if (message !== null) {
            errors[field] = message
        }
    }
    return errors
}
