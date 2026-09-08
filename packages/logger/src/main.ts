import { emit } from './core.js';

/* =========================
   LOGGER FACTORY
========================= */

export function createLogger(context = 'app') {
    return {
        debug(message: string | string[]) {
            emit('debug', message, context, false, true);
        },

        default(message: string | string[]) {
            emit('info', message, context, true);
        },

        error(message: string | string[]) {
            emit('error', message, context);
        },

        info(message: string | string[]) {
            emit('info', message, context);
        },

        success(message: string | string[]) {
            emit('success', message, context);
        },

        verbose(message: string | string[]) {
            emit('info', message, context, true, true);
        },

        warn(message: string | string[]) {
            emit('warn', message, context);
        },
    };
}

/* =========================
   PUBLIC API (default context: "app")
========================= */

export const log = createLogger('app');
