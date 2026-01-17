import reduceUnionType from "../reduceUnionType";
import { TypeMetadata } from "../stores/ApiTypes";

describe("reduceUnionType", () => {
  it("returns the same type for non-union types", () => {
    const type: TypeMetadata = { type: "str" };
    expect(reduceUnionType(type)).toBe("str");
  });

  it("returns int for int type", () => {
    const type: TypeMetadata = { type: "int" };
    expect(reduceUnionType(type)).toBe("int");
  });

  it("returns float for float type", () => {
    const type: TypeMetadata = { type: "float" };
    expect(reduceUnionType(type)).toBe("float");
  });

  it("returns bool for bool type", () => {
    const type: TypeMetadata = { type: "bool" };
    expect(reduceUnionType(type)).toBe("bool");
  });

  it("returns image for image type", () => {
    const type: TypeMetadata = { type: "image" };
    expect(reduceUnionType(type)).toBe("image");
  });

  it("reduces int_float union to float", () => {
    const type: TypeMetadata = {
      type: "union",
      type_args: [
        { type: "int" },
        { type: "float" }
      ]
    };
    expect(reduceUnionType(type)).toBe("float");
  });

  it("reduces str_text union to str", () => {
    const type: TypeMetadata = {
      type: "union",
      type_args: [
        { type: "str" },
        { type: "text" }
      ]
    };
    expect(reduceUnionType(type)).toBe("str");
  });

  it("reduces int_float_tensor union to float", () => {
    const type: TypeMetadata = {
      type: "union",
      type_args: [
        { type: "int" },
        { type: "float" },
        { type: "tensor" }
      ]
    };
    expect(reduceUnionType(type)).toBe("float");
  });

  it("reduces none_str union to str", () => {
    const type: TypeMetadata = {
      type: "union",
      type_args: [
        { type: "none" },
        { type: "str" }
      ]
    };
    expect(reduceUnionType(type)).toBe("str");
  });

  it("reduces none_text union to str", () => {
    const type: TypeMetadata = {
      type: "union",
      type_args: [
        { type: "none" },
        { type: "text" }
      ]
    };
    expect(reduceUnionType(type)).toBe("str");
  });

  it("reduces int_none union to int", () => {
    const type: TypeMetadata = {
      type: "union",
      type_args: [
        { type: "int" },
        { type: "none" }
      ]
    };
    expect(reduceUnionType(type)).toBe("int");
  });

  it("reduces float_int_none union to float", () => {
    const type: TypeMetadata = {
      type: "union",
      type_args: [
        { type: "float" },
        { type: "int" },
        { type: "none" }
      ]
    };
    expect(reduceUnionType(type)).toBe("float");
  });

  it("reduces float_none union to float", () => {
    const type: TypeMetadata = {
      type: "union",
      type_args: [
        { type: "float" },
        { type: "none" }
      ]
    };
    expect(reduceUnionType(type)).toBe("float");
  });

  it("returns first type for unknown union combinations", () => {
    const type: TypeMetadata = {
      type: "union",
      type_args: [
        { type: "image" },
        { type: "video" }
      ]
    };
    expect(reduceUnionType(type)).toBe("image");
  });

  it("returns str for union with undefined type_args", () => {
    const type: TypeMetadata = {
      type: "union",
      type_args: undefined
    };
    expect(reduceUnionType(type)).toBe("str");
  });

  it("handles union with single type arg", () => {
    const type: TypeMetadata = {
      type: "union",
      type_args: [
        { type: "str" }
      ]
    };
    expect(reduceUnionType(type)).toBe("str");
  });

  it("handles empty type_args array", () => {
    const type: TypeMetadata = {
      type: "union",
      type_args: []
    };
    expect(reduceUnionType(type)).toBeUndefined();
  });

  it("sorts type args alphabetically before checking rules", () => {
    const type: TypeMetadata = {
      type: "union",
      type_args: [
        { type: "float" },
        { type: "int" }
      ]
    };
    expect(reduceUnionType(type)).toBe("float");
  });

  it("handles complex nested types", () => {
    const type: TypeMetadata = {
      type: "union",
      type_args: [
        { type: "tensor", type_args: [{ type: "int" }] },
        { type: "tensor", type_args: [{ type: "float" }] }
      ]
    };
    expect(reduceUnionType(type)).toBe("tensor");
  });
});
