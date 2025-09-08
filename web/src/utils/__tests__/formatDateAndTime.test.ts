/**
 * @jest-environment node
 */
import log from 'loglevel';
import {
  secondsToHMS,
  prettyDate,
  relativeTime,
  getTimestampForFilename
} from '../formatDateAndTime';
import { DateTime } from 'luxon';

describe('formatDateAndTime utilities', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date('2023-01-02T03:04:05Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  describe('secondsToHMS', () => {
    test('converts seconds to hh:mm:ss', () => {
      expect(secondsToHMS(3661)).toBe('01:01:01');
      expect(secondsToHMS(0)).toBe('00:00:00');
      expect(secondsToHMS(59)).toBe('00:00:59');
      expect(secondsToHMS(60)).toBe('00:01:00');
      expect(secondsToHMS(3599)).toBe('00:59:59');
      expect(secondsToHMS(3600)).toBe('01:00:00');
      expect(secondsToHMS(86399)).toBe('23:59:59'); // 1 second before 24 hours
      expect(secondsToHMS(86400)).toBe('24:00:00'); // 24 hours
      expect(secondsToHMS(90061)).toBe('25:01:01'); // More than 24 hours
    });

    test('handles decimal seconds by flooring', () => {
      expect(secondsToHMS(3661.9)).toBe('01:01:01');
      expect(secondsToHMS(59.9)).toBe('00:00:59');
    });
  });

  describe('prettyDate', () => {
    test('returns "-" for undefined or empty input', () => {
      expect(prettyDate(undefined)).toBe('-');
      expect(prettyDate('')).toBe('-');
      expect(prettyDate(0)).toBe('-');
    });

    test('formats normal dates in 12h format by default', () => {
      expect(prettyDate('2023-01-02 03:04:05')).toBe('2023-01-02 | 03:04:05 AM');
      expect(prettyDate('2023-01-02T15:30:45')).toBe('2023-01-02 | 03:30:45 PM');
    });

    test('formats normal dates in 24h format when specified', () => {
      expect(prettyDate('2023-01-02 03:04:05', 'normal', { timeFormat: '24h' })).toBe('02.01.2023 | 03:04:05');
      expect(prettyDate('2023-01-02T15:30:45', 'normal', { timeFormat: '24h' })).toBe('02.01.2023 | 15:30:45');
    });

    test('formats verbose dates in 12h format', () => {
      const year = new Date().getFullYear();
      const str = `${year}-05-15 13:30:00`;
      const expected = 'May 15 | 01:30 PM';
      expect(prettyDate(str, 'verbose')).toBe(expected);
      
      // Different year
      expect(prettyDate('2022-05-15 13:30:00', 'verbose')).toBe('2022 May 15 | 01:30 PM');
    });

    test('formats verbose dates in 24h format', () => {
      const year = new Date().getFullYear();
      const str = `${year}-05-15 13:30:00`;
      const iso = str.replace(' ', 'T');
      const dt = DateTime.fromISO(iso);
      const expected = dt.toFormat('d. MMMM  | HH:mm');
      expect(prettyDate(str, 'verbose', { timeFormat: '24h' })).toBe(expected);
      
      // Different year
      expect(prettyDate('2022-05-15 13:30:00', 'verbose', { timeFormat: '24h' })).toBe('15 May 2022 | 13:30');
    });

    test('handles numeric timestamp input', () => {
      const timestamp = new Date('2023-01-02T03:04:05Z').getTime();
      expect(prettyDate(timestamp)).toBe('2023-01-02 | 03:04:05 AM');
    });

    test('returns "Invalid Date" and logs warning on bad input', () => {
      const warnSpy = jest.spyOn(log, 'warn').mockImplementation(() => {});
      expect(prettyDate('not-a-date')).toBe('Invalid Date');
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('relativeTime', () => {
    test('computes human readable difference for various time units', () => {
      const now = new Date('2023-01-02T03:04:05Z');
      
      // Seconds
      expect(relativeTime(new Date(now.getTime() - 1000))).toBe('1 second ago');
      expect(relativeTime(new Date(now.getTime() - 30000))).toBe('30 seconds ago');
      
      // Minutes
      expect(relativeTime(new Date(now.getTime() - 60000))).toBe('1 minute ago');
      expect(relativeTime(new Date(now.getTime() - 120000))).toBe('2 minutes ago');
      expect(relativeTime(new Date(now.getTime() - 59 * 60000))).toBe('59 minutes ago');
      
      // Hours
      expect(relativeTime(new Date(now.getTime() - 3600000))).toBe('1 hour ago');
      expect(relativeTime(new Date(now.getTime() - 7200000))).toBe('2 hours ago');
      expect(relativeTime(new Date(now.getTime() - 23 * 3600000))).toBe('23 hours ago');
      
      // Days
      expect(relativeTime(new Date(now.getTime() - 86400000))).toBe('1 day ago');
      expect(relativeTime(new Date(now.getTime() - 2 * 86400000))).toBe('2 days ago');
      expect(relativeTime(new Date(now.getTime() - 6 * 86400000))).toBe('6 days ago');
      
      // Weeks
      expect(relativeTime(new Date(now.getTime() - 7 * 86400000))).toBe('1 week ago');
      expect(relativeTime(new Date(now.getTime() - 14 * 86400000))).toBe('2 weeks ago');
      
      // Months
      expect(relativeTime(new Date(now.getTime() - 30 * 86400000))).toBe('1 month ago');
      expect(relativeTime(new Date(now.getTime() - 60 * 86400000))).toBe('2 months ago');
      
      // Years
      expect(relativeTime(new Date(now.getTime() - 365 * 86400000))).toBe('1 year ago');
      expect(relativeTime(new Date(now.getTime() - 730 * 86400000))).toBe('2 years ago');
      
      // Just now
      expect(relativeTime(new Date())).toBe('just now');
      expect(relativeTime(new Date(now.getTime() - 500))).toBe('just now');
    });

    test('handles string dates', () => {
      const hourAgo = new Date(Date.now() - 3600 * 1000);
      expect(relativeTime(hourAgo.toISOString())).toBe('1 hour ago');
    });
  });

  describe('getTimestampForFilename', () => {
    test('generates timestamp with time by default', () => {
      expect(getTimestampForFilename()).toBe('2023-01-02_03-04-05');
      expect(getTimestampForFilename(true)).toBe('2023-01-02_03-04-05');
    });

    test('generates timestamp without time when specified', () => {
      expect(getTimestampForFilename(false)).toBe('2023-01-02');
    });
  });
});
