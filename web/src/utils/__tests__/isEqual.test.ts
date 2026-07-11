import isEqual from "../isEqual";

describe("isEqual", () => {
  describe("primitives", () => {
    it("equal primitives", () => {
      expect(isEqual(1, 1)).toBe(true);
      expect(isEqual("a", "a")).toBe(true);
      expect(isEqual(true, true)).toBe(true);
      expect(isEqual(null, null)).toBe(true);
      expect(isEqual(undefined, undefined)).toBe(true);
    });

    it("unequal primitives", () => {
      expect(isEqual(1, 2)).toBe(false);
      expect(isEqual("a", "b")).toBe(false);
      expect(isEqual(true, false)).toBe(false);
      expect(isEqual(1, "1")).toBe(false);
      expect(isEqual(0, false)).toBe(false);
      expect(isEqual("", false)).toBe(false);
    });

    it("NaN equals NaN", () => {
      expect(isEqual(NaN, NaN)).toBe(true);
      expect(isEqual(NaN, 1)).toBe(false);
      expect(isEqual({ a: NaN }, { a: NaN })).toBe(true);
      expect(isEqual([NaN], [NaN])).toBe(true);
    });

    it("+0 equals -0 (fast-deep-equal semantics)", () => {
      expect(isEqual(0, -0)).toBe(true);
      expect(isEqual(-0, 0)).toBe(true);
    });

    it("null vs undefined vs {}", () => {
      expect(isEqual(null, undefined)).toBe(false);
      expect(isEqual(undefined, null)).toBe(false);
      expect(isEqual(null, {})).toBe(false);
      expect(isEqual({}, null)).toBe(false);
      expect(isEqual(undefined, {})).toBe(false);
      expect(isEqual({}, {})).toBe(true);
    });
  });

  describe("reference fast path", () => {
    it("same reference is equal", () => {
      const obj = { a: { b: 1 } };
      expect(isEqual(obj, obj)).toBe(true);
      const arr = [1, 2, 3];
      expect(isEqual(arr, arr)).toBe(true);
      const fn = () => 1;
      expect(isEqual(fn, fn)).toBe(true);
    });
  });

  describe("functions", () => {
    it("distinct functions are unequal even with same body", () => {
      expect(
        isEqual(
          () => 1,
          () => 1
        )
      ).toBe(false);
    });

    it("objects holding the same function reference are equal", () => {
      const fn = () => 1;
      expect(isEqual({ cb: fn }, { cb: fn })).toBe(true);
      expect(isEqual({ cb: fn }, { cb: () => 1 })).toBe(false);
    });
  });

  describe("arrays", () => {
    it("flat arrays", () => {
      expect(isEqual([1, 2, 3], [1, 2, 3])).toBe(true);
      expect(isEqual([1, 2, 3], [1, 2, 4])).toBe(false);
      expect(isEqual([1, 2, 3], [1, 2])).toBe(false);
      expect(isEqual([], [])).toBe(true);
    });

    it("nested arrays", () => {
      expect(isEqual([[1], [2, [3]]], [[1], [2, [3]]])).toBe(true);
      expect(isEqual([[1], [2, [3]]], [[1], [2, [4]]])).toBe(false);
    });

    it("array vs object", () => {
      expect(isEqual([1, 2], { 0: 1, 1: 2 })).toBe(false);
      expect(isEqual({ 0: 1, 1: 2 }, [1, 2])).toBe(false);
    });

    it("sparse vs dense", () => {
      // eslint-disable-next-line no-sparse-arrays
      expect(isEqual([, 1], [undefined, 1])).toBe(true);
    });
  });

  describe("plain objects", () => {
    it("deep equal objects", () => {
      expect(isEqual({ a: 1, b: { c: [1, 2] } }, { a: 1, b: { c: [1, 2] } })).toBe(
        true
      );
    });

    it("deep unequal objects", () => {
      expect(isEqual({ a: 1, b: { c: [1, 2] } }, { a: 1, b: { c: [1, 3] } })).toBe(
        false
      );
    });

    it("key order does not matter", () => {
      expect(isEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    });

    it("different key counts", () => {
      expect(isEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
      expect(isEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false);
    });

    it("same key count, different keys", () => {
      expect(isEqual({ a: 1 }, { b: 1 })).toBe(false);
    });

    it("undefined values vs missing keys are unequal", () => {
      expect(isEqual({ a: undefined }, {})).toBe(false);
    });
  });

  describe("Date", () => {
    it("equal timestamps", () => {
      expect(
        isEqual(new Date("2024-01-01T00:00:00Z"), new Date("2024-01-01T00:00:00Z"))
      ).toBe(true);
    });

    it("unequal timestamps", () => {
      expect(
        isEqual(new Date("2024-01-01T00:00:00Z"), new Date("2024-01-02T00:00:00Z"))
      ).toBe(false);
    });

    it("invalid dates equal each other", () => {
      expect(isEqual(new Date("nope"), new Date("also nope"))).toBe(true);
      expect(isEqual(new Date("nope"), new Date(0))).toBe(false);
    });

    it("Date vs equivalent number is unequal", () => {
      expect(isEqual(new Date(0), 0)).toBe(false);
    });
  });

  describe("RegExp", () => {
    it("same source and flags", () => {
      expect(isEqual(/abc/gi, /abc/gi)).toBe(true);
    });

    it("different flags", () => {
      expect(isEqual(/abc/g, /abc/i)).toBe(false);
    });

    it("different source", () => {
      expect(isEqual(/abc/, /abd/)).toBe(false);
    });
  });

  describe("Map", () => {
    it("equal maps", () => {
      expect(
        isEqual(
          new Map<string, unknown>([
            ["a", 1],
            ["b", { c: 2 }]
          ]),
          new Map<string, unknown>([
            ["b", { c: 2 }],
            ["a", 1]
          ])
        )
      ).toBe(true);
    });

    it("unequal values", () => {
      expect(isEqual(new Map([["a", 1]]), new Map([["a", 2]]))).toBe(false);
    });

    it("unequal keys / sizes", () => {
      expect(isEqual(new Map([["a", 1]]), new Map([["b", 1]]))).toBe(false);
      expect(
        isEqual(
          new Map([["a", 1]]),
          new Map([
            ["a", 1],
            ["b", 2]
          ])
        )
      ).toBe(false);
    });

    it("Map vs plain object is unequal", () => {
      expect(isEqual(new Map([["a", 1]]), { a: 1 })).toBe(false);
    });
  });

  describe("Set", () => {
    it("equal sets regardless of order", () => {
      expect(isEqual(new Set([1, 2, 3]), new Set([3, 2, 1]))).toBe(true);
    });

    it("unequal sets", () => {
      expect(isEqual(new Set([1, 2]), new Set([1, 3]))).toBe(false);
      expect(isEqual(new Set([1]), new Set([1, 2]))).toBe(false);
    });
  });

  describe("typed arrays", () => {
    it("equal typed arrays", () => {
      expect(isEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(
        true
      );
    });

    it("unequal contents or lengths", () => {
      expect(isEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(
        false
      );
      expect(isEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(
        false
      );
    });

    it("different typed-array kinds are unequal", () => {
      expect(isEqual(new Uint8Array([1]), new Int8Array([1]))).toBe(false);
    });
  });

  describe("mixed / real-world shapes", () => {
    it("ReactFlow-like node arrays", () => {
      const a = [
        { id: "1", position: { x: 0, y: 0 }, data: { props: { v: 1 } } },
        { id: "2", position: { x: 10, y: 5 }, data: { props: { v: NaN } } }
      ];
      const b = [
        { id: "1", position: { x: 0, y: 0 }, data: { props: { v: 1 } } },
        { id: "2", position: { x: 10, y: 5 }, data: { props: { v: NaN } } }
      ];
      expect(isEqual(a, b)).toBe(true);
      b[1].position.x = 11;
      expect(isEqual(a, b)).toBe(false);
    });

    it("object vs array of same content is unequal", () => {
      expect(isEqual({ length: 0 }, [])).toBe(false);
    });

    it("deeply nested null/undefined distinctions", () => {
      expect(isEqual({ a: { b: null } }, { a: { b: undefined } })).toBe(false);
      expect(isEqual({ a: { b: null } }, { a: { b: null } })).toBe(true);
    });
  });
});
