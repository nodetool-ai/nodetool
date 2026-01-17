import { uuidv4 } from "../uuidv4";

describe("uuidv4", () => {
  describe("UUID Format", () => {
    it("should return a string", () => {
      const result = uuidv4();
      expect(typeof result).toBe("string");
    });

    it("should return a string with 36 characters", () => {
      const result = uuidv4();
      expect(result.length).toBe(36);
    });

    it("should follow UUID format xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx", () => {
      const result = uuidv4();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(result).toMatch(uuidRegex);
    });

    it("should have the correct version (4) in the UUID", () => {
      const result = uuidv4();
      expect(result.charAt(14)).toBe("4");
    });
  });

  describe("Uniqueness", () => {
    it("should generate unique UUIDs on consecutive calls", () => {
      const uuid1 = uuidv4();
      const uuid2 = uuidv4();
      expect(uuid1).not.toBe(uuid2);
    });

    it("should generate 1000 unique UUIDs", () => {
      const uuids = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        uuids.add(uuidv4());
      }
      expect(uuids.size).toBe(1000);
    });
  });

  describe("Randomness", () => {
    it("should generate different UUIDs with different randomness", () => {
      const results = new Set<string>();
      for (let i = 0; i < 100; i++) {
        results.add(uuidv4());
      }
      expect(results.size).toBeGreaterThan(50);
    });
  });

  describe("Format Specifics", () => {
    it("should have dashes at correct positions", () => {
      const result = uuidv4();
      expect(result.charAt(8)).toBe("-");
      expect(result.charAt(13)).toBe("-");
      expect(result.charAt(18)).toBe("-");
      expect(result.charAt(23)).toBe("-");
    });

    it("should only contain valid hexadecimal characters", () => {
      const result = uuidv4();
      const hexChars = "0123456789abcdef";
      const uuidWithoutDashes = result.replace(/-/g, "");

      for (const char of uuidWithoutDashes) {
        expect(hexChars).toContain(char);
      }
    });

    it("should have correct variant bits for positions 19-21", () => {
      for (let i = 0; i < 100; i++) {
        const result = uuidv4();
        const char19 = result.charAt(19);
        expect(["8", "9", "a", "b"]).toContain(char19);
      }
    });
  });
});
