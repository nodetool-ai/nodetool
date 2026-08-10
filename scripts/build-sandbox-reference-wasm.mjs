#!/usr/bin/env node
/**
 * Build the scalar reference WASM module for the sandbox package system (M4).
 *
 * Toolchain choice: this script *is* the toolchain. The repo carries no WAT
 * assembler (no `wabt`, no Rust `wasm32-unknown-unknown` target), and adding a
 * native or download-on-install dependency to produce a 200-byte fixture costs
 * more than it buys. Every byte below is emitted here from the WAT in
 * `reference.wat`, so the binary is reproducible with `node
 * scripts/build-sandbox-reference-wasm.mjs` and reviewable against the spec's
 * binary format.
 *
 * Writes, into packages/agents/tests/fixtures/sandbox-wasm/:
 *   reference.wasm        the binary
 *   reference.wat         the source it encodes, by hand
 *   reference-bytes.ts    the same bytes base64-encoded, so browser hosts can
 *                         load the fixture without a filesystem
 *
 * The module deliberately covers every shape M4's contract has to handle:
 *   add      (i32, i32) -> i32   scalar round trip and i32 range rules
 *   scale    (f64)      -> f64   float round trip
 *   noop     ()         -> ()    void export resolves undefined
 *   bump     ()         -> i32   reads and writes a mutable global (statelessness)
 *   spin     ()         -> ()    infinite loop (per-call timeout)
 *   sum-f32  (f32, f32) -> f32   non-identifier name, needs `{wasm, as}` mapping
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "packages",
  "agents",
  "tests",
  "fixtures",
  "sandbox-wasm"
);

const I32 = 0x7f;
const F32 = 0x7d;
const F64 = 0x7c;

/** Unsigned LEB128. */
function u32(value) {
  const out = [];
  let rest = value;
  do {
    let byte = rest & 0x7f;
    rest >>>= 7;
    if (rest !== 0) byte |= 0x80;
    out.push(byte);
  } while (rest !== 0);
  return out;
}

/** Signed LEB128 — what `i32.const` takes. */
function i32leb(value) {
  const out = [];
  let rest = value | 0;
  for (;;) {
    const byte = rest & 0x7f;
    rest >>= 7;
    const signBit = (byte & 0x40) !== 0;
    if ((rest === 0 && !signBit) || (rest === -1 && signBit)) {
      out.push(byte);
      return out;
    }
    out.push(byte | 0x80);
  }
}

function vec(items) {
  return [...u32(items.length), ...items.flat()];
}

function section(id, payload) {
  return [id, ...u32(payload.length), ...payload];
}

function name(text) {
  const bytes = [...new TextEncoder().encode(text)];
  return [...u32(bytes.length), ...bytes];
}

function f64const(value) {
  const buffer = new DataView(new ArrayBuffer(8));
  buffer.setFloat64(0, value, true);
  return [0x44, ...new Uint8Array(buffer.buffer)];
}

const functionType = (parameters, results) => [
  0x60,
  ...vec(parameters.map((type) => [type])),
  ...vec(results.map((type) => [type]))
];

// Type section — one entry per distinct signature, in the order the WAT lists them.
const types = [
  functionType([I32, I32], [I32]), // 0: add
  functionType([F64], [F64]), // 1: scale
  functionType([], []), // 2: noop, spin
  functionType([], [I32]), // 3: bump
  functionType([F32, F32], [F32]) // 4: sum-f32
];

// Function section — function index -> type index.
const functionTypeIndexes = [0, 1, 2, 3, 2, 4];

// Memory section — one unshared memory that declares a maximum, as the
// validator requires. 1 page minimum, 2 pages maximum.
const memories = [[0x01, ...u32(1), ...u32(2)]];

// Global section — one mutable i32, the statelessness probe.
const globals = [[I32, 0x01, 0x41, ...i32leb(0), 0x0b]];

const bodies = [
  // add: local.get 0; local.get 1; i32.add
  [0x20, 0x00, 0x20, 0x01, 0x6a],
  // scale: local.get 0; f64.const 2.5; f64.mul
  [0x20, 0x00, ...f64const(2.5), 0xa2],
  // noop: nop
  [0x01],
  // bump: global.get 0; i32.const 1; i32.add; global.set 0; global.get 0
  [0x23, 0x00, 0x41, ...i32leb(1), 0x6a, 0x24, 0x00, 0x23, 0x00],
  // spin: loop $l; br $l; end
  [0x03, 0x40, 0x0c, 0x00, 0x0b],
  // sum-f32: local.get 0; local.get 1; f32.add
  [0x20, 0x00, 0x20, 0x01, 0x92]
];

