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

  test('secondsToHMS converts seconds to hh:mm:ss', () => {
    expect(secondsToHMS(3661)).toBe('01:01:01');
  });

  test('prettyDate formats normal dates in 12h format', () => {
    expect(prettyDate('2023-01-02 03:04:05')).toBe('2023-01-02 | 03:04:05 AM');
  });

  test('prettyDate verbose with 24h time', () => {
    const year = new Date().getFullYear();
    const str = `${year}-05-15 13:30:00`;
    const iso = str.replace(' ', 'T');
    const dt = DateTime.fromISO(iso);
    const expected = dt.toFormat('d. MMMM  | HH:mm');
    expect(prettyDate(str, 'verbose', { timeFormat: '24h' })).toBe(expected);
  });

  test('prettyDate returns "Invalid Date" and logs warning on bad input', () => {
    const warnSpy = jest.spyOn(log, 'warn').mockImplementation(() => {});
    expect(prettyDate('not-a-date')).toBe('Invalid Date');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test('relativeTime computes human readable difference', () => {
    const hourAgo = new Date(Date.now() - 3600 * 1000);
    expect(relativeTime(hourAgo)).toBe('1 hour ago');
    expect(relativeTime(new Date())).toBe('just now');
  });

  test('getTimestampForFilename uses the frozen time', () => {
    expect(getTimestampForFilename()).toBe('2023-01-02_03-04-05');
    expect(getTimestampForFilename(false)).toBe('2023-01-02');
  });
});
