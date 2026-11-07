// Entropy from the native context, with no credential or environment access.
export function randomUUID() {
  const uuid = globalThis.__host?.context?.randomUUID;
  if (!uuid) throw new Error("Native entropy is not installed");
  return uuid();
}
import { sha256 } from "@noble/hashes/sha256";
import { sha512, sha384 } from "@noble/hashes/sha512";
import { sha1 } from "@noble/hashes/sha1";
import { hmac } from "@noble/hashes/hmac";
const algorithms = { sha256, sha512, sha384, sha1 };
const bytes = (value) =>
  typeof value === "string"
    ? new TextEncoder().encode(value)
    : new Uint8Array(
        value.buffer ?? value,
        value.byteOffset ?? 0,
        value.byteLength
      );
function encoder(state) {
  return {
    update(value) {
      state.update(bytes(value));
      return this;
    },
    digest(encoding) {
      const digest = state.digest();
      if (encoding === "hex")
        return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join(
          ""
        );
      if (encoding !== undefined)
        throw new Error(`Hash encoding '${encoding}' is not implemented`);
      return globalThis.Buffer ? Buffer.from(digest) : digest;
    }
  };
}
export function createHash(algorithm) {
  const hash = algorithms[String(algorithm).toLowerCase().replaceAll("-", "")];
  if (!hash) throw new Error(`Hash '${algorithm}' is not implemented`);
  return encoder(hash.create());
}
export function createHmac(algorithm, key) {
  const hash = algorithms[String(algorithm).toLowerCase().replaceAll("-", "")];
  if (!hash) throw new Error(`HMAC '${algorithm}' is not implemented`);
  return encoder(hmac.create(hash, bytes(key)));
}
export function randomBytes(length) {
  const native = globalThis.__host?.context?.randomBytes;
  if (!native) throw new Error("Native entropy is not installed");
  const bytes = native(length);
  return globalThis.Buffer ? globalThis.Buffer.from(bytes) : bytes;
}
export function installCryptoGlobals() {
  const data = (value) =>
    new Uint8Array(
      value.buffer ?? value,
      value.byteOffset ?? 0,
      value.byteLength
    );
  const implementation = {
    randomUUID,
    getRandomValues(array) {
      if (!ArrayBuffer.isView(array))
        throw new TypeError("Expected a typed array");
      new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(
        randomBytes(array.byteLength)
      );
      return array;
    },
    subtle: {
      async digest(algorithm, value) {
        const bytes = createHash(
          typeof algorithm === "string" ? algorithm : algorithm.name
        )
          .update(data(value))
          .digest();
        return bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength
        );
      },
      async importKey(format, key, algorithm, extractable, usages) {
        if (
          format !== "raw" ||
          algorithm.name !== "HMAC" ||
          !usages.every((usage) => usage === "sign")
        )
          throw new Error("Only raw HMAC signing keys are supported");
        return {
          bytes: data(key).slice(),
          algorithm,
          extractable: false,
          usages: ["sign"]
        };
      },
      async sign(algorithm, key, value) {
        if (
          (typeof algorithm === "string" ? algorithm : algorithm.name) !==
          "HMAC"
        )
          throw new Error("Only HMAC signatures are supported");
        const hash =
          typeof key.algorithm.hash === "string"
            ? key.algorithm.hash
            : key.algorithm.hash.name;
        const bytes = createHmac(hash, key.bytes).update(data(value)).digest();
        return bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength
        );
      }
    }
  };
  globalThis.crypto ??= {};
  for (const key of Object.keys(implementation))
    globalThis.crypto[key] ??= implementation[key];
}

export default { randomUUID, randomBytes, createHash, createHmac };
