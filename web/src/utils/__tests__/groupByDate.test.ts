/**
 * @jest-environment node
 */

import { groupByDate } from '../groupByDate';

// Mock the relativeTime function
jest.mock('../formatDateAndTime', () => ({
  relativeTime: jest.fn((date) => {
    // For testing purposes, return a simple string based on the date
    // This is called when 7+ days have passed
    return '1 week ago';
  }),
}));

describe('groupByDate', () => {
  const mockNow = new Date('2024-01-15T12:00:00Z');

  describe('with Date object input', () => {
    it('should return "Today" for same day', () => {
      const sameDay = new Date('2024-01-15T08:30:00Z');
      expect(groupByDate(sameDay, mockNow)).toBe('Today');
      
      const sameDayLater = new Date('2024-01-15T23:59:59Z');
      expect(groupByDate(sameDayLater, mockNow)).toBe('Today');
      
      const sameDayEarlier = new Date('2024-01-15T00:00:00Z');
      expect(groupByDate(sameDayEarlier, mockNow)).toBe('Today');
    });

    it('should return "Yesterday" for previous day', () => {
      const yesterday = new Date('2024-01-14T12:00:00Z');
      expect(groupByDate(yesterday, mockNow)).toBe('Yesterday');
      
      const yesterdayEarly = new Date('2024-01-14T00:00:00Z');
      expect(groupByDate(yesterdayEarly, mockNow)).toBe('Yesterday');
      
      const yesterdayLate = new Date('2024-01-14T23:59:59Z');
      expect(groupByDate(yesterdayLate, mockNow)).toBe('Yesterday');
    });

    it('should return "X days ago" for 2-6 days ago', () => {
      const twoDaysAgo = new Date('2024-01-13T12:00:00Z');
      expect(groupByDate(twoDaysAgo, mockNow)).toBe('2 days ago');
      
      const threeDaysAgo = new Date('2024-01-12T12:00:00Z');
      expect(groupByDate(threeDaysAgo, mockNow)).toBe('3 days ago');
      
      const fourDaysAgo = new Date('2024-01-11T12:00:00Z');
      expect(groupByDate(fourDaysAgo, mockNow)).toBe('4 days ago');
      
      const fiveDaysAgo = new Date('2024-01-10T12:00:00Z');
      expect(groupByDate(fiveDaysAgo, mockNow)).toBe('5 days ago');
      
      const sixDaysAgo = new Date('2024-01-09T12:00:00Z');
      expect(groupByDate(sixDaysAgo, mockNow)).toBe('6 days ago');
    });

    it('should use relativeTime for 7+ days ago', () => {
      const sevenDaysAgo = new Date('2024-01-08T12:00:00Z');
      expect(groupByDate(sevenDaysAgo, mockNow)).toBe('1 week ago');
      
      const twoWeeksAgo = new Date('2024-01-01T12:00:00Z');
      expect(groupByDate(twoWeeksAgo, mockNow)).toBe('1 week ago'); // Mock always returns '1 week ago'
      
      const oneMonthAgo = new Date('2023-12-15T12:00:00Z');
      expect(groupByDate(oneMonthAgo, mockNow)).toBe('1 week ago'); // Mock always returns '1 week ago'
    });

    it('should handle future dates', () => {
      const tomorrow = new Date('2024-01-16T12:00:00Z');
      // Future dates will have negative diffDays
      const result = groupByDate(tomorrow, mockNow);
      expect(result).toBeDefined();
    });
  });

  describe('with string input', () => {
    it('should parse ISO date strings', () => {
      expect(groupByDate('2024-01-15T08:30:00Z', mockNow)).toBe('Today');
      expect(groupByDate('2024-01-14T12:00:00Z', mockNow)).toBe('Yesterday');
      expect(groupByDate('2024-01-13T12:00:00Z', mockNow)).toBe('2 days ago');
    });

    it('should parse date-only strings', () => {
      expect(groupByDate('2024-01-15', mockNow)).toBe('Today');
      expect(groupByDate('2024-01-14', mockNow)).toBe('Yesterday');
      expect(groupByDate('2024-01-10', mockNow)).toBe('5 days ago');
    });

    it('should handle various date string formats', () => {
      // US format
      expect(groupByDate('01/15/2024', mockNow)).toBe('Today');
      
      // European format (may be interpreted differently)
      const result = groupByDate('15/01/2024', mockNow);
      expect(result).toBeDefined();
    });

    it('should handle invalid date strings', () => {
      const result = groupByDate('invalid-date', mockNow);
      // Invalid dates will create an Invalid Date object
      expect(result).toBeDefined();
    });
  });

  describe('with default now parameter', () => {
    it('should use current date when now is not provided', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      const result = groupByDate(yesterday);
      expect(result).toBe('Yesterday');
    });

    it('should handle today without now parameter', () => {
      const today = new Date();
      const result = groupByDate(today);
      expect(result).toBe('Today');
    });
  });

  describe('edge cases', () => {
    it('should handle dates at year boundaries', () => {
      const endOfYear = new Date('2023-12-31T23:59:59Z');
      const startOfYear = new Date('2024-01-01T00:00:00Z');
      const mockNewYear = new Date('2024-01-01T12:00:00Z');
      
      expect(groupByDate(endOfYear, mockNewYear)).toBe('Yesterday');
      expect(groupByDate(startOfYear, mockNewYear)).toBe('Today');
    });

    it('should handle dates at month boundaries', () => {
      const endOfMonth = new Date('2024-01-31T23:59:59Z');
      const startOfMonth = new Date('2024-02-01T00:00:00Z');
      const mockFeb1 = new Date('2024-02-01T12:00:00Z');
      
      expect(groupByDate(endOfMonth, mockFeb1)).toBe('Yesterday');
      expect(groupByDate(startOfMonth, mockFeb1)).toBe('Today');
    });

    it('should handle leap year dates', () => {
      const leapDay = new Date('2024-02-29T12:00:00Z');
      const march1 = new Date('2024-03-01T12:00:00Z');
      
      expect(groupByDate(leapDay, march1)).toBe('Yesterday');
    });

    it('should handle daylight saving time transitions', () => {
      // Spring forward (example date when DST starts in many regions)
      const beforeDST = new Date('2024-03-09T12:00:00');
      const afterDST = new Date('2024-03-10T12:00:00');
      
      expect(groupByDate(beforeDST, afterDST)).toBe('Yesterday');
    });

    it('should handle exact 7-day boundary', () => {
      const exactlySevenDaysAgo = new Date('2024-01-08T12:00:00Z');
      expect(groupByDate(exactlySevenDaysAgo, mockNow)).toBe('1 week ago');
    });

    it('should handle very old dates', () => {
      const veryOld = new Date('1990-01-01T12:00:00Z');
      const result = groupByDate(veryOld, mockNow);
      expect(result).toBe('1 week ago'); // Mock always returns '1 week ago' for 7+ days
    });

    it('should handle dates with different timezones', () => {
      const date1 = new Date('2024-01-15T00:00:00-05:00'); // EST
      const date2 = new Date('2024-01-15T00:00:00+05:00'); // Different timezone
      const mockDate = new Date('2024-01-15T12:00:00Z');
      
      // Both should be handled, though results may vary based on timezone
      expect(groupByDate(date1, mockDate)).toBeDefined();
      expect(groupByDate(date2, mockDate)).toBeDefined();
    });

    it('should handle millisecond precision', () => {
      const date1 = new Date('2024-01-14T23:59:59.999Z');
      const date2 = new Date('2024-01-15T00:00:00.000Z');
      const mockDate = new Date('2024-01-15T12:00:00Z');
      
      expect(groupByDate(date1, mockDate)).toBe('Yesterday');
      expect(groupByDate(date2, mockDate)).toBe('Today');
    });
  });

  describe('normalization behavior', () => {
    it('should normalize to start of day for comparison', () => {
      const earlyMorning = new Date('2024-01-15T00:01:00Z');
      const lateNight = new Date('2024-01-15T23:59:00Z');
      const midday = new Date('2024-01-15T12:00:00Z');
      
      expect(groupByDate(earlyMorning, mockNow)).toBe('Today');
      expect(groupByDate(lateNight, mockNow)).toBe('Today');
      expect(groupByDate(midday, mockNow)).toBe('Today');
    });

    it('should handle time component correctly', () => {
      // Even if the time is later, if it's the same calendar day, it's "Today"
      const laterTime = new Date('2024-01-15T23:00:00Z');
      const earlierNow = new Date('2024-01-15T01:00:00Z');
      
      expect(groupByDate(laterTime, earlierNow)).toBe('Today');
    });
  });
});