import { emit } from './core.js';

/**
 * Creates a logger bound to a fixed context label. Each method maps to a
 * `LogType` (or a variant of one) and forwards to {@link emit}.
 *
 * @param {string} [context='app'] - The context label tagged onto every line this logger emits
 * @returns {{
 *   debug: (message: string | string[]) => void,
 *   default: (message: string | string[]) => void,
 *   error: (message: string | string[]) => void,
 *   info: (message: string | string[]) => void,
 *   success: (message: string | string[]) => void,
 *   verbose: (message: string | string[]) => void,
 *   warn: (message: string | string[]) => void,
 * }} A logger with one method per log level/variant
 */
export function createLogger(context = 'app') {
    return {
        // forceVerboseOnly: debug output is noise outside VERBOSE mode
        debug(message: string | string[]) {
            emit('debug', message, context, false, true);
        },

        // noPrefix: unstyled baseline output, always shown regardless of VERBOSE
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

        // noPrefix + forceVerboseOnly: unstyled output shown only in VERBOSE mode
        verbose(message: string | string[]) {
            emit('info', message, context, true, true);
        },

        warn(message: string | string[]) {
            emit('warn', message, context);
        },
    };
}

/** Default-context (`"app"`) logger instance, ready to use without setup. */
export const log = createLogger('app');
