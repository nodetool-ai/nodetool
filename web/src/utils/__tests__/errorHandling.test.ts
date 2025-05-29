import { createErrorMessage, AppError } from '../errorHandling';

describe('createErrorMessage', () => {
  it('handles error objects with detail', () => {
    const err = { detail: 'bad things happened' };
    const result = createErrorMessage(err, 'Oops');
    expect(result).toBeInstanceOf(AppError);
    expect(result.message).toBe('Oops');
    expect((result as AppError).detail).toBe('bad things happened');
  });

  it('handles string errors', () => {
    const result = createErrorMessage('something broke', 'Failed');
    expect(result).toBeInstanceOf(AppError);
    expect(result.message).toBe('Failed');
    expect((result as AppError).detail).toBe('something broke');
  });

  it('handles Error instances', () => {
    const err = new Error('nope');
    const result = createErrorMessage(err, 'Failed');
    expect(result).toBeInstanceOf(AppError);
    expect(result.message).toBe('Failed');
    expect((result as AppError).detail).toBe('nope');
  });

  it('handles unknown error types', () => {
    const result = createErrorMessage(42 as any, 'Unknown');
    expect(result).toBeInstanceOf(AppError);
    expect(result.message).toBe('Unknown');
    expect(result.detail).toBeUndefined();
  });

  it('handles error objects with non-string detail', () => {
    const err = { detail: { nested: 'object' } };
    const result = createErrorMessage(err, 'Failed');
    expect(result).toBeInstanceOf(AppError);
    expect(result.message).toBe('Failed');
    expect((result as AppError).detail).toBe('[object Object]');
  });

  // Edge cases
  it('handles null error', () => {
    const result = createErrorMessage(null, 'Failed');
    expect(result).toBeInstanceOf(AppError);
    expect(result.message).toBe('Failed');
    expect((result as AppError).detail).toBeUndefined();
  });

  it('handles undefined error', () => {
    const result = createErrorMessage(undefined, 'Failed');
    expect(result).toBeInstanceOf(AppError);
    expect(result.message).toBe('Failed');
    expect((result as AppError).detail).toBeUndefined();
  });

  it('handles error with null detail', () => {
    const err = { detail: null };
    const result = createErrorMessage(err, 'Failed');
    expect(result).toBeInstanceOf(AppError);
    expect(result.message).toBe('Failed');
    expect((result as AppError).detail).toBeUndefined();
  });

  it('handles error with undefined detail', () => {
    const err = { detail: undefined };
    const result = createErrorMessage(err, 'Failed');
    expect(result).toBeInstanceOf(AppError);
    expect(result.message).toBe('Failed');
    expect((result as AppError).detail).toBeUndefined();
  });

  it('handles error with empty string detail', () => {
    const err = { detail: '' };
    const result = createErrorMessage(err, 'Failed');
    expect(result).toBeInstanceOf(AppError);
    expect(result.message).toBe('Failed');
    expect((result as AppError).detail).toBeUndefined();
  });

  it('handles error with numeric detail', () => {
    const err = { detail: 0 };
    const result = createErrorMessage(err, 'Failed');
    expect(result).toBeInstanceOf(AppError);
    expect(result.message).toBe('Failed');
    expect((result as AppError).detail).toBeUndefined();
  });

  it('handles error with boolean false detail', () => {
    const err = { detail: false };
    const result = createErrorMessage(err, 'Failed');
    expect(result).toBeInstanceOf(AppError);
    expect(result.message).toBe('Failed');
    expect((result as AppError).detail).toBeUndefined();
  });

  it('handles arrays as error input', () => {
    const result = createErrorMessage(['error1', 'error2'], 'Failed');
    expect(result).toBeInstanceOf(AppError);
    expect(result.message).toBe('Failed');
    expect((result as AppError).detail).toBeUndefined();
  });

  it('handles empty string error', () => {
    const result = createErrorMessage('', 'Failed');
    expect(result).toBeInstanceOf(AppError);
    expect(result.message).toBe('Failed');
    expect((result as AppError).detail).toBe('');
  });

  it('handles very long error messages', () => {
    const longMessage = 'x'.repeat(10000);
    const result = createErrorMessage(longMessage, 'Failed');
    expect(result).toBeInstanceOf(AppError);
    expect(result.message).toBe('Failed');
    expect((result as AppError).detail).toBe(longMessage);
  });
});

describe('AppError class', () => {
  it('creates instance with message and detail', () => {
    const error = new AppError('Test message', 'Test detail');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error.message).toBe('Test message');
    expect(error.detail).toBe('Test detail');
    expect(error.name).toBe('AppError');
  });

  it('creates instance with message only', () => {
    const error = new AppError('Test message');
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Test message');
    expect(error.detail).toBeUndefined();
    expect(error.name).toBe('AppError');
  });
});