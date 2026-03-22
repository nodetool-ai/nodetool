import reduceUnionType from "../reduceUnionType";
import { TypeMetadata } from "../../stores/ApiTypes";

// Helper to create a minimal valid TypeMetadata
const createTypeMetadata = (
  type: string,
  typeArgs?: TypeMetadata[]
): TypeMetadata => ({
  type,
  optional: false,
  type_args: typeArgs ?? []
});

describe("reduceUnionType", () => {
  describe("non-union types", () => {
    it("returns the type directly for non-union types", () => {
      const type = createTypeMetadata("int");
      expect(reduceUnionType(type)).toBe("int");
    });

    it("returns 'str' for string type", () => {
      const type = createTypeMetadata("str");
      expect(reduceUnionType(type)).toBe("str");
    });

    it("returns 'float' for float type", () => {
      const type = createTypeMetadata("float");
      expect(reduceUnionType(type)).toBe("float");
    });
  });

  describe("union types with type_args", () => {
    it("reduces str|text union to str", () => {
      const type = createTypeMetadata("union", [
        createTypeMetadata("str"),
        createTypeMetadata("text")
      ]);
      expect(reduceUnionType(type)).toBe("str");
    });

    it("reduces int|float union to float", () => {
      const type = createTypeMetadata("union", [
        createTypeMetadata("int"),
        createTypeMetadata("float")
      ]);
      expect(reduceUnionType(type)).toBe("float");
    });

    it("reduces int|float|tensor union to float", () => {
      const type = createTypeMetadata("union", [
        createTypeMetadata("int"),
        createTypeMetadata("float"),
        createTypeMetadata("tensor")
      ]);
      expect(reduceUnionType(type)).toBe("float");
    });

    it("reduces none|str union to str", () => {
      const type = createTypeMetadata("union", [
        createTypeMetadata("none"),
        createTypeMetadata("str")
      ]);
      expect(reduceUnionType(type)).toBe("str");
    });

    it("reduces none|str|text union to str", () => {
      const type = createTypeMetadata("union", [
        createTypeMetadata("none"),
        createTypeMetadata("str"),
        createTypeMetadata("text")
      ]);
      expect(reduceUnionType(type)).toBe("str");
    });

    it("reduces none|text union to str", () => {
      const type = createTypeMetadata("union", [
        createTypeMetadata("none"),
        createTypeMetadata("text")
      ]);
      expect(reduceUnionType(type)).toBe("str");
    });

    it("reduces int|none union to int", () => {
      const type = createTypeMetadata("union", [
        createTypeMetadata("int"),
        createTypeMetadata("none")
      ]);
      expect(reduceUnionType(type)).toBe("int");
    });

    it("reduces float|int|none union to float", () => {
      const type = createTypeMetadata("union", [
        createTypeMetadata("float"),
        createTypeMetadata("int"),
        createTypeMetadata("none")
      ]);
      expect(reduceUnionType(type)).toBe("float");
    });

    it("reduces float|none union to float", () => {
      const type = createTypeMetadata("union", [
        createTypeMetadata("float"),
        createTypeMetadata("none")
      ]);
      expect(reduceUnionType(type)).toBe("float");
    });
  });

  describe("union types without defined rules", () => {
    it("returns first type alphabetically for unknown unions", () => {
      const type = createTypeMetadata("union", [
        createTypeMetadata("audio"),
        createTypeMetadata("image")
      ]);
      // After sorting, "audio" comes first
      expect(reduceUnionType(type)).toBe("audio");
    });

    it("handles single type_args by returning that type", () => {
      const type = createTypeMetadata("union", [createTypeMetadata("bool")]);
      expect(reduceUnionType(type)).toBe("bool");
    });
  });

  describe("edge cases", () => {
    it("returns 'str' when union type has undefined type_args", () => {
      // Using type assertion to test the undefined case
      const type = {
        type: "union",
        optional: false,
        type_args: undefined
      } as unknown as TypeMetadata;
      expect(reduceUnionType(type)).toBe("str");
    });

    it("handles order-independent matching (type_args sorted)", () => {
      // Test that the order in type_args doesn't matter
      const type1 = createTypeMetadata("union", [
        createTypeMetadata("float"),
        createTypeMetadata("int")
      ]);
      const type2 = createTypeMetadata("union", [
        createTypeMetadata("int"),
        createTypeMetadata("float")
      ]);
      expect(reduceUnionType(type1)).toBe(reduceUnionType(type2));
      expect(reduceUnionType(type1)).toBe("float");
    });
  });
});
