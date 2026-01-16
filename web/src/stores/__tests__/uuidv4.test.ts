import { uuidv4 } from "../uuidv4";

describe("uuidv4", () => {
  describe("output format", () => {
    it("returns a string", () => {
      const result = uuidv4();
      expect(typeof result).toBe("string");
    });

    it("returns a string of correct length (36 characters with hyphens)", () => {
      const result = uuidv4();
      expect(result.length).toBe(36);
    });

    it("matches UUID v4 format pattern", () => {
      const result = uuidv4();
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(result).toMatch(uuidPattern);
    });

    it("has correct version bits (4 in the third section)", () => {
      const result = uuidv4();
      // The format is: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      // The '4' should be at position 14 (0-indexed)
      expect(result.charAt(14)).toBe("4");
    });

    it("has correct variant bits (8, 9, a, or b in the fourth section)", () => {
      const result = uuidv4();
      // The format is: xxxxxxxx-xxxx-xxxx-8xxx-xxxxxxxxxxxx (RFC 4122 variant)
      // The character at position 19 should be 8, 9, a, or b
      const validVariants = ["8", "9", "a", "A", "b", "B"];
      expect(validVariants).toContain(result.charAt(19));
    });
  });

  describe("uniqueness", () => {
    it("generates unique IDs on multiple calls", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(uuidv4());
      }
      expect(ids.size).toBe(100);
    });

    it("generates different IDs when called rapidly", () => {
      const id1 = uuidv4();
      const id2 = uuidv4();
      const id3 = uuidv4();

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });
  });

  describe("consistency", () => {
    it("only contains valid hexadecimal characters", () => {
      const result = uuidv4();
      const hexChars = "0123456789abcdefABCDEF";
      for (const char of result) {
        if (char !== "-") {
          expect(hexChars).toContain(char);
        }
      }
    });

    it("has hyphens at correct positions", () => {
      const result = uuidv4();
      expect(result.charAt(8)).toBe("-");
      expect(result.charAt(13)).toBe("-");
      expect(result.charAt(18)).toBe("-");
      expect(result.charAt(23)).toBe("-");
    });
  });

  describe("edge cases", () => {
    it("handles multiple consecutive calls", () => {
      const ids = Array.from({ length: 10 }, () => uuidv4());
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(10);
    });

    it("can be used as object keys", () => {
      const map = new Map<string, string>();
      const id = uuidv4();
      map.set(id, "value");
      expect(map.get(id)).toBe("value");
    });

    it("can be used in arrays and objects", () => {
      const obj = {
        id: uuidv4(),
        nested: {
          id: uuidv4()
        }
      };
      expect(obj.id).toBeTruthy();
      expect(obj.nested.id).toBeTruthy();
      expect(obj.id).not.toBe(obj.nested.id);
    });
  });

  describe("UUID format validation", () => {
    it("is a valid RFC 4122 UUID", () => {
      const result = uuidv4();

      // Split UUID into parts
      const parts = result.split("-");
      expect(parts).toHaveLength(5);

      // Verify each part has correct length
      expect(parts[0]).toHaveLength(8);
      expect(parts[1]).toHaveLength(4);
      expect(parts[2]).toHaveLength(4);
      expect(parts[3]).toHaveLength(4);
      expect(parts[4]).toHaveLength(12);

      // Verify version (first character of part 3 is '4')
      expect(parts[2].charAt(0)).toBe("4");

      // Verify variant (first character of part 4 is 8, 9, a, or b)
      const variantChar = parts[3].charAt(0);
      expect(["8", "9", "a", "A", "b", "B"]).toContain(variantChar);
    });
  });
});
