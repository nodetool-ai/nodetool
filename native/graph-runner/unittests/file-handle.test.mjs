import { Buffer } from "buffer/";
import fs, { promises } from "../guest/host/fs.mjs";
import * as fsp from "../guest/host/fs-promises.mjs";
let checks = 0;
const check = (value, label) => {
  checks++;
  if (!value) throw new Error(label);
};
async function rejects(fn, pattern) {
  let error;
  try {
    await fn();
  } catch (e) {
    error = e;
  }
  check(
    error && pattern.test(error.message),
    `expected ${pattern}, got ${error}`
  );
}
check(
  typeof fsp.open === "function" && fsp.open === promises.open,
  "fs/promises open exported"
);
check(
  fs.open === undefined,
  "callback fs.open must not advertise a FileHandle"
);
const handle = await fsp.open("data", "r");
const backing = Buffer.alloc(12, 99);
const view = backing.subarray(2, 10);
let result = await handle.read(view, 1, 3, 2);
check(
  result.buffer === view && result.bytesRead === 3,
  "read returns actual original view"
);
check(
  backing.join(",") === "99,99,99,67,68,69,99,99,99,99,99,99",
  "view offset copied"
);
// Explicit position does not change the current descriptor cursor.
const buffer = new Uint8Array(4);
result = await handle.read(buffer, 0, 2, null);
check(
  result.buffer === buffer && buffer[0] === 65 && buffer[1] === 66,
  "null cursor begins at zero"
);
await handle.read(buffer, 0, 2, null);
check(buffer[0] === 67 && buffer[1] === 68, "null cursor advances");
await handle.read(buffer, 1, 3, 5);
check(
  buffer[1] === 70 && buffer[2] === 71 && buffer[3] === 72,
  "positioned data"
);
check(
  (await handle.read(buffer, 0, 4, 7)).bytesRead === 1,
  "short read at EOF"
);
check((await handle.read(buffer, 0, 4, 8)).bytesRead === 0, "EOF returns zero");
check(
  (await handle.read(buffer, 4, 0, null)).bytesRead === 0,
  "zero length at view end"
);
check(
  (await handle.read(buffer, 0, 1, Number.MAX_SAFE_INTEGER)).bytesRead === 0,
  "safe large position"
);
const words = new Uint16Array(4);
result = await handle.read(words, 1, 3, 0);
const wordBytes = new Uint8Array(words.buffer);
check(
  result.buffer === words &&
    wordBytes[0] === 0 &&
    wordBytes[1] === 65 &&
    wordBytes[3] === 67 &&
    wordBytes[4] === 0,
  "typed array offsets use bytes"
);
for (const bad of [
  -1,
  0.5,
  NaN,
  Infinity,
  Number.MAX_SAFE_INTEGER + 1,
  "1",
  true
]) {
  await rejects(() => handle.read(buffer, bad, 1, 0), /offset|integer/);
  await rejects(() => handle.read(buffer, 0, bad, 0), /length|integer/);
  await rejects(() => handle.read(buffer, 0, 1, bad), /position|integer/);
}
await rejects(() => handle.read(buffer, 3, 2, 0), /bounds|length/);
await rejects(() => handle.read({}, 0, 1, 0), /buffer|view/);
await rejects(() => handle.read(new ArrayBuffer(2), 0, 1, 0), /buffer|view/);
await rejects(
  () => handle.read(new Uint8Array(16 * 1024 * 1024 + 1)),
  /length|limit|quota/
);
for (const flag of ["w", "r+", "a", 0])
  await rejects(() => fsp.open("data", flag), /read.only|flags|supported/);
await rejects(() => fsp.open("../outside"), /EACCES/);
const readOnly = await fsp.open(globalThis.__readOnlyPath, "r");
check(
  (await readOnly.read(buffer, 0, 2, 0)).bytesRead === 2 && buffer[0] === 82,
  "read root grant"
);
await readOnly.close();
await handle.close();
await rejects(() => handle.read(buffer, 0, 1, 0), /EBADF|closed/);
await rejects(() => handle.close(), /EBADF|closed/);
globalThis.__retainedFileHandle = await fsp.open("data", "r");
globalThis.__guestFileHandleChecks = checks;
