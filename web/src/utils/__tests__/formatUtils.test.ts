/**
 * @jest-environment node
 */
import { formatFileSize, getSizeCategory, SIZE_FILTERS, type SizeFilterKey } from '../formatUtils';

describe('formatFileSize', () => {
  test('formats bytes correctly', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(500)).toBe('500 B');
    expect(formatFileSize(1023)).toBe('1023 B');
  });

  test('formats kilobytes correctly', () => {
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(2048)).toBe('2 KB');
    expect(formatFileSize(1024 * 100)).toBe('100 KB');
    expect(formatFileSize(1024 * 999)).toBe('999 KB');
  });

  test('formats megabytes correctly', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1 MB');
    expect(formatFileSize(1024 * 1024 * 1.5)).toBe('1.5 MB');
    expect(formatFileSize(1024 * 1024 * 10)).toBe('10 MB');
    expect(formatFileSize(1024 * 1024 * 100)).toBe('100 MB');
    expect(formatFileSize(1024 * 1024 * 999.9)).toBe('999.9 MB');
  });

  test('formats gigabytes correctly', () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
    expect(formatFileSize(1024 * 1024 * 1024 * 2.5)).toBe('2.5 GB');
    expect(formatFileSize(1024 * 1024 * 1024 * 10)).toBe('10 GB');
    expect(formatFileSize(1024 * 1024 * 1024 * 100)).toBe('100 GB');
  });

  test('formats terabytes correctly', () => {
    expect(formatFileSize(1024 * 1024 * 1024 * 1024)).toBe('1 TB');
    expect(formatFileSize(1024 * 1024 * 1024 * 1024 * 1.5)).toBe('1.5 TB');
    expect(formatFileSize(1024 * 1024 * 1024 * 1024 * 10)).toBe('10 TB');
  });

  test('formats petabytes correctly', () => {
    expect(formatFileSize(1024 * 1024 * 1024 * 1024 * 1024)).toBe('1 PB');
    expect(formatFileSize(1024 * 1024 * 1024 * 1024 * 1024 * 2)).toBe('2 PB');
  });

  test('respects decimal parameter', () => {
    const size = 1536; // 1.5 KB
    expect(formatFileSize(size, 0)).toBe('2 KB'); // Rounded up
    expect(formatFileSize(size, 1)).toBe('1.5 KB');
    expect(formatFileSize(size, 2)).toBe('1.5 KB');
    expect(formatFileSize(size, 3)).toBe('1.5 KB');
    
    const size2 = 1024 * 1024 * 1.234; // 1.234 MB
    expect(formatFileSize(size2, 0)).toBe('1 MB');
    expect(formatFileSize(size2, 1)).toBe('1.2 MB');
    expect(formatFileSize(size2, 2)).toBe('1.23 MB');
    expect(formatFileSize(size2, 3)).toBe('1.234 MB');
  });

  test('handles negative decimals by using 0', () => {
    expect(formatFileSize(1536, -1)).toBe('2 KB');
    expect(formatFileSize(1536, -10)).toBe('2 KB');
  });

  test('handles edge cases', () => {
    expect(formatFileSize(1)).toBe('1 B');
    expect(formatFileSize(1023)).toBe('1023 B');
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(1025)).toBe('1 KB');
  });
});

describe('getSizeCategory', () => {
  test('categorizes empty files', () => {
    expect(getSizeCategory(0)).toBe('empty');
  });

  test('categorizes small files (< 1MB)', () => {
    expect(getSizeCategory(1)).toBe('small');
    expect(getSizeCategory(1024)).toBe('small'); // 1 KB
    expect(getSizeCategory(1024 * 100)).toBe('small'); // 100 KB
    expect(getSizeCategory(1024 * 1024 - 1)).toBe('small'); // Just under 1 MB
  });

  test('categorizes medium files (1-10MB)', () => {
    expect(getSizeCategory(1024 * 1024)).toBe('medium'); // 1 MB
    expect(getSizeCategory(1024 * 1024 * 5)).toBe('medium'); // 5 MB
    expect(getSizeCategory(1024 * 1024 * 10 - 1)).toBe('medium'); // Just under 10 MB
  });

  test('categorizes large files (10-100MB)', () => {
    expect(getSizeCategory(1024 * 1024 * 10)).toBe('large'); // 10 MB
    expect(getSizeCategory(1024 * 1024 * 50)).toBe('large'); // 50 MB
    expect(getSizeCategory(1024 * 1024 * 100 - 1)).toBe('large'); // Just under 100 MB
  });

  test('categorizes extra large files (> 100MB)', () => {
    expect(getSizeCategory(1024 * 1024 * 100)).toBe('xlarge'); // 100 MB
    expect(getSizeCategory(1024 * 1024 * 500)).toBe('xlarge'); // 500 MB
    expect(getSizeCategory(1024 * 1024 * 1024)).toBe('xlarge'); // 1 GB
    expect(getSizeCategory(1024 * 1024 * 1024 * 10)).toBe('xlarge'); // 10 GB
  });
});

describe('SIZE_FILTERS', () => {
  test('has correct number of filters', () => {
    expect(SIZE_FILTERS).toHaveLength(6);
  });

  test('has all required filter keys', () => {
    const keys = SIZE_FILTERS.map(f => f.key);
    expect(keys).toContain('all');
    expect(keys).toContain('empty');
    expect(keys).toContain('small');
    expect(keys).toContain('medium');
    expect(keys).toContain('large');
    expect(keys).toContain('xlarge');
  });

  test('has correct filter ranges', () => {
    const allFilter = SIZE_FILTERS.find(f => f.key === 'all');
    expect(allFilter?.min).toBe(0);
    expect(allFilter?.max).toBe(Infinity);

    const emptyFilter = SIZE_FILTERS.find(f => f.key === 'empty');
    expect(emptyFilter?.min).toBe(0);
    expect(emptyFilter?.max).toBe(0);

    const smallFilter = SIZE_FILTERS.find(f => f.key === 'small');
    expect(smallFilter?.min).toBe(1);
    expect(smallFilter?.max).toBe(1024 * 1024 - 1);

    const mediumFilter = SIZE_FILTERS.find(f => f.key === 'medium');
    expect(mediumFilter?.min).toBe(1024 * 1024);
    expect(mediumFilter?.max).toBe(10 * 1024 * 1024 - 1);

    const largeFilter = SIZE_FILTERS.find(f => f.key === 'large');
    expect(largeFilter?.min).toBe(10 * 1024 * 1024);
    expect(largeFilter?.max).toBe(100 * 1024 * 1024 - 1);

    const xlargeFilter = SIZE_FILTERS.find(f => f.key === 'xlarge');
    expect(xlargeFilter?.min).toBe(100 * 1024 * 1024);
    expect(xlargeFilter?.max).toBe(Infinity);
  });

  test('has correct labels', () => {
    const labels = SIZE_FILTERS.map(f => f.label);
    expect(labels).toContain('All');
    expect(labels).toContain('Empty');
    expect(labels).toContain('< 1 MB');
    expect(labels).toContain('1-10 MB');
    expect(labels).toContain('10-100 MB');
    expect(labels).toContain('> 100 MB');
  });

  test('type SizeFilterKey works correctly', () => {
    const testKey: SizeFilterKey = 'all';
    expect(testKey).toBe('all');
    
    const validKeys: SizeFilterKey[] = ['all', 'empty', 'small', 'medium', 'large', 'xlarge'];
    expect(validKeys).toHaveLength(6);
  });
});