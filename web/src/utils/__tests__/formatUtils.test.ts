/**
 * @jest-environment node
 */
import { formatFileSize, formatDuration, SIZE_FILTERS, type SizeFilterKey } from '../formatUtils';

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

describe('formatDuration', () => {
  test('formats sub-second durations as ms', () => {
    expect(formatDuration(0)).toBe('0ms');
    expect(formatDuration(420)).toBe('420ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  test('formats seconds with one decimal', () => {
    expect(formatDuration(1000)).toBe('1s');
    expect(formatDuration(1240)).toBe('1.2s');
    expect(formatDuration(59500)).toBe('59.5s');
  });

  test('formats minutes with zero-padded seconds', () => {
    expect(formatDuration(60000)).toBe('1m 00s');
    expect(formatDuration(64000)).toBe('1m 04s');
    expect(formatDuration(125000)).toBe('2m 05s');
  });

  test('handles minute boundary rounding correctly', () => {
    expect(formatDuration(119999)).toBe('2m 00s');
    expect(formatDuration(59999)).toBe('1m 00s');
  });

  test('returns null for invalid input', () => {
    expect(formatDuration(-1)).toBeNull();
    expect(formatDuration(NaN)).toBeNull();
    expect(formatDuration(Infinity)).toBeNull();
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