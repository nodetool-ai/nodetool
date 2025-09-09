import { describe, it, expect } from "@jest/globals";
import { typeToString, Slugify, valueMatchesType, isConnectable } from "../TypeHandler";
import { TypeMetadata } from "../../stores/ApiTypes";

describe("TypeHandler", () => {
  describe("typeToString", () => {
    it("should convert 'any' type to string", () => {
      const type: TypeMetadata = { type: "any" };
      expect(typeToString(type)).toBe("any");
    });

    it("should convert 'str' type to string", () => {
      const type: TypeMetadata = { type: "str" };
      expect(typeToString(type)).toBe("str");
    });

    it("should convert 'number' type to string", () => {
      const type: TypeMetadata = { type: "number" };
      expect(typeToString(type)).toBe("number");
    });

    it("should convert 'boolean' type to string", () => {
      const type: TypeMetadata = { type: "boolean" };
      expect(typeToString(type)).toBe("boolean");
    });

    it("should convert 'enum' type with values to string", () => {
      const type: TypeMetadata = { type: "enum", values: ["A", "B", "C"] };
      expect(typeToString(type)).toBe("A | B | C");
    });

    it("should convert 'enum' type without values to string", () => {
      const type: TypeMetadata = { type: "enum" };
      expect(typeToString(type)).toBe("enum");
    });

    it("should convert 'list' type with type args to string", () => {
      const type: TypeMetadata = {
        type: "list",
        type_args: [{ type: "str" }]
      };
      expect(typeToString(type)).toBe("str[]");
    });

    it("should convert 'list' type without type args to string", () => {
      const type: TypeMetadata = { type: "list" };
      expect(typeToString(type)).toBe("list");
    });

    it("should convert nested 'list' type to string", () => {
      const type: TypeMetadata = {
        type: "list",
        type_args: [{ type: "list", type_args: [{ type: "number" }] }]
      };
      expect(typeToString(type)).toBe("number[][]");
    });

    it("should convert 'dict' type with type args to string", () => {
      const type: TypeMetadata = {
        type: "dict",
        type_args: [{ type: "str" }, { type: "number" }]
      };
      expect(typeToString(type)).toBe("{ str: number }");
    });

    it("should convert 'dict' type without type args to string", () => {
      const type: TypeMetadata = { type: "dict" };
      expect(typeToString(type)).toBe("dict");
    });

    it("should convert 'union' type to string", () => {
      const type: TypeMetadata = {
        type: "union",
        type_args: [{ type: "str" }, { type: "number" }, { type: "boolean" }]
      };
      expect(typeToString(type)).toBe("str | number | boolean");
    });

    it("should convert 'union' type without args to string", () => {
      const type: TypeMetadata = { type: "union" };
      expect(typeToString(type)).toBe("union");
    });

    it("should handle custom types", () => {
      const type: TypeMetadata = { type: "CustomType" };
      expect(typeToString(type)).toBe("CustomType");
    });

    it("should handle complex nested types", () => {
      const type: TypeMetadata = {
        type: "dict",
        type_args: [
          { type: "str" },
          {
            type: "list",
            type_args: [
              {
                type: "union",
                type_args: [{ type: "str" }, { type: "number" }]
              }
            ]
          }
        ]
      };
      expect(typeToString(type)).toBe("{ str: str | number[] }");
    });
  });

  describe("Slugify", () => {
    it("should convert dots to underscores", () => {
      expect(Slugify("hello.world")).toBe("hello_world");
    });

    it("should convert dashes to underscores", () => {
      expect(Slugify("hello-world")).toBe("hello_world");
    });

    it("should convert to lowercase", () => {
      expect(Slugify("HelloWorld")).toBe("helloworld");
    });

    it("should handle multiple dots and dashes", () => {
      expect(Slugify("hello.world-test.case")).toBe("hello_world_test_case");
    });

    it("should handle empty string", () => {
      expect(Slugify("")).toBe("");
    });

    it("should handle mixed case with special characters", () => {
      expect(Slugify("MyApp.Component-Name")).toBe("myapp_component_name");
    });

    it("should leave underscores unchanged", () => {
      expect(Slugify("hello_world")).toBe("hello_world");
    });

    it("should handle numbers", () => {
      expect(Slugify("test123.component-456")).toBe("test123_component_456");
    });
  });

  describe("valueMatchesType", () => {
    describe("basic types", () => {
      it("should match 'any' type with any value", () => {
        const type: TypeMetadata = { type: "any" };
        expect(valueMatchesType("string", type)).toBe(true);
        expect(valueMatchesType(123, type)).toBe(true);
        expect(valueMatchesType(true, type)).toBe(true);
        expect(valueMatchesType(null, type)).toBe(true);
        expect(valueMatchesType({}, type)).toBe(true);
        expect(valueMatchesType([], type)).toBe(true);
      });

      it("should match 'null' type", () => {
        const type: TypeMetadata = { type: "null" };
        expect(valueMatchesType(null, type)).toBe(true);
        expect(valueMatchesType(undefined, type)).toBe(false);
        expect(valueMatchesType("", type)).toBe(false);
        expect(valueMatchesType(0, type)).toBe(false);
      });

      it("should match 'str' type", () => {
        const type: TypeMetadata = { type: "str" };
        expect(valueMatchesType("hello", type)).toBe(true);
        expect(valueMatchesType("", type)).toBe(true);
        expect(valueMatchesType(123, type)).toBe(false);
        expect(valueMatchesType(null, type)).toBe(false);
      });

      it("should match 'number' type", () => {
        const type: TypeMetadata = { type: "number" };
        expect(valueMatchesType(123, type)).toBe(true);
        expect(valueMatchesType(0, type)).toBe(true);
        expect(valueMatchesType(-456.78, type)).toBe(true);
        expect(valueMatchesType(NaN, type)).toBe(false);
        expect(valueMatchesType(Infinity, type)).toBe(false);
        expect(valueMatchesType("123", type)).toBe(false);
      });

      it("should match 'boolean' type", () => {
        const type: TypeMetadata = { type: "boolean" };
        expect(valueMatchesType(true, type)).toBe(true);
        expect(valueMatchesType(false, type)).toBe(true);
        expect(valueMatchesType(1, type)).toBe(false);
        expect(valueMatchesType("true", type)).toBe(false);
      });
    });

    describe("optional types", () => {
      it("should handle optional types", () => {
        const type: TypeMetadata = { type: "str", optional: true };
        expect(valueMatchesType(undefined, type)).toBe(true);
        expect(valueMatchesType("hello", type)).toBe(true);
        expect(valueMatchesType(null, type)).toBe(false);
      });

      it("should reject undefined for non-optional types", () => {
        const type: TypeMetadata = { type: "str" };
        expect(valueMatchesType(undefined, type)).toBe(false);
      });
    });

    describe("enum types", () => {
      it("should match enum values", () => {
        const type: TypeMetadata = { type: "enum", values: ["A", "B", "C"] };
        expect(valueMatchesType("A", type)).toBe(true);
        expect(valueMatchesType("B", type)).toBe(true);
        expect(valueMatchesType("C", type)).toBe(true);
        expect(valueMatchesType("D", type)).toBe(false);
        expect(valueMatchesType(123, type)).toBe(false);
      });

      it("should handle enum without values", () => {
        const type: TypeMetadata = { type: "enum" };
        expect(valueMatchesType("anything", type)).toBe(true);
        expect(valueMatchesType(123, type)).toBe(false);
      });
    });

    describe("list types", () => {
      it("should match typed lists", () => {
        const type: TypeMetadata = {
          type: "list",
          type_args: [{ type: "str" }]
        };
        expect(valueMatchesType(["a", "b", "c"], type)).toBe(true);
        expect(valueMatchesType([], type)).toBe(true);
        expect(valueMatchesType(["a", 1, "c"], type)).toBe(false);
        expect(valueMatchesType("not an array", type)).toBe(false);
      });

      it("should match untyped lists", () => {
        const type: TypeMetadata = { type: "list" };
        expect(valueMatchesType([1, "a", true], type)).toBe(true);
        expect(valueMatchesType([], type)).toBe(true);
        expect(valueMatchesType("not an array", type)).toBe(false);
      });

      it("should match nested lists", () => {
        const type: TypeMetadata = {
          type: "list",
          type_args: [{ type: "list", type_args: [{ type: "number" }] }]
        };
        expect(valueMatchesType([[1, 2], [3, 4]], type)).toBe(true);
        expect(valueMatchesType([[1, "2"]], type)).toBe(false);
      });
    });

    describe("tuple types", () => {
      it("should match tuples with correct types", () => {
        const type: TypeMetadata = {
          type: "tuple",
          type_args: [{ type: "str" }, { type: "number" }, { type: "boolean" }]
        };
        expect(valueMatchesType(["hello", 123, true], type)).toBe(true);
        expect(valueMatchesType(["hello", 123, false], type)).toBe(true);
      });

      it("should reject tuples with wrong length", () => {
        const type: TypeMetadata = {
          type: "tuple",
          type_args: [{ type: "str" }, { type: "number" }]
        };
        expect(valueMatchesType(["hello"], type)).toBe(false);
        expect(valueMatchesType(["hello", 123, "extra"], type)).toBe(false);
      });

      it("should reject tuples with wrong types", () => {
        const type: TypeMetadata = {
          type: "tuple",
          type_args: [{ type: "str" }, { type: "number" }]
        };
        expect(valueMatchesType([123, "hello"], type)).toBe(false);
      });
    });

    describe("dict types", () => {
      it("should match typed dicts", () => {
        const type: TypeMetadata = {
          type: "dict",
          type_args: [{ type: "str" }, { type: "number" }]
        };
        expect(valueMatchesType({ a: 1, b: 2 }, type)).toBe(true);
        expect(valueMatchesType({}, type)).toBe(true);
        expect(valueMatchesType({ a: "not a number" }, type)).toBe(false);
      });

      it("should match Map objects", () => {
        const type: TypeMetadata = {
          type: "dict",
          type_args: [{ type: "str" }, { type: "number" }]
        };
        const map = new Map([["a", 1], ["b", 2]]);
        expect(valueMatchesType(map, type)).toBe(true);
      });

      it("should reject non-object values for dict", () => {
        const type: TypeMetadata = { type: "dict" };
        expect(valueMatchesType("not an object", type)).toBe(false);
        expect(valueMatchesType(123, type)).toBe(false);
        expect(valueMatchesType([], type)).toBe(false);
      });
    });

    describe("union types", () => {
      it("should match any type in union", () => {
        const type: TypeMetadata = {
          type: "union",
          type_args: [{ type: "str" }, { type: "number" }]
        };
        expect(valueMatchesType("hello", type)).toBe(true);
        expect(valueMatchesType(123, type)).toBe(true);
        expect(valueMatchesType(true, type)).toBe(false);
      });

      it("should handle empty union", () => {
        const type: TypeMetadata = { type: "union", type_args: [] };
        expect(valueMatchesType("anything", type)).toBe(false);
      });
    });

    describe("object types", () => {
      it("should match plain objects", () => {
        const type: TypeMetadata = { type: "object" };
        expect(valueMatchesType({}, type)).toBe(true);
        expect(valueMatchesType({ a: 1 }, type)).toBe(true);
        expect(valueMatchesType([], type)).toBe(false);
        expect(valueMatchesType(null, type)).toBe(false);
        expect(valueMatchesType("string", type)).toBe(false);
      });
    });

    describe("edge cases", () => {
      it("should return false for undefined type", () => {
        expect(valueMatchesType("value", undefined)).toBe(false);
      });

      it("should return false for type without type property", () => {
        expect(valueMatchesType("value", {} as TypeMetadata)).toBe(false);
      });

      it("should handle custom types as objects", () => {
        const type: TypeMetadata = { type: "CustomType" };
        expect(valueMatchesType({}, type)).toBe(true);
        expect(valueMatchesType("string", type)).toBe(false);
      });
    });
  });

  describe("isConnectable", () => {
    it("should connect any type when allowAny is true", () => {
      const any: TypeMetadata = { type: "any" };
      const str: TypeMetadata = { type: "str" };
      expect(isConnectable(any, str)).toBe(true);
      expect(isConnectable(str, any)).toBe(true);
    });

    it("should not connect any type when allowAny is false", () => {
      const any: TypeMetadata = { type: "any" };
      const str: TypeMetadata = { type: "str" };
      expect(isConnectable(any, str, false)).toBe(false);
      expect(isConnectable(str, any, false)).toBe(false);
    });

    it("should connect same types", () => {
      const str1: TypeMetadata = { type: "str" };
      const str2: TypeMetadata = { type: "str" };
      expect(isConnectable(str1, str2)).toBe(true);
    });

    it("should not connect different basic types", () => {
      const str: TypeMetadata = { type: "str" };
      const num: TypeMetadata = { type: "number" };
      expect(isConnectable(str, num)).toBe(false);
    });

    it("should connect union types", () => {
      const union: TypeMetadata = {
        type: "union",
        type_args: [{ type: "str" }, { type: "number" }]
      };
      const str: TypeMetadata = { type: "str" };
      expect(isConnectable(union, str)).toBe(true);
      expect(isConnectable(str, union)).toBe(true);
    });

    it("should connect lists with compatible types", () => {
      const list1: TypeMetadata = {
        type: "list",
        type_args: [{ type: "str" }]
      };
      const list2: TypeMetadata = {
        type: "list",
        type_args: [{ type: "str" }]
      };
      expect(isConnectable(list1, list2)).toBe(true);
    });

    it("should not connect lists with incompatible types", () => {
      const list1: TypeMetadata = {
        type: "list",
        type_args: [{ type: "str" }]
      };
      const list2: TypeMetadata = {
        type: "list",
        type_args: [{ type: "number" }]
      };
      expect(isConnectable(list1, list2)).toBe(false);
    });

    it("should connect dicts with compatible types", () => {
      const dict1: TypeMetadata = {
        type: "dict",
        type_args: [{ type: "str" }, { type: "number" }]
      };
      const dict2: TypeMetadata = {
        type: "dict",
        type_args: [{ type: "str" }, { type: "number" }]
      };
      expect(isConnectable(dict1, dict2)).toBe(true);
    });

    it("should connect enum to str", () => {
      const enumType: TypeMetadata = { type: "enum", values: ["A", "B"] };
      const str: TypeMetadata = { type: "str" };
      expect(isConnectable(enumType, str)).toBe(true);
    });

    it("should connect str to enum", () => {
      const str: TypeMetadata = { type: "str" };
      const enumType: TypeMetadata = { type: "enum", values: ["A", "B"] };
      expect(isConnectable(str, enumType)).toBe(true);
    });

    it("should connect object types properly", () => {
      const obj: TypeMetadata = { type: "object" };
      const customType: TypeMetadata = { type: "CustomType" };
      expect(isConnectable(customType, obj)).toBe(true);
      
      const str: TypeMetadata = { type: "str" };
      expect(isConnectable(str, obj)).toBe(false);
    });

    it("should handle undefined types safely", () => {
      const str: TypeMetadata = { type: "str" };
      expect(isConnectable(undefined as any, str)).toBe(false);
      expect(isConnectable(str, undefined as any)).toBe(false);
    });

    it("should handle empty lists", () => {
      const list1: TypeMetadata = { type: "list", type_args: [] };
      const list2: TypeMetadata = { type: "list", type_args: [] };
      expect(isConnectable(list1, list2)).toBe(true);
    });

    it("should handle empty dicts", () => {
      const dict1: TypeMetadata = { type: "dict", type_args: [] };
      const dict2: TypeMetadata = { type: "dict", type_args: [] };
      expect(isConnectable(dict1, dict2)).toBe(true);
    });
  });
});