// structuredClone for the guest, which QuickJS-ng lacks. Follows the HTML
// structured clone algorithm as Node implements it:
//   - primitives other than symbols are returned as they are;
//   - Boolean, Number, String and BigInt wrappers, Date, RegExp (lastIndex
//     reset), ArrayBuffer, typed arrays and DataView (views of one buffer
//     keep sharing one cloned buffer), Map, Set, arrays (holes and extra
//     properties kept) and Error objects (name, message, stack, cause) are
//     cloned;
//   - any other object, a class instance included, becomes a plain object
//     with its own enumerable string-keyed properties, read through getters;
//   - functions, symbols, promises, weak collections, WeakRef,
//     FinalizationRegistry, generators and SharedArrayBuffer throw a
//     DOMException named DataCloneError;
//   - cycles and shared references are preserved.
// `options.transfer` copies ArrayBuffers before detaching them: the clone owns its memory and the
// originals are detached. Anything else in the list throws DataCloneError.
// The clone completes before transfer buffers detach, so failed clones leave them attached.
// A Proxy is cloned through its traps rather than refused, unlike in Node.

const ERROR_TYPES = {
  Error,
  EvalError,
  RangeError,
  ReferenceError,
  SyntaxError,
  TypeError,
  URIError
};

const tagOf = (value) => Object.prototype.toString.call(value).slice(8, -1);

const TYPED_ARRAYS = new Set([
  "Int8Array",
  "Uint8Array",
  "Uint8ClampedArray",
  "Int16Array",
  "Uint16Array",
  "Int32Array",
  "Uint32Array",
  "Float16Array",
  "Float32Array",
  "Float64Array",
  "BigInt64Array",
  "BigUint64Array"
]);

const GeneratorPrototype = Object.getPrototypeOf(function* () {}).prototype;
const AsyncGeneratorPrototype = Object.getPrototypeOf(async function* () {}).prototype;

function cloneError(value) {
  const description = typeof value === "function" || typeof value === "symbol"
    ? String(value)
    : `#<${value?.constructor?.name ?? "Object"}>`;
  return new DOMException(`${description} could not be cloned.`, "DataCloneError");
}

function isUncloneable(value) {
  if (
    value instanceof Promise ||
    value instanceof WeakMap ||
    value instanceof WeakSet ||
    (typeof WeakRef === "function" && value instanceof WeakRef) ||
    (typeof FinalizationRegistry === "function" && value instanceof FinalizationRegistry) ||
    (typeof SharedArrayBuffer === "function" && value instanceof SharedArrayBuffer)
  ) {
    return true;
  }
  return GeneratorPrototype.isPrototypeOf(value) || AsyncGeneratorPrototype.isPrototypeOf(value);
}

function cloneValue(value, memory) {
  if (typeof value === "symbol" || typeof value === "function") throw cloneError(value);
  if (typeof value !== "object" || value === null) return value;
  if (memory.has(value)) return memory.get(value);
  if (isUncloneable(value)) throw cloneError(value);

  const tag = tagOf(value);
  let out;
  if (tag === "Boolean") out = Object(Boolean.prototype.valueOf.call(value));
  else if (tag === "Number") out = Object(Number.prototype.valueOf.call(value));
  else if (tag === "String") out = Object(String.prototype.valueOf.call(value));
  else if (tag === "BigInt") out = Object(BigInt.prototype.valueOf.call(value));
  else if (tag === "Date") out = new Date(Date.prototype.getTime.call(value));
  else if (tag === "RegExp") out = new RegExp(value.source, value.flags);
  else if (tag === "ArrayBuffer") out = value.slice(0);
  if (out !== undefined) {
    memory.set(value, out);
    return out;
  }

  if (ArrayBuffer.isView(value)) {
    const buffer = cloneValue(value.buffer, memory);
    out = tag === "DataView"
      ? new DataView(buffer, value.byteOffset, value.byteLength)
      : new globalThis[TYPED_ARRAYS.has(tag) ? tag : "Uint8Array"](buffer, value.byteOffset, value.length);
    memory.set(value, out);
    return out;
  }

  if (tag === "Map") {
    out = new Map();
    memory.set(value, out);
    for (const [k, v] of Map.prototype.entries.call(value)) out.set(cloneValue(k, memory), cloneValue(v, memory));
    return out;
  }
  if (tag === "Set") {
    out = new Set();
    memory.set(value, out);
    for (const v of Set.prototype.values.call(value)) out.add(cloneValue(v, memory));
    return out;
  }

  if (value instanceof Error) {
    const name = Object.hasOwn(ERROR_TYPES, value.name) ? value.name : "Error";
    out = Object.create(ERROR_TYPES[name].prototype);
    memory.set(value, out);
    const define = (key, v) =>
      Object.defineProperty(out, key, { value: v, writable: true, configurable: true, enumerable: false });
    const message = Object.getOwnPropertyDescriptor(value, "message");
    if (message && "value" in message) define("message", String(message.value));
    if (typeof value.stack === "string") define("stack", value.stack);
    if (Object.hasOwn(value, "cause")) define("cause", cloneValue(value.cause, memory));
    return out;
  }

  out = Array.isArray(value) ? new Array(value.length) : {};
  memory.set(value, out);
  for (const key of Object.keys(value)) {
    Object.defineProperty(out, key, { value: cloneValue(value[key], memory),
      writable: true, configurable: true, enumerable: true });
  }
  return out;
}

export function structuredClone(value, options) {
  if (arguments.length === 0) {
    throw new TypeError("The \"value\" argument must be specified");
  }
  const memory = new Map();
  const transfer = options?.transfer;
  if (transfer !== undefined && transfer !== null) {
    const list = Array.from(transfer);
    const seen = new Set();
    for (const item of list) {
      if (tagOf(item) !== "ArrayBuffer" || seen.has(item) || item.detached) {
        throw new DOMException("Value not transferable", "DataCloneError");
      }
      seen.add(item);
    }
    // A clone that throws must leave the transfer list attached, so the
    // value is cloned once before any buffer detaches.
    const result = cloneValue(value, memory);
    for (const item of list) item.transfer();
    return result;
  }
  return cloneValue(value, memory);
}

export function installStructuredClone(global) {
  if (typeof global.structuredClone === "function") return;
  Object.defineProperty(global, "structuredClone", {
    value: structuredClone,
    writable: true,
    configurable: true,
    enumerable: true
  });
}
