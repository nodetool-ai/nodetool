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
    expect((result as AppError).detail).toBeUndefined();
  });
});
