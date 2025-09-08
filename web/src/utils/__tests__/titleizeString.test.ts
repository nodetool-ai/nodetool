import { titleizeString } from '../titleizeString';

describe('titleizeString', () => {
  it('converts underscores and spaces to title case words', () => {
    expect(titleizeString('hello_world test')).toBe('Hello World Test');
  });

  it('handles uppercase input gracefully', () => {
    expect(titleizeString('HELLO')).toBe('Hello');
  });

  it('ignores repeated separators', () => {
    expect(titleizeString('foo__bar  baz')).toBe('Foo Bar Baz');
  });
});
