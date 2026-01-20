import reduceUnionType from "../reduceUnionType";
import { TypeMetadata } from "../../stores/ApiTypes";

describe("reduceUnionType", () => {
  const createType = (type: string, typeArgs?: TypeMetadata[]): TypeMetadata => ({
    type,
    optional: false,
    type_args: typeArgs ?? []
  });

  describe("non-union types", () => {
    it("returns string type as-is", () => {
      expect(reduceUnionType(createType("str"))).toBe("str");
    });

    it("returns int type as-is", () => {
      expect(reduceUnionType(createType("int"))).toBe("int");
    });

    it("returns float type as-is", () => {
      expect(reduceUnionType(createType("float"))).toBe("float");
    });

    it("returns tensor type as-is", () => {
      expect(reduceUnionType(createType("tensor"))).toBe("tensor");
    });

    it("returns bool type as-is", () => {
      expect(reduceUnionType(createType("bool"))).toBe("bool");
    });
  });

  describe("union types with type_args", () => {
    it("reduces int_float to float", () => {
      const type = createType("union", [createType("int"), createType("float")]);
      expect(reduceUnionType(type)).toBe("float");
    });

    it("reduces int_float_tensor to float", () => {
      const type = createType("union", [createType("int"), createType("float"), createType("tensor")]);
      expect(reduceUnionType(type)).toBe("float");
    });

    it("reduces str_text to str", () => {
      const type = createType("union", [createType("str"), createType("text")]);
      expect(reduceUnionType(type)).toBe("str");
    });

    it("reduces none_str to str", () => {
      const type = createType("union", [createType("none"), createType("str")]);
      expect(reduceUnionType(type)).toBe("str");
    });

    it("reduces none_str_text to str", () => {
      const type = createType("union", [createType("none"), createType("str"), createType("text")]);
      expect(reduceUnionType(type)).toBe("str");
    });

    it("reduces none_text to str", () => {
      const type = createType("union", [createType("none"), createType("text")]);
      expect(reduceUnionType(type)).toBe("str");
    });

    it("reduces int_none to int", () => {
      const type = createType("union", [createType("int"), createType("none")]);
      expect(reduceUnionType(type)).toBe("int");
    });

    it("reduces float_int_none to float", () => {
      const type = createType("union", [createType("float"), createType("int"), createType("none")]);
      expect(reduceUnionType(type)).toBe("float");
    });

    it("reduces float_none to float", () => {
      const type = createType("union", [createType("float"), createType("none")]);
      expect(reduceUnionType(type)).toBe("float");
    });
  });

  describe("union types without type_args", () => {
    it("defaults to str when type_args is undefined", () => {
      const type = {
        type: "union",
        optional: false,
        type_args: undefined
      } as unknown as TypeMetadata;
      expect(reduceUnionType(type)).toBe("str");
    });
  });

  describe("union types with no matching rule", () => {
    it("returns first type in sorted list for unrecognized combination", () => {
      const type = createType("union", [createType("tensor"), createType("audio")]);
      expect(reduceUnionType(type)).toBe("audio");
    });

    it("returns undefined when typeArgs list is empty", () => {
      const type = createType("union", []);
      expect(reduceUnionType(type)).toBeUndefined();
    });
  });

  describe("typeArgs sorting", () => {
    it("sorts typeArgs alphabetically before reducing", () => {
      const type = createType("union", [createType("float"), createType("int")]);
      expect(reduceUnionType(type)).toBe("float");
    });
  });
});
