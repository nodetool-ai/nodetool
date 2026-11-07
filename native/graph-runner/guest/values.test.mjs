import assert from "node:assert/strict";
import { test } from "node:test";
import { fromJson, toJson } from "./values.mjs";

test("bytes preserve type and sliced contents across the kernel JSON boundary", () => {
  const backing = new Uint8Array([99, 0, 127, 255, 88]);
  const value = { image: { data: backing.subarray(1, 4) }, nested: [new Uint8Array()] };
  const wire = toJson(value);
  assert.deepEqual(JSON.parse(wire).image.data, { __bytes__: "AH//" });
  const back = fromJson(wire);
  assert.equal(back.image.data.constructor, Uint8Array);
  assert.deepEqual(Array.from(back.image.data), [0, 127, 255]);
  assert.equal(back.nested[0].constructor, Uint8Array);
  assert.equal(back.nested[0].length, 0);
});

test("Buffer and ordinary objects retain their boundary forms", () => {
  const result = fromJson(toJson({ bytes: Buffer.from([1, 2]), plain: { __bytes__: "AA==", other: true } }));
  assert.ok(Buffer.isBuffer(result.bytes));
  assert.deepEqual(Array.from(result.bytes), [1, 2]);
  assert.deepEqual(result.plain, { __bytes__: "AA==", other: true });
});
