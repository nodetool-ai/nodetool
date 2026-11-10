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

test("typed arrays and ArrayBuffer keep their type across the boundary", () => {
  const floats = new Float32Array([1.5, -2.25, 3]);
  const sliced = new Int16Array([1, 2, 3, 4]).subarray(1, 3);
  const buffer = new Uint8Array([7, 8, 9]).buffer;
  const back = fromJson(toJson({ floats, sliced, buffer, big: new BigInt64Array([-5n]), view: new DataView(buffer, 1, 2) }));
  assert.equal(back.floats.constructor, Float32Array);
  assert.deepEqual(Array.from(back.floats), [1.5, -2.25, 3]);
  assert.equal(back.sliced.constructor, Int16Array);
  assert.deepEqual(Array.from(back.sliced), [2, 3]);
  assert.ok(back.buffer instanceof ArrayBuffer);
  assert.deepEqual(Array.from(new Uint8Array(back.buffer)), [7, 8, 9]);
  assert.equal(back.big.constructor, BigInt64Array);
  assert.equal(back.big[0], -5n);
  assert.ok(back.view instanceof DataView);
  assert.equal(back.view.byteLength, 2);
  assert.equal(back.view.getUint8(0), 8);
});

test("an object that only looks like a typed array tag stays plain", () => {
  const plain = { __typed__: "Float32Array", data: "AAAA", extra: 1 };
  assert.deepEqual(fromJson(toJson({ plain })).plain, plain);
});
