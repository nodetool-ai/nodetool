import hostDefault from "../guest/host/crypto.mjs";
import crypto from "../guest/shims/crypto.cjs";
import * as namespace from "../guest/shims/crypto.cjs";
import required from "./context-crypto.cjs";
const hash = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const mac = "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8";
for (const [kind, api] of [
  ["host default", hostDefault],
  ["default", crypto],
  ["namespace", namespace],
  ["require", required]
]) {
  for (const name of ["createHash", "createHmac", "randomBytes", "randomUUID"])
    if (typeof api[name] !== "function")
      throw new Error(`crypto ${kind}.${name} is missing`);
  if (api.createHash("sha256").update("a").update("bc").digest("hex") !== hash)
    throw new Error(`crypto ${kind} incremental SHA256 differs`);
  if (
    api
      .createHmac("sha256", "key")
      .update("The quick brown fox jumps over the lazy dog")
      .digest("hex") !== mac
  )
    throw new Error(`crypto ${kind} HMAC differs`);
  const raw = api.createHash("sha256").update("abc").digest();
  if (!(raw instanceof Uint8Array) || raw.length !== 32 || raw[0] !== 0xba)
    throw new Error(`crypto ${kind} raw digest differs`);
  const entropy = api.randomBytes(32);
  if (!(entropy instanceof Uint8Array) || entropy.length !== 32)
    throw new Error(`crypto ${kind} entropy differs`);
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      api.randomUUID()
    )
  )
    throw new Error(`crypto ${kind} UUID differs`);
}
if (
  crypto.createHash !== namespace.createHash ||
  crypto.createHash !== required.createHash
)
  throw new Error(
    "crypto import styles did not share the implemented functions"
  );
globalThis.__g5CryptoInterop = true;
