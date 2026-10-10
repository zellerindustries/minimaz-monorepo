export const config = {
    // Replace with your own form backend before going live.
    endpoint: 'https://example.com/api/contact',
    minFillMs: 3000,
    rateLimitMs: 24 * 60 * 60 * 1000,
    storageKey: 'contactFormLastSubmit',
} as const

export interface ContactFormData {
    name: string
    email: string
    subject: string
    message: string
}

export type FieldName = keyof ContactFormData
export type FieldErrors = Partial<Record<FieldName, string>>
