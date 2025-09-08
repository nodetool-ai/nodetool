/**
 * @jest-environment node
 */
import { titleizeString } from '../titleizeString';

describe('titleizeString', () => {
  it('should capitalize first letter of each word', () => {
    expect(titleizeString('hello world')).toBe('Hello World');
    expect(titleizeString('the quick brown fox')).toBe('The Quick Brown Fox');
  });

  it('should handle snake_case strings', () => {
    expect(titleizeString('hello_world')).toBe('Hello World');
    expect(titleizeString('user_profile_settings')).toBe('User Profile Settings');
    expect(titleizeString('api_key_validation')).toBe('Api Key Validation');
  });

  it('should handle mixed separators', () => {
    expect(titleizeString('hello_world test')).toBe('Hello World Test');
    expect(titleizeString('some_variable name here')).toBe('Some Variable Name Here');
  });

  it('should handle uppercase input by converting to lowercase first', () => {
    expect(titleizeString('HELLO')).toBe('Hello');
    expect(titleizeString('HELLO_WORLD')).toBe('Hello World');
    expect(titleizeString('API_KEY')).toBe('Api Key');
  });

  it('should handle multiple consecutive separators', () => {
    expect(titleizeString('foo__bar')).toBe('Foo Bar');
    expect(titleizeString('hello   world')).toBe('Hello World');
    expect(titleizeString('test___case')).toBe('Test Case');
    expect(titleizeString('multiple  spaces  here')).toBe('Multiple Spaces Here');
  });

  it('should handle single words', () => {
    expect(titleizeString('hello')).toBe('Hello');
    expect(titleizeString('WORLD')).toBe('World');
    expect(titleizeString('Test')).toBe('Test');
  });

  it('should handle empty string', () => {
    expect(titleizeString('')).toBe('');
  });

  it('should handle strings with numbers', () => {
    expect(titleizeString('test_123')).toBe('Test 123');
    expect(titleizeString('item_1_name')).toBe('Item 1 Name');
    expect(titleizeString('2_factor_auth')).toBe('2 Factor Auth');
  });

  it('should handle strings with special characters', () => {
    expect(titleizeString('user@email')).toBe('User@email');
    expect(titleizeString('price_$100')).toBe('Price $100');
  });

  it('should handle mixed case input', () => {
    expect(titleizeString('camelCase')).toBe('Camelcase');
    expect(titleizeString('PascalCase')).toBe('Pascalcase');
    expect(titleizeString('mixedCASE_string')).toBe('Mixedcase String');
  });

  it('should handle strings with only separators', () => {
    // These produce a trailing space which is consistent with the function behavior
    expect(titleizeString('___')).toBe(' ');
    expect(titleizeString('   ')).toBe(' ');
    expect(titleizeString('_ _')).toBe(' ');
  });

  it('should handle strings starting or ending with separators', () => {
    // These produce trailing spaces consistent with function behavior
    expect(titleizeString('_hello_world_')).toBe(' Hello World ');
    expect(titleizeString(' space padded ')).toBe(' Space Padded ');
    expect(titleizeString('__leading')).toBe(' Leading');
    expect(titleizeString('trailing__')).toBe('Trailing ');
  });

  it('should handle single letter words', () => {
    expect(titleizeString('a_b_c')).toBe('A B C');
    expect(titleizeString('i am here')).toBe('I Am Here');
  });

  it('should handle acronyms (though they become title case)', () => {
    expect(titleizeString('HTML_CSS_JS')).toBe('Html Css Js');
    expect(titleizeString('api_URL')).toBe('Api Url');
  });
});
