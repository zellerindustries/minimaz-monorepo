export function sanitize(value: string): string {
    return value.replace(/[<>]/g, '').trim()
}

export function debounce<Args extends unknown[]>(
    fn: (...args: Args) => void,
    waitMs: number,
): (...args: Args) => void {
    let timer: ReturnType<typeof setTimeout> | undefined
    return (...args) => {
        clearTimeout(timer)
        timer = setTimeout(() => {
            fn(...args)
        }, waitMs)
    }
}
