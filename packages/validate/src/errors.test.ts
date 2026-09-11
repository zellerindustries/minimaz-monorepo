import { describe, expect, it } from 'vitest';
import { KnownError } from '@minimaz/errors';
import { ValidationError } from './errors.js';

describe('ValidationError', () => {
    it('is a KnownError', () => {
        const error = new ValidationError('TestError', 'message', ['detail']);

        expect(error).toBeInstanceOf(KnownError);
        expect(error.errors).toEqual(['detail']);
    });
});
