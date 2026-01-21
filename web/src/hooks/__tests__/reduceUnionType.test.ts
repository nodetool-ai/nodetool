import { TypeMetadata } from "../../stores/ApiTypes";
import reduceUnionType from "../reduceUnionType";

describe("reduceUnionType", () => {
  const createTypeMetadata = (type: string, typeArgs?: TypeMetadata[]): TypeMetadata => ({
    type,
    optional: false,
    type_args: typeArgs as TypeMetadata["type_args"],
  });

  describe("non-union types", () => {
    it("returns 'str' for str type", () => {
      const input = createTypeMetadata("str");
      expect(reduceUnionType(input)).toBe("str");
    });

    it("returns 'int' for int type", () => {
      const input = createTypeMetadata("int");
      expect(reduceUnionType(input)).toBe("int");
    });

    it("returns 'float' for float type", () => {
      const input = createTypeMetadata("float");
      expect(reduceUnionType(input)).toBe("float");
    });

    it("returns 'tensor' for tensor type", () => {
      const input = createTypeMetadata("tensor");
      expect(reduceUnionType(input)).toBe("tensor");
    });

    it("returns 'image' for image type", () => {
      const input = createTypeMetadata("image");
      expect(reduceUnionType(input)).toBe("image");
    });

    it("returns 'audio' for audio type", () => {
      const input = createTypeMetadata("audio");
      expect(reduceUnionType(input)).toBe("audio");
    });
  });

  describe("union type reduction rules", () => {
    it("reduces int_float to float", () => {
      const input = createTypeMetadata("union", [
        createTypeMetadata("int"),
        createTypeMetadata("float"),
      ]);
      expect(reduceUnionType(input)).toBe("float");
    });

    it("reduces int_float_tensor to float", () => {
      const input = createTypeMetadata("union", [
        createTypeMetadata("int"),
        createTypeMetadata("float"),
        createTypeMetadata("tensor"),
      ]);
      expect(reduceUnionType(input)).toBe("float");
    });

    it("reduces str_text to str", () => {
      const input = createTypeMetadata("union", [
        createTypeMetadata("str"),
        createTypeMetadata("text"),
      ]);
      expect(reduceUnionType(input)).toBe("str");
    });

    it("reduces none_str to str", () => {
      const input = createTypeMetadata("union", [
        createTypeMetadata("none"),
        createTypeMetadata("str"),
      ]);
      expect(reduceUnionType(input)).toBe("str");
    });

    it("reduces none_str_text to str", () => {
      const input = createTypeMetadata("union", [
        createTypeMetadata("none"),
        createTypeMetadata("str"),
        createTypeMetadata("text"),
      ]);
      expect(reduceUnionType(input)).toBe("str");
    });

    it("reduces none_text to str", () => {
      const input = createTypeMetadata("union", [
        createTypeMetadata("none"),
        createTypeMetadata("text"),
      ]);
      expect(reduceUnionType(input)).toBe("str");
    });

    it("reduces int_none to int", () => {
      const input = createTypeMetadata("union", [
        createTypeMetadata("int"),
        createTypeMetadata("none"),
      ]);
      expect(reduceUnionType(input)).toBe("int");
    });

    it("reduces float_int_none to float", () => {
      const input = createTypeMetadata("union", [
        createTypeMetadata("float"),
        createTypeMetadata("int"),
        createTypeMetadata("none"),
      ]);
      expect(reduceUnionType(input)).toBe("float");
    });

    it("reduces float_none to float", () => {
      const input = createTypeMetadata("union", [
        createTypeMetadata("float"),
        createTypeMetadata("none"),
      ]);
      expect(reduceUnionType(input)).toBe("float");
    });
  });

  describe("union types without rules", () => {
    it("returns first type when no rule matches", () => {
      const input = createTypeMetadata("union", [
        createTypeMetadata("image"),
        createTypeMetadata("video"),
      ]);
      expect(reduceUnionType(input)).toBe("image");
    });

    it("returns first type for audio_video union", () => {
      const input = createTypeMetadata("union", [
        createTypeMetadata("audio"),
        createTypeMetadata("video"),
      ]);
      expect(reduceUnionType(input)).toBe("audio");
    });

    it("returns first type for custom types", () => {
      const input = createTypeMetadata("union", [
        createTypeMetadata("custom_type_a"),
        createTypeMetadata("custom_type_b"),
      ]);
      expect(reduceUnionType(input)).toBe("custom_type_a");
    });
  });

  describe("union type with undefined type_args", () => {
    it("returns 'str' when type_args is undefined", () => {
      const input: TypeMetadata = {
        type: "union",
        optional: false,
        type_args: undefined as unknown as TypeMetadata["type_args"],
      };
      expect(reduceUnionType(input)).toBe("str");
    });
  });

  describe("type sorting behavior", () => {
    it("sorts typeArgs alphabetically before applying rule", () => {
      const input = createTypeMetadata("union", [
        createTypeMetadata("float"),
        createTypeMetadata("int"),
      ]);
      expect(reduceUnionType(input)).toBe("float");
    });

    it("handles union with multiple same types", () => {
      const input = createTypeMetadata("union", [
        createTypeMetadata("str"),
        createTypeMetadata("str"),
        createTypeMetadata("text"),
      ]);
      expect(reduceUnionType(input)).toBe("str");
    });
  });

  describe("edge cases", () => {
    it("returns undefined for empty union (no type_args)", () => {
      const input = createTypeMetadata("union", []);
      expect(reduceUnionType(input)).toBeUndefined();
    });

    it("handles single element union", () => {
      const input = createTypeMetadata("union", [
        createTypeMetadata("bool"),
      ]);
      expect(reduceUnionType(input)).toBe("bool");
    });

    it("handles union with three elements", () => {
      const input = createTypeMetadata("union", [
        createTypeMetadata("int"),
        createTypeMetadata("str"),
        createTypeMetadata("float"),
      ]);
      expect(reduceUnionType(input)).toBe("float");
    });
  });
});
