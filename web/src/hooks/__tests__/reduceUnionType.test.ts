import reduceUnionType from "../reduceUnionType";
import { TypeMetadata } from "../../stores/ApiTypes";

const createTypeMetadata = (type: string, typeArgs?: TypeMetadata[]): TypeMetadata => ({
  type,
  optional: false,
  type_args: typeArgs ?? []
});

const createUnionType = (typeArgs: TypeMetadata[]): TypeMetadata => ({
  type: "union",
  optional: false,
  type_args: typeArgs
});

const createSimpleType = (typeStr: string): TypeMetadata => 
  createTypeMetadata(typeStr);

describe("reduceUnionType", () => {
  describe("non-union types", () => {
    it("should return 'str' for str type", () => {
      const input = createSimpleType("str");
      expect(reduceUnionType(input)).toBe("str");
    });

    it("should return 'int' for int type", () => {
      const input = createSimpleType("int");
      expect(reduceUnionType(input)).toBe("int");
    });

    it("should return 'float' for float type", () => {
      const input = createSimpleType("float");
      expect(reduceUnionType(input)).toBe("float");
    });

    it("should return 'tensor' for tensor type", () => {
      const input = createSimpleType("tensor");
      expect(reduceUnionType(input)).toBe("tensor");
    });

    it("should return 'any' for any type", () => {
      const input = createSimpleType("any");
      expect(reduceUnionType(input)).toBe("any");
    });

    it("should return the original type for non-union types", () => {
      const input = createSimpleType("image");
      expect(reduceUnionType(input)).toBe("image");
    });
  });

  describe("union types with type_args", () => {
    it("should reduce str_text to str", () => {
      const input = createUnionType([
        createSimpleType("str"),
        createSimpleType("text")
      ]);
      expect(reduceUnionType(input)).toBe("str");
    });

    it("should reduce int_float to float", () => {
      const input = createUnionType([
        createSimpleType("int"),
        createSimpleType("float")
      ]);
      expect(reduceUnionType(input)).toBe("float");
    });

    it("should reduce int_float_tensor to float", () => {
      const input = createUnionType([
        createSimpleType("int"),
        createSimpleType("float"),
        createSimpleType("tensor")
      ]);
      expect(reduceUnionType(input)).toBe("float");
    });

    it("should reduce none_str to str", () => {
      const input = createUnionType([
        createSimpleType("none"),
        createSimpleType("str")
      ]);
      expect(reduceUnionType(input)).toBe("str");
    });

    it("should reduce none_str_text to str", () => {
      const input = createUnionType([
        createSimpleType("none"),
        createSimpleType("str"),
        createSimpleType("text")
      ]);
      expect(reduceUnionType(input)).toBe("str");
    });

    it("should reduce none_text to str", () => {
      const input = createUnionType([
        createSimpleType("none"),
        createSimpleType("text")
      ]);
      expect(reduceUnionType(input)).toBe("str");
    });

    it("should reduce int_none to int", () => {
      const input = createUnionType([
        createSimpleType("int"),
        createSimpleType("none")
      ]);
      expect(reduceUnionType(input)).toBe("int");
    });

    it("should reduce float_int_none to float", () => {
      const input = createUnionType([
        createSimpleType("float"),
        createSimpleType("int"),
        createSimpleType("none")
      ]);
      expect(reduceUnionType(input)).toBe("float");
    });

    it("should reduce float_none to float", () => {
      const input = createUnionType([
        createSimpleType("float"),
        createSimpleType("none")
      ]);
      expect(reduceUnionType(input)).toBe("float");
    });
  });

  describe("union types without matching rules", () => {
    it("should return first type if no rule matches (after sorting)", () => {
      const input = createUnionType([
        createSimpleType("image"),
        createSimpleType("audio")
      ]);
      // After sorting: ["audio", "image"], so first element is "audio"
      expect(reduceUnionType(input)).toBe("audio");
    });

    it("should handle union with single type_arg", () => {
      const input = createUnionType([
        createSimpleType("custom")
      ]);
      expect(reduceUnionType(input)).toBe("custom");
    });

    it("should handle union with many type_args", () => {
      const input = createUnionType([
        createSimpleType("a"),
        createSimpleType("b"),
        createSimpleType("c"),
        createSimpleType("d")
      ]);
      expect(reduceUnionType(input)).toBe("a");
    });
  });

  describe("union types with undefined type_args", () => {
    it("should return 'str' for union with undefined type_args", () => {
      const input: TypeMetadata = {
        type: "union",
        optional: false,
        type_args: undefined as unknown as TypeMetadata[]
      };
      expect(reduceUnionType(input)).toBe("str");
    });
  });

  describe("type argument ordering", () => {
    it("should sort type_args before checking rules", () => {
      const input = createUnionType([
        createSimpleType("float"),
        createSimpleType("int")
      ]);
      // int_float sorted becomes "float_int" which should map to "float"
      expect(reduceUnionType(input)).toBe("float");
    });

    it("should handle type_args in any order", () => {
      const input1 = createUnionType([
        createSimpleType("none"),
        createSimpleType("str")
      ]);
      expect(reduceUnionType(input1)).toBe("str");

      const input2 = createUnionType([
        createSimpleType("str"),
        createSimpleType("none")
      ]);
      expect(reduceUnionType(input2)).toBe("str");
    });
  });
});
