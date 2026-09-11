import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { log } from '@minimaz/logger';
import { KnownError, handleCliError } from './core.js';

describe('handleCliError', () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;
    let originalExitCode: number | null | undefined;

    beforeEach(() => {
        errorSpy = vi.spyOn(log, 'error').mockImplementation(() => undefined);
        originalExitCode = process.exitCode as number | null | undefined;
        process.exitCode = undefined;
    });

    afterEach(() => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        errorSpy.mockRestore();
        process.exitCode = originalExitCode;
    });

    it('logs only the message for a KnownError', () => {
        handleCliError(new KnownError('missing config file'));

        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy).toHaveBeenCalledWith('missing config file');
        expect(process.exitCode).toBe(1);
    });

    it('logs each detail line for a KnownError carrying an errors array', () => {
        class WithDetails extends KnownError {
            errors = ['bad field a', 'bad field b'];
        }

        handleCliError(new WithDetails('validation failed'));

        expect(errorSpy).toHaveBeenNthCalledWith(1, 'validation failed');
        expect(errorSpy).toHaveBeenNthCalledWith(2, '\t-> bad field a');
        expect(errorSpy).toHaveBeenNthCalledWith(3, '\t-> bad field b');
        expect(process.exitCode).toBe(1);
    });

    it('logs the stack trace and a bug-report hint for a plain Error', () => {
        const error = new Error('boom');

        handleCliError(error);

        expect(errorSpy).toHaveBeenCalledWith([
            error.stack,
            'This looks like a bug — please report it.',
        ]);
        expect(process.exitCode).toBe(1);
    });

    it('logs the stringified value and a bug-report hint for a non-Error throw', () => {
        handleCliError('boom');

        expect(errorSpy).toHaveBeenCalledWith([
            'boom',
            'This looks like a bug — please report it.',
        ]);
        expect(process.exitCode).toBe(1);
    });
});
