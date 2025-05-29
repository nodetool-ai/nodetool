// Mock ThemeNodetool to avoid heavy imports
jest.mock('../../components/themes/ThemeNodetool', () => ({
  __esModule: true,
  default: { palette: { c_hl1: '#ff0000' } }
}));

import { highlightText, escapeHtml, hexToRgb, formatBulletList } from '../highlightText';
import { NodeMetadata } from '../../stores/ApiTypes';

describe('highlightText utilities', () => {
  it('escapeHtml converts special characters', () => {
    expect(escapeHtml('<div>&</div>')).toBe('&lt;div&gt;&amp;&lt;/div&gt;');
  });

  it('hexToRgb converts hex colors', () => {
    expect(hexToRgb('#ffffff')).toBe('255, 255, 255');
    expect(hexToRgb('invalid')).toBeNull();
  });

  it('formatBulletList converts lines to list', () => {
    const result = formatBulletList('a\nb');
    expect(result).toBe('<ul><li>a</li>\n<li>b</li></ul>');
  });

  it('returns plain text when no search info', () => {
    const result = highlightText('hello', 'title', null, undefined);
    expect(result.html).toBe('hello');
    expect(result.highlightedWords).toEqual([]);
  });

  it('highlights matched text', () => {
    const searchInfo: NodeMetadata['searchInfo'] = {
      matches: [
        { key: 'title', value: 'hello world', indices: [[0, 4]] }
      ]
    };
    const result = highlightText('hello world', 'title', 'hello', searchInfo);
    expect(result.highlightedWords).toEqual(['hello']);
    expect(result.html).toContain('<span class="highlight"');
    expect(result.html).toContain('hello');
  });
});
