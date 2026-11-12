import assert from "node:assert/strict";
import { test } from "node:test";
import { fromJson, fromReply, fromWire, toJson, toWire, wireReply } from "./values.mjs";

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

// A stand-in for the kernel's __host.blob: copies the bytes at the call, as
// the kernel does, and gives the list fromWire reads.
function withKernel(run) {
  const dropped = [];
  globalThis.__host = {
    blob: (bytes) => ({ copy: new Uint8Array(bytes instanceof ArrayBuffer ? bytes.slice(0) : bytes.slice().buffer) }),
    dropBlobs: (blobs) => dropped.push(...blobs),
  };
  try {
    return run(dropped);
  } finally {
    delete globalThis.__host;
  }
}
const delivered = (blobs) => blobs?.map((blob) => new Uint8Array(blob.copy));

test("a value for the kernel keeps its bytes out of the text", () => {
  withKernel(() => {
    const floats = new Float32Array([1.5, -2.25]);
    const sliced = new Uint8Array([9, 1, 2, 3, 9]).subarray(1, 4);
    const buffer = new Uint8Array([7, 8, 9]).buffer;
    const value = { floats, sliced, buffer, node: Buffer.from([4, 5]), view: new DataView(buffer, 1, 2), big: new BigUint64Array([7n]), list: [new Uint8Array(0), "text"] };
    const wire = toWire(value);
    assert.equal(wire.blobs.length, 7);
    assert.ok(!wire.text.includes("__bytes__"));
    assert.deepEqual(JSON.parse(wire.text), {
      floats: { __typed__: "Float32Array", __blob__: 0 },
      sliced: { __blob__: 1 },
      buffer: { __typed__: "ArrayBuffer", __blob__: 2 },
      node: { __blob__: 3, __buffer__: true },
      view: { __typed__: "DataView", __blob__: 4 },
      big: { __typed__: "BigUint64Array", __blob__: 5 },
      list: [{ __blob__: 6 }, "text"],
    });
    // The kernel's copy was made at the call: a later write does not reach it.
    sliced.fill(0);
    const back = fromWire(wire.text, delivered(wire.blobs));
    assert.equal(back.floats.constructor, Float32Array);
    assert.deepEqual(Array.from(back.floats), [1.5, -2.25]);
    assert.equal(back.sliced.constructor, Uint8Array);
    assert.deepEqual(Array.from(back.sliced), [1, 2, 3]);
    assert.ok(back.buffer instanceof ArrayBuffer);
    assert.deepEqual(Array.from(new Uint8Array(back.buffer)), [7, 8, 9]);
    assert.ok(Buffer.isBuffer(back.node));
    assert.deepEqual(Array.from(back.node), [4, 5]);
    assert.ok(back.view instanceof DataView);
    assert.equal(back.view.getUint8(1), 9);
    assert.equal(back.big[0], 7n);
    assert.equal(back.list[0].length, 0);
    assert.equal(back.list[1], "text");
  });
});

test("a value without bytes is plain text, and base64 from a host still turns into bytes", () => {
  withKernel(() => {
    assert.equal(wireReply({ ok: true, value: [1, "a"] }), '{"ok":true,"value":[1,"a"]}');
    assert.deepEqual(toWire(undefined), { text: undefined, blobs: undefined });
    assert.deepEqual(Array.from(fromReply('{"__bytes__":"AQI="}')), [1, 2]);
    const mixed = fromWire('{"a":{"__blob__":0},"b":{"__bytes__":"AQI="}}', [new Uint8Array([5])]);
    assert.deepEqual(Array.from(mixed.a), [5]);
    assert.deepEqual(Array.from(mixed.b), [1, 2]);
    const reply = wireReply({ ok: true, value: new Uint8Array([3]) });
    assert.deepEqual(Array.from(fromReply({ text: reply.text, blobs: delivered(reply.blobs) }).value), [3]);
  });
});

test("an object with a __blob__ key of its own sends the value as base64", () => {
  withKernel((dropped) => {
    const value = { bytes: new Uint8Array([1, 2]), plain: { __blob__: 0 } };
    const wire = toWire(value);
    assert.equal(wire.blobs, undefined);
    assert.equal(wire.text, '{"bytes":{"__bytes__":"AQI="},"plain":{"__blob__":0}}');
    assert.equal(dropped.length, 1);
    const back = fromWire(wire.text, undefined);
    assert.deepEqual(Array.from(back.bytes), [1, 2]);
    assert.deepEqual(back.plain, { __blob__: 0 });
    // Markers the kernel kept the bytes of pass through as plain objects.
    assert.equal(wireReply(fromWire('{"input":{"__typed__":"Int8Array","__blob__":3}}', undefined)), '{"input":{"__typed__":"Int8Array","__blob__":3}}');
  });
});

test("without a kernel the value travels as base64", () => {
  assert.deepEqual(toWire({ bytes: new Uint8Array([1, 2]) }), { text: '{"bytes":{"__bytes__":"AQI="}}', blobs: undefined });
});
