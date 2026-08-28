import type { LogType } from "./types.js";

/* =========================
   PRECOMPUTED PREFIXES
   (no runtime calls in hot path)
========================= */

export const prefix: Record<LogType, string> = {
    error: "\x1b[31m[ --- ERROR ----- ]\t\x1b[0m",
    warn: "\x1b[33m[ --- WARN ------ ]\t\x1b[0m",
    success: "\x1b[32m[ --- SUCCESS --- ]\t\x1b[0m",
    info: "\x1b[34m[ --- INFO ------ ]\t\x1b[0m",
    debug: "\x1b[90m[ --- DEBUG ----- ]\t\x1b[0m",
};

/* =========================
   TIME (cached strategy hook)
========================= */

export function formatTs(date: Date = new Date()): string {
    const pad = (n: number): string => (n < 10 ? `0${String(n)}` : String(n));

    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const h = pad(date.getHours());
    const min = pad(date.getMinutes());
    const s = pad(date.getSeconds());

    return `${String(y)}-${m}-${d} ${h}:${min}:${s}`;
}

/* =========================
   SMALL HELPERS
========================= */

export const isVerbose = (): boolean => process.env["VERBOSE"] === "true";

export function normalize(message: string | string[]): string[] {
    return Array.isArray(message) ? message : [message];
}

/* =========================
   CONTEXT TAG (cached-free, cheap)
========================= */

export function formatContext(context: string): string {
    return `\x1b[36m[${context}]\x1b[0m `;
}

/* =========================
   FAST PREFIXED OUTPUT
========================= */

export function print(type: LogType, message: string, context: string): void {
    const output = prefix[type] + formatContext(context) + message;

    if (type === "error") {
        console.error(output);
        return;
    }

    if (type === "warn") {
        console.warn(output);
        return;
    }

    console.log(output);
}

/* =========================
   OPTIONAL TIMESTAMP RENDER
========================= */

export function ts(): string {
    const verbose = isVerbose();
    if (!verbose) return "";
    return `[${formatTs()}] `;
}

/* =========================
   HOT PATH DISPATCHER
========================= */

export function emit(
    type: LogType,
    message: string | string[],
    context: string,
    noPrefix = false,
    forceVerboseOnly = false,
): void {
    const verbose = isVerbose();

    if (forceVerboseOnly && !verbose) return;

    const msgs: string[] = normalize(message);

    // fast loop (no extra callbacks)
    for (const message of msgs) {
        if (noPrefix) {
            console.log(
                verbose
                    ? `${ts()}[${context}] ${message}`
                    : `[${context}] ${message}`,
            );

            continue;
        }

        print(type, message, context);
    }
}
