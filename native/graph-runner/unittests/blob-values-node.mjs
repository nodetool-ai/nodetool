import { BaseNode } from "@nodetool-ai/node-sdk";

// Fixture nodes for unittests/blob_values.cpp: bytes that cross an edge.

const FILL = 7;

function pattern(length) {
  const bytes = new Uint8Array(length);
  bytes.fill(FILL);
  if (length > 0) {
    bytes[0] = 1;
    bytes[length - 1] = 2;
  }
  return bytes;
}

function checkPattern(bytes, length, where) {
  if (!(bytes instanceof Uint8Array)) throw new Error(`${where}: expected a Uint8Array, got ${Object.prototype.toString.call(bytes)}`);
  if (bytes.length !== length) throw new Error(`${where}: expected ${length} bytes, got ${bytes.length}`);
  if (length === 0) return;
  const middle = length >> 1;
  if (bytes[0] !== 1 || bytes[length - 1] !== 2 || (length > 2 && bytes[middle] !== FILL)) {
    throw new Error(`${where}: content changed (${bytes[0]}, ${bytes[middle]}, ${bytes[length - 1]})`);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Returns `size` bytes. With `mutateLater`, overwrites its own buffer after it returned. */
export class BlobSource extends BaseNode {
  static nodeType = "fixture.BlobSource";
  static metadataOutputTypes = { output: "bytes" };
  constructor(properties = {}) {
    super(properties);
    this.size = properties.size ?? 16;
    this.mutateLater = properties.mutateLater ?? false;
  }
  async process() {
    const bytes = pattern(this.size);
    if (this.mutateLater) {
      globalThis.__blobFixture = { produced: bytes };
      setTimeout(() => bytes.fill(9), 0);
    }
    return { output: bytes };
  }
}

/**
 * Checks the bytes on `input`. Mode "mutate" then overwrites its own copy.
 * Mode "isolated" waits, then checks that neither the producer nor the other
 * consumer changed its copy, and that the producer still holds its buffer.
 */
export class BlobSink extends BaseNode {
  static nodeType = "fixture.BlobSink";
  static supportsDynamicInputs = true;
  static metadataOutputTypes = { length: "int" };
  constructor(properties = {}) {
    super(properties);
    this.size = properties.size ?? 16;
    this.mode = properties.mode ?? "check";
  }
  async process() {
    const bytes = this.getDynamic("input");
    checkPattern(bytes, this.size, "sink");
    if (this.mode === "mutate") bytes.fill(3);
    if (this.mode === "isolated") {
      await sleep(60);
      checkPattern(bytes, this.size, "sink after the other consumer and the producer wrote");
      const produced = globalThis.__blobFixture?.produced;
      if (!produced || produced.byteLength !== this.size) throw new Error("the producer's buffer was detached");
      if (produced[0] !== 9 || produced[this.size - 1] !== 9) throw new Error("the producer did not overwrite its buffer");
    }
    return { length: bytes.length };
  }
}

function typedValues() {
  const buffer = new ArrayBuffer(16);
  new Uint8Array(buffer).set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  const values = {
    Uint8Array: new Uint8Array([1, 2, 250]),
    sliced: new Uint8Array(buffer, 4, 3),
    empty: new Uint8Array(0),
    ArrayBuffer: buffer.slice(2, 10),
    Int8Array: new Int8Array([-1, 2, -128]),
    Uint8ClampedArray: new Uint8ClampedArray([0, 128, 255]),
    Int16Array: new Int16Array([-2, 300]),
    Uint16Array: new Uint16Array([65535, 7]),
    Int32Array: new Int32Array([-70000, 5]),
    Uint32Array: new Uint32Array([4000000000]),
    Float32Array: new Float32Array([1.5, -2.25]),
    Float64Array: new Float64Array([Math.PI, -0]),
    BigInt64Array: new BigInt64Array([-5n, 2n ** 40n]),
    BigUint64Array: new BigUint64Array([2n ** 63n]),
    DataView: new DataView(buffer, 1, 5),
    nested: { list: [new Uint8Array([9]), "text", 4, { deep: new Float32Array([0.5]) }] },
    plain: { __bytes__: "AA==", other: true },
    marker: { __blob__: 0, other: true },
  };
  if (typeof globalThis.Buffer === "function") values.Buffer = globalThis.Buffer.from([4, 5, 6]);
  return values;
}

function bytesOf(value) {
  if (value instanceof ArrayBuffer) return [...new Uint8Array(value)];
  return [...new Uint8Array(value.buffer, value.byteOffset, value.byteLength)];
}

function sameValue(actual, expected, path) {
  if (expected instanceof ArrayBuffer || ArrayBuffer.isView(expected)) {
    if (actual === null || typeof actual !== "object" || actual.constructor !== expected.constructor) {
      throw new Error(`${path}: expected ${expected.constructor.name}, got ${actual?.constructor?.name ?? typeof actual}`);
    }
    const a = bytesOf(actual), b = bytesOf(expected);
    if (a.length !== b.length || a.some((byte, i) => byte !== b[i])) throw new Error(`${path}: bytes differ`);
    return;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) throw new Error(`${path}: array differs`);
    expected.forEach((item, i) => sameValue(actual[i], item, `${path}[${i}]`));
    return;
  }
  if (expected !== null && typeof expected === "object") {
    if (actual === null || typeof actual !== "object") throw new Error(`${path}: expected an object`);
    const keys = Object.keys(expected);
    if (Object.keys(actual).length !== keys.length) throw new Error(`${path}: keys differ`);
    for (const key of keys) sameValue(actual[key], expected[key], `${path}.${key}`);
    return;
  }
  if (actual !== expected) throw new Error(`${path}: expected ${String(expected)}, got ${String(actual)}`);
}

/** Returns one value of every byte type. */
export class TypedSource extends BaseNode {
  static nodeType = "fixture.TypedSource";
  static metadataOutputTypes = { output: "any" };
  async process() {
    return { output: typedValues() };
  }
}

/** Yields the typed values `frames` times, as a streaming output. */
export class TypedStream extends BaseNode {
  static nodeType = "fixture.TypedStream";
  static metadataOutputTypes = { output: "any" };
  constructor(properties = {}) {
    super(properties);
    this.frames = properties.frames ?? 2;
  }
  async process() {
    return { output: typedValues() };
  }
  async *genProcess() {
    for (let i = 0; i < this.frames; i++) yield { output: typedValues() };
  }
}

/** Checks that every typed value kept its type and bytes across the edge. */
export class TypedSink extends BaseNode {
  static nodeType = "fixture.TypedSink";
  static supportsDynamicInputs = true;
  static metadataOutputTypes = { ok: "bool" };
  async process() {
    sameValue(this.getDynamic("input"), typedValues(), "input");
    return { ok: true };
  }
}

/** Reads `input` as a stream, checks each typed value and emits it again. */
export class TypedRelay extends BaseNode {
  static nodeType = "fixture.TypedRelay";
  static isStreamingInput = true;
  static supportsDynamicInputs = true;
  static metadataOutputTypes = { output: "any" };
  async process() {
    return {};
  }
  async run(inputs, outputs) {
    let seen = 0;
    for await (const value of inputs.stream("input")) {
      sameValue(value, typedValues(), "stream input");
      seen++;
      await outputs.emit("output", value);
    }
    if (seen === 0) throw new Error("the relay saw no frame");
  }
}

/** Yields `frames` frames of `size` bytes. */
export class FrameSource extends BaseNode {
  static nodeType = "fixture.FrameSource";
  static metadataOutputTypes = { output: "bytes" };
  constructor(properties = {}) {
    super(properties);
    this.frames = properties.frames ?? 4;
    this.size = properties.size ?? 1024;
  }
  async process() {
    return { output: pattern(this.size) };
  }
  async *genProcess() {
    for (let i = 0; i < this.frames; i++) yield { output: pattern(this.size) };
  }
}

/** Reads `input` as a stream and checks that `frames` frames of `size` bytes arrived. */
export class FrameSink extends BaseNode {
  static nodeType = "fixture.FrameSink";
  static isStreamingInput = true;
  static supportsDynamicInputs = true;
  static metadataOutputTypes = { frames: "int" };
  constructor(properties = {}) {
    super(properties);
    this.frames = properties.frames ?? 4;
    this.size = properties.size ?? 1024;
  }
  async process() {
    return {};
  }
  async run(inputs, outputs) {
    let seen = 0;
    for await (const bytes of inputs.stream("input")) {
      checkPattern(bytes, this.size, `frame ${seen}`);
      seen++;
    }
    if (seen !== this.frames) throw new Error(`expected ${this.frames} frames, got ${seen}`);
    await outputs.emit("frames", seen);
  }
}
