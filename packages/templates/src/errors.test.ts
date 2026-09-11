import { describe, expect, it } from 'vitest';
import { KnownError } from '@minimaz/errors';
import { InvalidTemplateNameError, TemplateNotFoundError } from './errors.js';

describe('template errors', () => {
    it('TemplateNotFoundError is a KnownError', () => {
        expect(new TemplateNotFoundError('foo')).toBeInstanceOf(KnownError);
    });

    it('InvalidTemplateNameError is a KnownError', () => {
        expect(new InvalidTemplateNameError('..')).toBeInstanceOf(KnownError);
    });
});
