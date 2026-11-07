// Values cross the kernel boundary as JSON. Bytes have no JSON form, so a
// Uint8Array travels as {"__bytes__": "<base64>"} and comes back out of
// fromJson() as a Uint8Array. A Node Buffer (the `buffer` polyfill) adds
// "__buffer__": true and comes back as a Buffer when the guest has one.
// Every other value is plain JSON.
//
// The kernel keeps the tagged form, so the messages a host receives carry
// bytes as {"__bytes__": "<base64>"}.

const TAG = "__bytes__";

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
  return value;
}

function reviver(_key, value) {
  if (value !== null && typeof value === "object" && typeof value[TAG] === "string") {
    const keys = Object.keys(value);
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
  return JSON.parse(text, reviver);
}
