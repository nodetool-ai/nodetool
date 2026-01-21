import reduceUnionType from "../reduceUnionType";
import { TypeMetadata } from "../../stores/ApiTypes";

const createType = (type: string, typeArgs?: TypeMetadata[]): TypeMetadata => ({
  type,
  optional: false,
  type_args: typeArgs ?? []
});

describe("reduceUnionType", () => {
  describe("non-union types", () => {
    it("returns str type as is", () => {
      expect(reduceUnionType(createType("str"))).toBe("str");
    });

    it("returns int type as is", () => {
      expect(reduceUnionType(createType("int"))).toBe("int");
    });

    it("returns float type as is", () => {
      expect(reduceUnionType(createType("float"))).toBe("float");
    });

    it("returns tensor type as is", () => {
      expect(reduceUnionType(createType("tensor"))).toBe("tensor");
    });

    it("returns text type as is", () => {
      expect(reduceUnionType(createType("text"))).toBe("text");
    });
  });

  describe("union types with type_args", () => {
    it("reduces int_float to float", () => {
      const type = createType("union", [
        createType("int"),
        createType("float")
      ]);
      expect(reduceUnionType(type)).toBe("float");
    });

    it("reduces int_float_tensor to float", () => {
      const type = createType("union", [
        createType("int"),
        createType("float"),
        createType("tensor")
      ]);
      expect(reduceUnionType(type)).toBe("float");
    });

    it("reduces none_str to str", () => {
      const type = createType("union", [
        createType("none"),
        createType("str")
      ]);
      expect(reduceUnionType(type)).toBe("str");
    });

    it("reduces none_str_text to str", () => {
      const type = createType("union", [
        createType("none"),
        createType("str"),
        createType("text")
      ]);
      expect(reduceUnionType(type)).toBe("str");
    });

    it("reduces none_text to str", () => {
      const type = createType("union", [
        createType("none"),
        createType("text")
      ]);
      expect(reduceUnionType(type)).toBe("str");
    });

    it("reduces int_none to int", () => {
      const type = createType("union", [
        createType("int"),
        createType("none")
      ]);
      expect(reduceUnionType(type)).toBe("int");
    });

    it("reduces float_int_none to float", () => {
      const type = createType("union", [
        createType("float"),
        createType("int"),
        createType("none")
      ]);
      expect(reduceUnionType(type)).toBe("float");
    });

    it("reduces float_none to float", () => {
      const type = createType("union", [
        createType("float"),
        createType("none")
      ]);
      expect(reduceUnionType(type)).toBe("float");
    });

    it("reduces str_text to str", () => {
      const type = createType("union", [
        createType("str"),
        createType("text")
      ]);
      expect(reduceUnionType(type)).toBe("str");
    });
  });

  describe("union types without matching rules", () => {
    it("returns first type argument when no rule matches (after sorting)", () => {
      const type = createType("union", [
        createType("tensor"),
        createType("image")
      ]);
      expect(reduceUnionType(type)).toBe("image");
    });

    it("returns first type when order is different", () => {
      const type = createType("union", [
        createType("tensor"),
        createType("int"),
        createType("float")
      ]);
      expect(reduceUnionType(type)).toBe("float");
    });
  });

  describe("union types without type_args", () => {
    it("returns str when type_args is empty array", () => {
      const type: TypeMetadata = {
        type: "union",
        optional: false,
        type_args: []
      };
      expect(reduceUnionType(type)).toBe("str");
    });
  });
});
