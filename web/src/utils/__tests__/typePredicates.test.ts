import {
  isArray,
  isBoolean,
  isFiniteNumber,
  isFunction,
  isNonEmptyString,
  isNumber,
  isObjectLike,
  isRecord,
  isString
} from "../typePredicates";

const samples = {
  string: "text",
  emptyString: "",
  number: 1,
  zero: 0,
  nan: NaN,
  infinity: Infinity,
  boolean: false,
  null: null,
  undefined: undefined,
  array: [1, 2],
  object: { a: 1 },
  function: () => 1
};

const accepted = (predicate: (value: unknown) => boolean) =>
  Object.entries(samples)
    .filter(([, value]) => predicate(value))
    .map(([name]) => name);

describe("typePredicates", () => {
  it("isString accepts every string, including the empty one", () => {
    expect(accepted(isString)).toEqual(["string", "emptyString"]);
  });

  it("isNonEmptyString rejects the empty string", () => {
    expect(accepted(isNonEmptyString)).toEqual(["string"]);
  });

  it("isNumber accepts NaN and the infinities", () => {
    expect(accepted(isNumber)).toEqual(["number", "zero", "nan", "infinity"]);
  });

  it("isFiniteNumber excludes NaN and the infinities", () => {
    expect(accepted(isFiniteNumber)).toEqual(["number", "zero"]);
  });

  it("isFiniteNumber rejects numeric strings", () => {
    expect(isFiniteNumber("1")).toBe(false);
  });

  it("isBoolean accepts only booleans", () => {
    expect(accepted(isBoolean)).toEqual(["boolean"]);
  });

  it("isArray accepts only arrays", () => {
    expect(accepted(isArray)).toEqual(["array"]);
  });

  it("isRecord rejects null and arrays", () => {
    expect(accepted(isRecord)).toEqual(["object"]);
  });

  it("isObjectLike accepts arrays but not null", () => {
    expect(accepted(isObjectLike)).toEqual(["array", "object"]);
  });

  it("isFunction accepts only functions", () => {
    expect(accepted(isFunction)).toEqual(["function"]);
  });

  it("narrows unknown values so their members can be read", () => {
    const value: unknown = { count: 2 };
    if (isRecord(value) && isFiniteNumber(value.count)) {
      expect(value.count + 1).toBe(3);
    } else {
      throw new Error("expected the value to narrow");
    }
  });
});
