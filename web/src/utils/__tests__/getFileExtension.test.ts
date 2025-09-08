/**
 * @jest-environment node
 */
import { getFileExtension } from '../getFileExtension';

describe('getFileExtension', () => {
  test('returns extension for standard file', () => {
    expect(getFileExtension('image.png')).toBe('png');
    expect(getFileExtension('document.pdf')).toBe('pdf');
    expect(getFileExtension('script.js')).toBe('js');
    expect(getFileExtension('style.css')).toBe('css');
  });

  test('returns empty string for files without extension', () => {
    expect(getFileExtension('README')).toBe('');
    expect(getFileExtension('Makefile')).toBe('');
    expect(getFileExtension('LICENSE')).toBe('');
  });

  test('handles hidden files correctly', () => {
    // The function implementation considers files starting with dot at position 0 as hidden files
    // and returns empty string for them
    expect(getFileExtension('.gitignore')).toBe('');
    expect(getFileExtension('.env')).toBe('');
    expect(getFileExtension('.bashrc')).toBe('');
    // Files with a leading dot but also an extension get the extension
    expect(getFileExtension('file.env.local')).toBe('local');
    expect(getFileExtension('config.bashrc')).toBe('bashrc');
    // Just a dot should return empty
    expect(getFileExtension('.')).toBe('');
  });

  test('handles files with multiple dots', () => {
    expect(getFileExtension('file.test.spec.ts')).toBe('ts');
    expect(getFileExtension('archive.tar.gz')).toBe('gz');
    expect(getFileExtension('my.file.name.txt')).toBe('txt');
    expect(getFileExtension('jquery.min.js')).toBe('js');
  });

  test('handles edge cases', () => {
    expect(getFileExtension('')).toBe('');
    expect(getFileExtension('..')).toBe('');
    expect(getFileExtension('file.')).toBe('');
    expect(getFileExtension('...')).toBe('');
  });

  test('handles file paths', () => {
    expect(getFileExtension('/path/to/file.txt')).toBe('txt');
    expect(getFileExtension('C:\\Windows\\System32\\cmd.exe')).toBe('exe');
    expect(getFileExtension('./relative/path/file.js')).toBe('js');
    expect(getFileExtension('../parent/file.json')).toBe('json');
  });

  test('handles special characters in filename', () => {
    expect(getFileExtension('file-name.txt')).toBe('txt');
    expect(getFileExtension('file_name.pdf')).toBe('pdf');
    expect(getFileExtension('file name.doc')).toBe('doc');
    expect(getFileExtension('file@#$.png')).toBe('png');
    expect(getFileExtension('file(1).jpg')).toBe('jpg');
    expect(getFileExtension('file[2].mp4')).toBe('mp4');
  });

  test('handles various file extensions', () => {
    expect(getFileExtension('image.jpeg')).toBe('jpeg');
    expect(getFileExtension('video.mp4')).toBe('mp4');
    expect(getFileExtension('data.json')).toBe('json');
    expect(getFileExtension('config.yaml')).toBe('yaml');
    expect(getFileExtension('script.py')).toBe('py');
    expect(getFileExtension('main.cpp')).toBe('cpp');
  });
});
