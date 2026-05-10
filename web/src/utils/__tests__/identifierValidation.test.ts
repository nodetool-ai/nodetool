import {
  validateIdentifierName
} from "../identifierValidation";

describe("validateIdentifierName", () => {
  describe("valid identifiers", () => {
    it("accepts names starting with letters", () => {
      expect(validateIdentifierName("myProperty").isValid).toBe(true);
      expect(validateIdentifierName("output").isValid).toBe(true);
      expect(validateIdentifierName("MyOutput").isValid).toBe(true);
    });

    it("accepts names starting with underscore", () => {
      expect(validateIdentifierName("_private").isValid).toBe(true);
      expect(validateIdentifierName("_123").isValid).toBe(true);
    });

    it("accepts names with numbers after first character", () => {
      expect(validateIdentifierName("output1").isValid).toBe(true);
      expect(validateIdentifierName("prop2name").isValid).toBe(true);
      expect(validateIdentifierName("v3_output").isValid).toBe(true);
    });

    it("accepts names with special characters after first character", () => {
      expect(validateIdentifierName("my_property").isValid).toBe(true);
      expect(validateIdentifierName("my-property").isValid).toBe(true);
    });

    it("trims whitespace before validation", () => {
      expect(validateIdentifierName("  output  ").isValid).toBe(true);
      expect(validateIdentifierName("  myProp").isValid).toBe(true);
      expect(validateIdentifierName("myProp  ").isValid).toBe(true);
    });
  });

  describe("invalid identifiers", () => {
    it("rejects names starting with numbers", () => {
      const result = validateIdentifierName("1output");
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("cannot start with a number");
    });

    it("rejects names starting with single digit", () => {
      expect(validateIdentifierName("0").isValid).toBe(false);
      expect(validateIdentifierName("5").isValid).toBe(false);
      expect(validateIdentifierName("9prop").isValid).toBe(false);
    });

    it("rejects names starting with multiple numbers", () => {
      expect(validateIdentifierName("123output").isValid).toBe(false);
      expect(validateIdentifierName("99red_balloons").isValid).toBe(false);
    });

    it("rejects empty strings", () => {
      const result = validateIdentifierName("");
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("cannot be empty");
    });

    it("rejects whitespace-only strings", () => {
      const result = validateIdentifierName("   ");
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("cannot be empty");
    });

    it("rejects strings that become empty after trimming", () => {
      const result = validateIdentifierName("\n\t  ");
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("cannot be empty");
    });
  });

  describe("error messages", () => {
    it("provides clear error for leading numbers", () => {
      const result = validateIdentifierName("1st_place");
      expect(result.error).toBe(
        "Name cannot start with a number. Use a letter or underscore instead."
      );
    });

    it("provides clear error for empty names", () => {
      const result = validateIdentifierName("");
      expect(result.error).toBe("Name cannot be empty");
    });
  });
});

