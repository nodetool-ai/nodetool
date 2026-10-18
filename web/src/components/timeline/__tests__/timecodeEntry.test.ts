import { parseTimecodeEntry } from "../timecodeEntry";

describe("parseTimecodeEntry", () => {
  it("reads full and short timecodes from the right", () => {
    expect(parseTimecodeEntry("00:00:10:00", 25, 0)).toBe(10000);
    expect(parseTimecodeEntry("10:00", 25, 0)).toBe(10000);
    expect(parseTimecodeEntry("1:02:03:04", 25, 0)).toBe(3723160);
  });

  it("reads a digit run as frames first", () => {
    expect(parseTimecodeEntry("1000", 25, 0)).toBe(10000);
    expect(parseTimecodeEntry("5", 25, 0)).toBe(200);
    expect(parseTimecodeEntry("123", 25, 0)).toBe(1920);
    expect(parseTimecodeEntry("100000000", 25, 0)).toBe(100 * 3600 * 1000);
  });

  it("moves relative to the current time with + and -", () => {
    expect(parseTimecodeEntry("+10", 25, 1000)).toBe(1400);
    expect(parseTimecodeEntry("-100", 25, 3000)).toBe(2000);
    expect(parseTimecodeEntry("-500", 25, 1000)).toBe(0);
  });

  it("rejects anything else", () => {
    expect(parseTimecodeEntry("", 25, 0)).toBeNull();
    expect(parseTimecodeEntry("+", 25, 0)).toBeNull();
    expect(parseTimecodeEntry("1s", 25, 0)).toBeNull();
    expect(parseTimecodeEntry("1:2:3:4:5", 25, 0)).toBeNull();
  });
});
