# image-runtime tests

`node.test.ts` and `browser.test.ts` are per-implementation smoke tests
(contract conformance, no-op short-circuits, pure helpers).

`parity.test.ts` is the cross-implementation diff. It generates 3 small (64×64)
deterministic test images — solid red, vertical gradient, and a checkerboard —
inline via sharp's `create` API, then runs each cheap op (resize, crop, rotate
90°, flip horizontal, blur) through both `nodeImageRuntime` and
`browserImageRuntime`. Outputs are decoded back to raw RGB pixels (via sharp)
and compared by mean absolute difference (MAD) across all channels on a
0–255 scale.

Tolerances differ per op because the underlying kernel families differ.
Geometry-only ops (crop, rotate-90, flip) are pixel-exact up to encode noise
(MAD ~0, gated at 2). Resize is gated at 15 because sharp's `lanczos3` and the
canvas API's vendor-defined high-quality smoothing diverge most on
high-frequency content like the checkerboard (~11 MAD observed during the
spike). Blur is gated loosely at 30 because sharp's Gaussian (sigma) and CSS
`blur(Npx)` are different kernels entirely — large drift here is expected, not
a bug.

A failing parity test does NOT mean the browser runtime is broken. It means
the two filter families have diverged beyond what's tolerated, usually
because:

- A library upgrade (sharp, `@napi-rs/canvas`) changed a default kernel.
- A runtime started passing different options to its backend.

Triage: inspect the failing op + fixture, decide whether the new behavior is
visually acceptable, then either bump the tolerance with a comment explaining
why or fix the implementation to bring it back in line.

The browser runtime is exercised in this Node test via a tiny
`@napi-rs/canvas`-backed shim (`OffscreenCanvas` + `createImageBitmap`)
installed in `beforeAll`. The shim is local to this file and not used at
production runtime.
