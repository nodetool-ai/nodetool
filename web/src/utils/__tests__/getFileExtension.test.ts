import { getFileExtension } from '../getFileExtension';

describe('getFileExtension', () => {
  test('returns extension for standard file', () => {
    expect(getFileExtension('image.png')).toBe('png');
  });

  test('returns empty string for files without extension', () => {
    expect(getFileExtension('README')).toBe('');
  });

  test('returns empty string for hidden files', () => {
    expect(getFileExtension('.gitignore')).toBe('');
  });
});
