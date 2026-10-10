import {
  firstAvailableIndex,
  nextAvailableIndex
} from "../modelMenuNavigation";

describe("modelMenuNavigation", () => {
  const all = () => true;

  describe("nextAvailableIndex", () => {
    it("returns -1 for an empty list", () => {
      expect(nextAvailableIndex(0, 0, 1, all)).toBe(-1);
    });

    it("moves down and up", () => {
      expect(nextAvailableIndex(5, 2, 1, all)).toBe(3);
      expect(nextAvailableIndex(5, 2, -1, all)).toBe(1);
    });

    it("wraps around both ends", () => {
      expect(nextAvailableIndex(5, 4, 1, all)).toBe(0);
      expect(nextAvailableIndex(5, 0, -1, all)).toBe(4);
    });

    it("starts at the first row going down and last row going up with no selection", () => {
      expect(nextAvailableIndex(5, -1, 1, all)).toBe(0);
      expect(nextAvailableIndex(5, -1, -1, all)).toBe(4);
    });

    it("skips unavailable rows", () => {
      const available = (i: number) => i !== 3 && i !== 4;
      expect(nextAvailableIndex(5, 2, 1, available)).toBe(0);
      expect(nextAvailableIndex(5, 0, -1, available)).toBe(2);
    });

    it("returns from unchanged when nothing is available", () => {
      expect(nextAvailableIndex(3, 1, 1, () => false)).toBe(1);
    });
  });

  describe("firstAvailableIndex", () => {
    it("returns the first available row", () => {
      expect(firstAvailableIndex(4, (i) => i >= 2)).toBe(2);
    });

    it("returns -1 when none are available or the list is empty", () => {
      expect(firstAvailableIndex(4, () => false)).toBe(-1);
      expect(firstAvailableIndex(0, all)).toBe(-1);
    });
  });
});
