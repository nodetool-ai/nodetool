/**
 * @jest-environment node
 */

import { isMac } from '../platform';

describe('platform utilities', () => {
  describe('isMac', () => {
    const originalNavigator = global.navigator;

    afterEach(() => {
      // Restore original navigator
      Object.defineProperty(global, 'navigator', {
        value: originalNavigator,
        writable: true,
        configurable: true
      });
    });

    it('should return true for Mac user agent', () => {
      Object.defineProperty(global, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
        writable: true,
        configurable: true
      });
      expect(isMac()).toBe(true);
    });

    it('should return true for Mac with different format', () => {
      Object.defineProperty(global, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Mac; Intel) AppleWebKit/537.36' },
        writable: true,
        configurable: true
      });
      expect(isMac()).toBe(true);
    });

    it('should return false for Windows user agent', () => {
      Object.defineProperty(global, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        writable: true,
        configurable: true
      });
      expect(isMac()).toBe(false);
    });

    it('should return false for Linux user agent', () => {
      Object.defineProperty(global, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' },
        writable: true,
        configurable: true
      });
      expect(isMac()).toBe(false);
    });

    it('should return false when navigator is undefined', () => {
      Object.defineProperty(global, 'navigator', {
        value: undefined,
        writable: true,
        configurable: true
      });
      expect(isMac()).toBe(false);
    });

    it('should return false for empty user agent', () => {
      Object.defineProperty(global, 'navigator', {
        value: { userAgent: '' },
        writable: true,
        configurable: true
      });
      expect(isMac()).toBe(false);
    });
  });
});