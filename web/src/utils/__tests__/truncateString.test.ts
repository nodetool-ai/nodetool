import { truncateString } from '../truncateString';

describe('truncateString', () => {
  it('should return the original string if it is shorter than maxLength', () => {
    const input = 'Hello World';
    const result = truncateString(input, 20);
    expect(result).toBe(input);
  });

  it('should truncate string and add ellipsis if longer than maxLength', () => {
    const input = 'This is a very long string that should be truncated';
    const maxLength = 20;
    const result = truncateString(input, maxLength);
    
    // Result should be 19 characters from original + "…" (for total of maxLength)
    expect(result.length).toBe(maxLength);
    expect(result).toBe('This is a very long…');
  });

  it('should use default maxLength of 50 if not provided', () => {
    const input = 'A'.repeat(60);
    const result = truncateString(input);
    
    expect(result.length).toBe(50); // Default maxLength
    expect(result).toBe('A'.repeat(49) + '…');
  });

  it('should handle empty string input', () => {
    const input = '';
    const result = truncateString(input);
    expect(result).toBe('');
  });
});