/**
 * Tests for T-META-1: TypeMetadata.
 */
import { describe, it, expect } from "vitest";
import { TypeMetadata } from "../src/type-metadata.js";

describe("T-META-1: TypeMetadata", () => {
  describe("fromString parsing", () => {
    it("parses simple type", () => {
      const t = TypeMetadata.fromString("int");
      expect(t.type).toBe("int");
      expect(t.args).toEqual([]);
    });

    it("parses list type", () => {
      const t = TypeMetadata.fromString("list[int]");
      expect(t.type).toBe("list");
      expect(t.args.length).toBe(1);
      expect(t.args[0].type).toBe("int");
    });

    it("parses union type", () => {
      const t = TypeMetadata.fromString("union[str, int]");
      expect(t.type).toBe("union");
      expect(t.args.length).toBe(2);
      expect(t.args[0].type).toBe("str");
      expect(t.args[1].type).toBe("int");
    });

    it("parses nested type", () => {
      const t = TypeMetadata.fromString("list[union[str, int]]");
      expect(t.type).toBe("list");
      expect(t.args[0].type).toBe("union");
      expect(t.args[0].args.length).toBe(2);
    });

    it("parses ImageRef", () => {
      const t = TypeMetadata.fromString("ImageRef");
      expect(t.type).toBe("ImageRef");
      expect(t.args).toEqual([]);
    });

    it("parses any", () => {
      const t = TypeMetadata.fromString("any");
      expect(t.type).toBe("any");
      expect(t.isAny()).toBe(true);
    });

    it("parses empty string as any", () => {
      const t = TypeMetadata.fromString("");
      expect(t.type).toBe("any");
    });
  });

  describe("isListType", () => {
    it("returns true for list[int]", () => {
      expect(TypeMetadata.fromString("list[int]").isListType()).toBe(true);
    });

    it("returns true for list[str]", () => {
      expect(TypeMetadata.fromString("list[str]").isListType()).toBe(true);
    });

    it("returns false for int", () => {
      expect(TypeMetadata.fromString("int").isListType()).toBe(false);
    });

    it("returns false for union[str, int]", () => {
      expect(TypeMetadata.fromString("union[str, int]").isListType()).toBe(false);
    });
  });

  describe("isUnionType", () => {
    it("returns true for union[str, int]", () => {
      expect(TypeMetadata.fromString("union[str, int]").isUnionType()).toBe(true);
    });

    it("returns false for list[int]", () => {
      expect(TypeMetadata.fromString("list[int]").isUnionType()).toBe(false);
    });

    it("returns false for str", () => {
      expect(TypeMetadata.fromString("str").isUnionType()).toBe(false);
    });
  });

  describe("isCompatibleWith", () => {
    it("same type is compatible", () => {
      const a = TypeMetadata.fromString("int");
      const b = TypeMetadata.fromString("int");
      expect(a.isCompatibleWith(b)).toBe(true);
    });

    it("any is compatible with everything", () => {
      const any = TypeMetadata.fromString("any");
      const int = TypeMetadata.fromString("int");
      expect(any.isCompatibleWith(int)).toBe(true);
      expect(int.isCompatibleWith(any)).toBe(true);
    });

    it("int is compatible with float (numeric widening)", () => {
      const int = TypeMetadata.fromString("int");
      const float = TypeMetadata.fromString("float");
      expect(int.isCompatibleWith(float)).toBe(true);
      expect(float.isCompatibleWith(int)).toBe(true);
    });

    it("int is compatible with number", () => {
      const int = TypeMetadata.fromString("int");
      const num = TypeMetadata.fromString("number");
      expect(int.isCompatibleWith(num)).toBe(true);
    });

    it("str is not compatible with int", () => {
      const str = TypeMetadata.fromString("str");
      const int = TypeMetadata.fromString("int");
      expect(str.isCompatibleWith(int)).toBe(false);
    });

    it("union containing the type is compatible", () => {
      const union = TypeMetadata.fromString("union[str, int]");
      const int = TypeMetadata.fromString("int");
      expect(union.isCompatibleWith(int)).toBe(true);
      expect(int.isCompatibleWith(union)).toBe(true);
    });

    it("union not containing the type is not compatible", () => {
      const union = TypeMetadata.fromString("union[str, int]");
      const bool = TypeMetadata.fromString("bool");
      expect(union.isCompatibleWith(bool)).toBe(false);
    });

    it("list[int] is compatible with list[int]", () => {
      const a = TypeMetadata.fromString("list[int]");
      const b = TypeMetadata.fromString("list[int]");
      expect(a.isCompatibleWith(b)).toBe(true);
    });

    it("list[int] is not compatible with list[str]", () => {
      const a = TypeMetadata.fromString("list[int]");
      const b = TypeMetadata.fromString("list[str]");
      expect(a.isCompatibleWith(b)).toBe(false);
    });

    it("list[int] is compatible with list[float] via numeric widening", () => {
      const a = TypeMetadata.fromString("list[int]");
      const b = TypeMetadata.fromString("list[float]");
      expect(a.isCompatibleWith(b)).toBe(true);
    });

    it("ImageRef is not compatible with AudioRef", () => {
      const a = TypeMetadata.fromString("ImageRef");
      const b = TypeMetadata.fromString("AudioRef");
      expect(a.isCompatibleWith(b)).toBe(false);
    });
  });

  describe("toString", () => {
    it("simple type", () => {
      expect(TypeMetadata.fromString("int").toString()).toBe("int");
    });

    it("list type", () => {
      expect(TypeMetadata.fromString("list[int]").toString()).toBe("list[int]");
    });

    it("union type", () => {
      expect(TypeMetadata.fromString("union[str, int]").toString()).toBe("union[str, int]");
    });
  });
});
