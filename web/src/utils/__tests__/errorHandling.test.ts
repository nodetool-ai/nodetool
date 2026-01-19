/**
 * @jest-environment node
 */
import { AppError, createErrorMessage } from '../errorHandling';

describe('errorHandling', () => {
  describe('AppError', () => {
    it('creates error with message only', () => {
      const error = new AppError('Something went wrong');
      expect(error.message).toBe('Something went wrong');
      expect(error.name).toBe('AppError');
      expect(error.detail).toBeUndefined();
    });

    it('creates error with message and detail', () => {
      const error = new AppError('Something went wrong', 'Detailed explanation');
      expect(error.message).toBe('Something went wrong');
      expect(error.detail).toBe('Detailed explanation');
      expect(error.name).toBe('AppError');
    });

    it('is instance of Error', () => {
      const error = new AppError('Test error');
      expect(error instanceof Error).toBe(true);
    });

    it('has correct stack trace', () => {
      const error = new AppError('Test error');
      expect(error.stack).toContain('Test error');
    });
  });

  describe('createErrorMessage', () => {
    it('creates AppError from object with detail property', () => {
      const error = { detail: 'Detailed error message' };
      const result = createErrorMessage(error, 'Default message');

      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe('Default message');
      expect((result as AppError).detail).toBe('Detailed error message');
    });

    it('creates AppError from string error', () => {
      const error = 'String error message';
      const result = createErrorMessage(error, 'Default message');

      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe('Default message');
      expect((result as AppError).detail).toBe('String error message');
    });

    it('creates AppError from Error instance', () => {
      const originalError = new Error('Original error');
      const result = createErrorMessage(originalError, 'Default message');

      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe('Default message');
      expect((result as AppError).detail).toBe('Original error');
    });

    it('creates AppError with no detail when error is null', () => {
      const error = null;
      const result = createErrorMessage(error as unknown as Error, 'Default message');

      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe('Default message');
      expect((result as AppError).detail).toBeUndefined();
    });

    it('creates AppError with no detail for number', () => {
      const error = 42;
      const result = createErrorMessage(error as unknown as Error, 'Default message');

      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe('Default message');
      expect((result as AppError).detail).toBeUndefined();
    });

    it('creates AppError with no detail for boolean', () => {
      const error = true;
      const result = createErrorMessage(error as unknown as Error, 'Default message');

      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe('Default message');
      expect((result as AppError).detail).toBeUndefined();
    });

    it('handles object without detail property', () => {
      const error = { code: 'ERROR_CODE' };
      const result = createErrorMessage(error as unknown as Error, 'Default message');

      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe('Default message');
      expect((result as AppError).detail).toBeUndefined();
    });

    it('handles object with null detail', () => {
      const error = { detail: null };
      const result = createErrorMessage(error as unknown as Error, 'Default message');

      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe('Default message');
      // null is falsy, so it doesn't set detail
      expect((result as AppError).detail).toBeUndefined();
    });

    it('handles object with undefined detail', () => {
      const error = { detail: undefined };
      const result = createErrorMessage(error as unknown as Error, 'Default message');

      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe('Default message');
      // undefined is falsy, so it doesn't set detail
      expect((result as AppError).detail).toBeUndefined();
    });

    it('converts detail to string for truthy values', () => {
      const error = { detail: 12345 };
      const result = createErrorMessage(error as unknown as Error, 'Default message');

      expect((result as AppError).detail).toBe('12345');
    });
  });
});
