import {
  ANY_TYPE,
  defaultValueForType,
  isTypedSlot,
  normalizeDynamicSlot,
  normalizeDynamicSlots,
  normalizeTypeMetadata,
  slotType,
  valueFitsType
} from "../dynamicSlots";

describe("normalizeTypeMetadata", () => {
  it("expands a bare type name", () => {
    expect(normalizeTypeMetadata("image")).toEqual({
      ...ANY_TYPE,
      type: "image"
    });
  });

  it("fills in the missing TypeMetadata fields", () => {
    expect(normalizeTypeMetadata({ type: "int" })).toEqual({
      type: "int",
      optional: false,
      values: null,
      type_args: [],
      type_name: null
    });
  });

  it("folds a JSON-schema `enum` into `values`", () => {
    expect(
      normalizeTypeMetadata({ type: "str", enum: ["a", "b"] }).values
    ).toEqual(["a", "b"]);
  });

  it("normalizes nested type_args", () => {
    const meta = normalizeTypeMetadata({
      type: "list",
      type_args: [{ type: "image" }]
    });
    expect(meta.type_args[0]).toEqual({ ...ANY_TYPE, type: "image" });
  });

  it("falls back to `any` for junk", () => {
    expect(normalizeTypeMetadata(undefined)).toEqual(ANY_TYPE);
  });
});

describe("normalizeDynamicSlot", () => {
  it("passes through the declaration shape", () => {
    const slot = normalizeDynamicSlot({
      type: { type: "image", optional: true, type_args: [] },
      description: "a picture",
      default: null,
      required: true,
      min: 1,
      max: 4
    });
    expect(slot).toEqual({
      type: {
        type: "image",
        optional: true,
        values: null,
        type_args: [],
        type_name: null
      },
      description: "a picture",
      default: null,
      required: true,
      min: 1,
      max: 4
    });
  });

  it("lifts the flat resolver shape into a declaration", () => {
    // What FAL/Kie/Replicate/Comfy resolvers emit today.
    const slot = normalizeDynamicSlot({
      type: "float",
      optional: true,
      type_args: [],
      description: "guidance",
      min: 0,
      max: 20,
      default: 3.5
    });
    expect(slot.type).toEqual({
      type: "float",
      optional: true,
      values: null,
      type_args: [],
      type_name: null
    });
    expect(slot).toMatchObject({
      description: "guidance",
      min: 0,
      max: 20,
      default: 3.5
    });
  });

  it("normalizes a whole map", () => {
    expect(
      normalizeDynamicSlots({ a: { type: "str" }, b: { type: { type: "int" } } })
    ).toEqual({
      a: { type: { ...ANY_TYPE, type: "str" } },
      b: { type: { ...ANY_TYPE, type: "int" } }
    });
  });

  it("treats an empty/absent map as no slots", () => {
    expect(normalizeDynamicSlots(undefined)).toEqual({});
  });
});

describe("slotType / isTypedSlot", () => {
  it("resolves an undeclared slot to `any`", () => {
    expect(slotType(undefined)).toEqual(ANY_TYPE);
    expect(isTypedSlot(undefined)).toBe(false);
  });

  it("treats an explicit `any` declaration as untyped", () => {
    expect(isTypedSlot({ type: ANY_TYPE })).toBe(false);
  });

  it("treats a real type as typed, in either shape", () => {
    expect(isTypedSlot({ type: { ...ANY_TYPE, type: "image" } })).toBe(true);
    expect(isTypedSlot({ type: "image", type_args: [] })).toBe(true);
  });
});

describe("defaultValueForType", () => {
  it.each([
    ["str", ""],
    ["any", ""],
    ["int", 0],
    ["float", 0],
    ["bool", false]
  ])("seeds %s with %p", (type, expected) => {
    expect(defaultValueForType({ ...ANY_TYPE, type })).toEqual(expected);
  });

  it("seeds list and dict with empty containers", () => {
    expect(defaultValueForType({ ...ANY_TYPE, type: "list" })).toEqual([]);
    expect(defaultValueForType({ ...ANY_TYPE, type: "dict" })).toEqual({});
  });

  it("seeds asset refs with null", () => {
    expect(defaultValueForType({ ...ANY_TYPE, type: "image" })).toBeNull();
  });
});

describe("valueFitsType", () => {
  const t = (type: string) => ({ ...ANY_TYPE, type });

  it("accepts an empty value for any type", () => {
    expect(valueFitsType(null, t("image"))).toBe(true);
    expect(valueFitsType(undefined, t("image"))).toBe(true);
  });

  it("reads a tagged ref by its own type, not as a plain object", () => {
    expect(valueFitsType({ type: "image", uri: "x" }, t("image"))).toBe(true);
    expect(valueFitsType({ type: "image", uri: "x" }, t("audio"))).toBe(false);
    expect(valueFitsType({ type: "dataframe" }, t("image"))).toBe(false);
  });

  it("matches the runner on scalars", () => {
    expect(valueFitsType("hi", t("str"))).toBe(true);
    expect(valueFitsType("hi", t("image"))).toBe(false);
    expect(valueFitsType(7, t("float"))).toBe(true);
    expect(valueFitsType(7, t("str"))).toBe(false);
    expect(valueFitsType(false, t("bool"))).toBe(true);
  });

  it("accepts anything for an `any` slot", () => {
    expect(valueFitsType({ type: "image" }, ANY_TYPE)).toBe(true);
  });

  it("compares list element types", () => {
    const listOf = (inner: string) => ({
      ...ANY_TYPE,
      type: "list",
      type_args: [t(inner)]
    });
    expect(valueFitsType(["a"], listOf("str"))).toBe(true);
    expect(valueFitsType(["a"], listOf("image"))).toBe(false);
    expect(valueFitsType([], listOf("image"))).toBe(true);
  });
});
