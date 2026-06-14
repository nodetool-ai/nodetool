import {
  firstAvailableIndex,
  nextAvailableIndex
} from "../modelMenuNavigation";

const allAvailable = () => true;

describe("nextAvailableIndex", () => {
  it("returns -1 for an empty list", () => {
    expect(nextAvailableIndex(0, -1, 1, allAvailable)).toBe(-1);
  });

  it("starts at the first row when moving down with no selection", () => {
    expect(nextAvailableIndex(3, -1, 1, allAvailable)).toBe(0);
  });

  it("starts at the last row when moving up with no selection", () => {
    expect(nextAvailableIndex(3, -1, -1, allAvailable)).toBe(2);
  });

  it("advances to the next row when moving down", () => {
    expect(nextAvailableIndex(3, 0, 1, allAvailable)).toBe(1);
  });

  it("wraps from the last row to the first when moving down", () => {
    expect(nextAvailableIndex(3, 2, 1, allAvailable)).toBe(0);
  });

  it("wraps from the first row to the last when moving up", () => {
    expect(nextAvailableIndex(3, 0, -1, allAvailable)).toBe(2);
  });

  it("skips unavailable rows when moving down", () => {
    // Only index 0 and 3 are available.
    const isAvailable = (i: number) => i === 0 || i === 3;
    expect(nextAvailableIndex(4, 0, 1, isAvailable)).toBe(3);
  });

  it("skips unavailable rows and wraps around", () => {
    const isAvailable = (i: number) => i === 0 || i === 3;
    expect(nextAvailableIndex(4, 3, 1, isAvailable)).toBe(0);
  });

  it("returns the current index when no row is available", () => {
    expect(nextAvailableIndex(3, 1, 1, () => false)).toBe(1);
  });
});

describe("firstAvailableIndex", () => {
  it("returns -1 when nothing is available", () => {
    expect(firstAvailableIndex(3, () => false)).toBe(-1);
  });

  it("returns 0 when the first row is available", () => {
    expect(firstAvailableIndex(3, allAvailable)).toBe(0);
  });

  it("skips leading unavailable rows", () => {
    expect(firstAvailableIndex(4, (i) => i >= 2)).toBe(2);
  });
});
