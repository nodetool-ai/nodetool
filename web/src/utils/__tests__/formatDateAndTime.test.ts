/**
 * @jest-environment node
 */
import {
  secondsToHMS,
  relativeTime,
} from '../formatDateAndTime';

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

  describe('relativeTime', () => {
    test('computes human readable difference for various time units', () => {
      const now = new Date('2023-01-02T03:04:05Z');

      // Seconds
      expect(relativeTime(new Date(now.getTime() - 1000))).toBe('1 sec ago');
      expect(relativeTime(new Date(now.getTime() - 30000))).toBe('30 sec ago');

      // Minutes
      expect(relativeTime(new Date(now.getTime() - 60000))).toBe('1 min ago');
      expect(relativeTime(new Date(now.getTime() - 120000))).toBe('2 min ago');
      expect(relativeTime(new Date(now.getTime() - 59 * 60000))).toBe('59 min ago');

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

});
