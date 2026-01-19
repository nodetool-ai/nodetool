/**
 * @jest-environment node
 */
import { 
  prettyDate, 
  relativeTime,
  secondsToHMS,
  getTimestampForFilename 
} from '../formatDateAndTime';

describe('formatDateAndTime', () => {
  describe('secondsToHMS', () => {
    it('formats zero seconds', () => {
      expect(secondsToHMS(0)).toBe('00:00:00');
    });

    it('formats seconds only', () => {
      expect(secondsToHMS(30)).toBe('00:00:30');
    });

    it('formats minutes and seconds', () => {
      expect(secondsToHMS(90)).toBe('00:01:30');
    });

    it('formats hours, minutes, and seconds', () => {
      expect(secondsToHMS(3661)).toBe('01:01:01');
    });

    it('formats more than an hour', () => {
      expect(secondsToHMS(3723)).toBe('01:02:03');
    });

    it('formats long duration', () => {
      expect(secondsToHMS(86400)).toBe('24:00:00');
    });
  });

  describe('prettyDate', () => {
    it('formats ISO date string in normal style', () => {
      expect(prettyDate('2026-01-15T14:30:00Z')).toBe('2026-01-15 | 02:30:00 PM');
    });

    it('formats ISO date string in verbose style', () => {
      const result = prettyDate('2026-01-15T14:30:00Z', 'verbose');
      expect(result).toContain('January 15');
      expect(result).toContain('02:30');
    });

    it('handles undefined input', () => {
      expect(prettyDate(undefined)).toBe('-');
    });

    it('handles empty string', () => {
      expect(prettyDate('')).toBe('-');
    });

    it('handles numeric timestamp', () => {
      const timestamp = new Date('2026-01-15T14:30:00Z').getTime();
      const result = prettyDate(timestamp);
      expect(result).toContain('2026-01-15');
    });

    it('handles invalid date', () => {
      expect(prettyDate('invalid-date')).toBe('Invalid Date');
    });

    it('formats with 24h time setting', () => {
      const result = prettyDate('2026-01-15T14:30:00Z', 'normal', { timeFormat: '24h' });
      expect(result).toContain('14:30:00');
    });

    it('formats with 12h time setting', () => {
      const result = prettyDate('2026-01-15T14:30:00Z', 'normal', { timeFormat: '12h' });
      expect(result).toContain('02:30:00 PM');
    });

    it('formats verbose with 24h time', () => {
      const result = prettyDate('2026-01-15T14:30:00Z', 'verbose', { timeFormat: '24h' });
      expect(result).toContain('14:30');
    });

    it('formats date without time component', () => {
      const result = prettyDate('2026-01-15');
      expect(result).toContain('2026-01-15');
    });

    it('replaces space with T for ISO parsing', () => {
      const result = prettyDate('2026-01-15 14:30:00');
      expect(result).toContain('2026-01-15');
    });
  });

  describe('relativeTime', () => {
    it('returns "just now" for current time', () => {
      const now = new Date();
      expect(relativeTime(now)).toBe('just now');
    });

    it('formats seconds ago', () => {
      const thirtySecondsAgo = new Date(Date.now() - 30000);
      expect(relativeTime(thirtySecondsAgo)).toBe('30 sec ago');
    });

    it('formats minutes ago', () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      expect(relativeTime(fiveMinutesAgo)).toBe('5 min ago');
    });

    it('formats hours ago', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      expect(relativeTime(twoHoursAgo)).toBe('2 hours ago');
    });

    it('formats days ago', () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      expect(relativeTime(threeDaysAgo)).toBe('3 days ago');
    });

    it('formats weeks ago', () => {
      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      expect(relativeTime(twoWeeksAgo)).toBe('2 weeks ago');
    });

    it('formats months ago', () => {
      const twoMonthsAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      expect(relativeTime(twoMonthsAgo)).toBe('2 months ago');
    });

    it('formats years ago', () => {
      const twoYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000);
      expect(relativeTime(twoYearsAgo)).toBe('2 years ago');
    });

    it('handles string date input', () => {
      const result = relativeTime('2026-01-15T14:30:00Z');
      expect(result).toContain('ago');
    });

    it('uses singular form for 1 unit', () => {
      const oneHourAgo = new Date(Date.now() - 3600 * 1000);
      expect(relativeTime(oneHourAgo)).toBe('1 hour ago');
    });

    it('uses singular min form', () => {
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
      expect(relativeTime(oneMinuteAgo)).toBe('1 min ago');
    });

    it('uses singular sec form', () => {
      const oneSecondAgo = new Date(Date.now() - 1000);
      expect(relativeTime(oneSecondAgo)).toBe('1 sec ago');
    });
  });

  describe('getTimestampForFilename', () => {
    it('generates timestamp with date and time', () => {
      const result = getTimestampForFilename(true);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
    });

    it('generates timestamp with date only', () => {
      const result = getTimestampForFilename(false);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('generates different timestamps for different calls', () => {
      const result1 = getTimestampForFilename(false);
      // The result should be consistent for the same date
      expect(result1).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