const exportEntries = [
  ["add", 0],
  ["scale", 1],
  ["noop", 2],
  ["bump", 3],
  ["spin", 4],
  ["sum-f32", 5],
  // A non-function export, so a test can prove the "is a memory, not a
  // function" skip reason against a real binary.
  ["mem", 6]
];

function exportEntry([exportName, index]) {
  // Export kinds: 0 function, 2 memory. `mem` is the one memory export.
  const kind = exportName === "mem" ? 0x02 : 0x00;
  const localIndex = exportName === "mem" ? 0 : index;
  return [...name(exportName), kind, ...u32(localIndex)];
}

const codeSection = bodies.map((body) => {
  const payload = [...u32(0), ...body, 0x0b]; // no locals, then end
  return [...u32(payload.length), ...payload];
});

const binary = Uint8Array.from([
  0x00,
  0x61,
  0x73,
  0x6d, // \0asm
  0x01,
  0x00,
  0x00,
  0x00, // version 1
  ...section(1, vec(types)),
  ...section(3, vec(functionTypeIndexes.map((index) => u32(index)))),
  ...section(5, vec(memories)),
  ...section(6, vec(globals)),
  ...section(7, vec(exportEntries.map(exportEntry))),
  ...section(10, vec(codeSection))
]);

if (!WebAssembly.validate(binary)) {
  throw new Error("the assembled reference module is not a valid WASM binary");
}

const WAT = `;; The scalar reference module for NodeTool sandbox WASM packs (M4).
;;
;; Do not edit reference.wasm by hand. This file is the source; the bytes are
;; assembled from it by scripts/build-sandbox-reference-wasm.mjs, which encodes
;; each section literally. Re-run that script after any change here.
(module
  (memory 1 2)
  (global $calls (mut i32) (i32.const 0))

  ;; Scalar round trip and the i32 range rules.
  (func $add (param i32 i32) (result i32)
    local.get 0
    local.get 1
    i32.add)

  ;; Float round trip.
  (func $scale (param f64) (result f64)
    local.get 0
    f64.const 2.5
    f64.mul)

  ;; No result — the facade resolves undefined.
  (func $noop)

  ;; Mutable global. Instance-per-call means this always returns 1.
  (func $bump (result i32)
    global.get $calls
    i32.const 1
    i32.add
    global.set $calls
    global.get $calls)

  ;; Never returns — the per-call timeout terminates and replaces the worker.
  (func $spin
    (loop $l
      br $l))

  ;; A name that is not a JavaScript identifier, so the manifest must map it
  ;; with { "wasm": "sum-f32", "as": "sumF32" }.
  (func $sum-f32 (param f32 f32) (result f32)
    local.get 0
    local.get 1
    f32.add)

  (export "add" (func $add))
  (export "scale" (func $scale))
  (export "noop" (func $noop))
  (export "bump" (func $bump))
  (export "spin" (func $spin))
  (export "sum-f32" (func $sum-f32))
  ;; Exported so a validation test can name a non-function export.
  (export "mem" (memory 0)))
`;

const BYTES_MODULE = `/**
 * Generated by scripts/build-sandbox-reference-wasm.mjs — do not edit.
 *
 * The scalar reference module's bytes, base64-encoded so a browser host can
 * load the fixture with no filesystem. See reference.wat for the source and
 * README.md for the contract each export covers.
 */

export const REFERENCE_WASM_BASE64 =
  "${Buffer.from(binary).toString("base64")}";

/** Decode the reference module. Works on Node and in a browser. */
export function referenceWasmBytes(): Uint8Array {
  const binary =
    typeof atob === "function"
      ? atob(REFERENCE_WASM_BASE64)
      : Buffer.from(REFERENCE_WASM_BASE64, "base64").toString("binary");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "reference.wasm"), binary);
writeFileSync(join(OUT_DIR, "reference.wat"), WAT);
writeFileSync(join(OUT_DIR, "reference-bytes.ts"), BYTES_MODULE);
process.stdout.write(
  `wrote reference.wasm (${binary.byteLength} bytes), reference.wat, reference-bytes.ts\n`
);
