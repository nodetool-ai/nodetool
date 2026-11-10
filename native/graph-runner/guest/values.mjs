// Values cross the kernel boundary as JSON. Bytes have no JSON form, so a
// Uint8Array travels as {"__bytes__": "<base64>"} and comes back out of
// fromJson() as a Uint8Array. A Node Buffer (the `buffer` polyfill) adds
// "__buffer__": true and comes back as a Buffer when the guest has one.
// Every other typed array, DataView and ArrayBuffer travels as
// {"__typed__": "<constructor name>", "__bytes__": "<base64>"} and comes back
// with the same type. Every other value is plain JSON.
//
// That text is what a host reads and writes: context calls, messages and
// run parameters (toJson, fromJson).
//
// A node value that crosses to the kernel does not put its bytes in the
// text (toWire, fromWire). __host.blob copies the bytes into the kernel
// once, and the text holds {"__blob__": <index>} in their place, with the
// same "__typed__" and "__buffer__" tags. The other way, the kernel passes
// the text and one new buffer for each index. The kernel still writes the
// base64 form for a host, so the messages a host receives carry bytes as
// {"__bytes__": "<base64>"}.

const TAG = "__bytes__";
const TYPED = "__typed__";
const BLOB = "__blob__";
const VIEWS = {
  Int8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array,
  Float32Array, Float64Array, BigInt64Array, BigUint64Array, DataView,
};

function encode(bytes) {
  if (typeof bytes.toBase64 === "function") return bytes.toBase64();
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function decode(text) {
  if (typeof Uint8Array.fromBase64 === "function") return Uint8Array.fromBase64(text);
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function isBuffer(value) {
  return typeof globalThis.Buffer === "function" && value instanceof globalThis.Buffer;
}

function replacer(key, value) {
  const raw = this[key];
  if (raw instanceof Uint8Array) {
    const plain = raw.constructor === Uint8Array ? raw : new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
    return isBuffer(raw) ? { [TAG]: encode(plain), __buffer__: true } : { [TAG]: encode(plain) };
  }
  if (raw instanceof ArrayBuffer) {
    return { [TYPED]: "ArrayBuffer", [TAG]: encode(new Uint8Array(raw)) };
  }
  if (ArrayBuffer.isView(raw)) {
    const name = raw instanceof DataView ? "DataView" : raw[Symbol.toStringTag];
    if (VIEWS[name]) {
      return { [TYPED]: name, [TAG]: encode(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)) };
    }
  }
  return value;
}

function reviver(_key, value) {
  if (value !== null && typeof value === "object" && typeof value[TAG] === "string") {
    const keys = Object.keys(value);
    if (keys.length === 2 && typeof value[TYPED] === "string") {
      const bytes = decode(value[TAG]);
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      if (value[TYPED] === "ArrayBuffer") return buffer;
      const View = VIEWS[value[TYPED]];
      if (View) return new View(buffer);
    }
    if (keys.length === 1 || (keys.length === 2 && value.__buffer__ === true)) {
      const bytes = decode(value[TAG]);
      return value.__buffer__ && typeof globalThis.Buffer === "function"
        ? globalThis.Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        : bytes;
    }
  }
  return value;
}

/** JSON.stringify with bytes tagged. */
export function toJson(value) {
  return JSON.stringify(value, replacer);
}

/** JSON.parse that turns tagged bytes back into Uint8Array (or Buffer). */
export function fromJson(text) {
  // Text without the tag holds no bytes, so it needs no reviver call per value.
  return text.includes('"__bytes__"') ? JSON.parse(text, reviver) : JSON.parse(text);
}

/**
 * A node value for the kernel: `{ text, blobs }`. `blobs` lists the kernel's
 * copy of each byte value the text names with {"__blob__": <index>}, or is
 * undefined when the text names none. The copy is made here, so the caller
 * may change its buffers afterwards.
 */
export function toWire(value) {
  const put = globalThis.__host?.blob;
  if (typeof put !== "function") return { text: toJson(value), blobs: undefined };
  const blobs = [];
  // An object of the value that has a "__blob__" key of its own. The kernel
  // could not tell it from a marker, so such a value travels as base64.
  let reserved = false;
  const mark = (bytes, tags) => {
    blobs.push(put(bytes));
    return tags;
  };
  const text = JSON.stringify(value, function (key, current) {
    const raw = this[key];
    if (raw instanceof Uint8Array) {
      const plain = raw.constructor === Uint8Array ? raw : new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
      return mark(plain, isBuffer(raw) ? { [BLOB]: blobs.length, __buffer__: true } : { [BLOB]: blobs.length });
    }
    if (raw instanceof ArrayBuffer) return mark(raw, { [TYPED]: "ArrayBuffer", [BLOB]: blobs.length });
    if (ArrayBuffer.isView(raw)) {
      const name = raw instanceof DataView ? "DataView" : raw[Symbol.toStringTag];
      if (VIEWS[name]) {
        return mark(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength), { [TYPED]: name, [BLOB]: blobs.length });
      }
    }
    if (current !== null && typeof current === "object" && Object.hasOwn(current, BLOB)) reserved = true;
    return current;
  });
  if (!reserved) return { text, blobs: blobs.length ? blobs : undefined };
  if (blobs.length) globalThis.__host.dropBlobs(blobs);
  return { text: toJson(value), blobs: undefined };
}

/** toWire for a value a guest function returns: the text, or `{ text, blobs }`. */
export function wireReply(value) {
  const wire = toWire(value);
  return wire.blobs ? wire : wire.text;
}

function fromBlob(bytes, marker) {
  const keys = Object.keys(marker);
  if (keys.length === 1) return bytes;
  if (keys.length !== 2) return undefined;
  if (marker.__buffer__ === true) {
    return typeof globalThis.Buffer === "function"
      ? globalThis.Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      : bytes;
  }
  if (typeof marker[TYPED] !== "string") return undefined;
  const whole = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength;
  const buffer = whole ? bytes.buffer : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  if (marker[TYPED] === "ArrayBuffer") return buffer;
  const View = VIEWS[marker[TYPED]];
  return View ? new View(buffer) : undefined;
}

/**
 * The value of text from the kernel. `blobs` holds one Uint8Array, over a
 * buffer of its own, for each {"__blob__": <index>} of the text. Tagged
 * base64 in the text turns into bytes as in fromJson.
 */
export function fromWire(text, blobs) {
  if (!blobs) return fromJson(text);
  return JSON.parse(text, (key, value) => {
    if (value !== null && typeof value === "object" && typeof value[BLOB] === "number") {
      const bytes = blobs[value[BLOB]];
      const made = bytes instanceof Uint8Array ? fromBlob(bytes, value) : undefined;
      if (made !== undefined) return made;
    }
    return reviver(key, value);
  });
}

/** fromWire for what a host function resolves with: text, or `{ text, blobs }`. */
export function fromReply(reply) {
  return typeof reply === "string" ? fromJson(reply) : fromWire(reply.text, reply.blobs);
}
