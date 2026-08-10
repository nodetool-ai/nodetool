;; The scalar reference module for NodeTool sandbox WASM packs (M4).
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
