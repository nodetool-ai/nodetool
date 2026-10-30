# Sandbox runtime

The shared QuickJS interpreter and worker isolation used by the full agent host
and the optional minimal Code feature. The lean host accepts workspace, secret,
asset and reporting callbacks. It never executes user JavaScript in Node.

Host and WASM imports require separately installed capability adapters. The lean
host can execute explicitly resolved guest JavaScript modules without a compiler.

The runtime ships the JavaScript-only ESM build of
`@sebastianwessel/quickjs@3.0.1` in `vendor/quickjs`, including its MIT license.
Upstream exposes only an aggregate entry whose optional TypeScript helper leaks
compiler types into declarations. This copy removes that helper, its exports
and compiler options, and uses identity transpilation in both loaders. The
engine, bridges, lifecycle and cancellation retain the upstream implementation.
TypeScript compilation belongs to the separately installed sandbox compiler.

Regenerate with `node scripts/vendor-quickjs-javascript.mjs` from the pinned dev
dependency, or pass the path to an unpacked upstream npm artifact. The generator
fails when its version, ESM/license hash or expected patch text changes.
`vendor/quickjs/PROVENANCE.json` records the pinned npm integrity and source hash.
The sandbox profile in
`scripts/minimal-packed-consumer.mjs` exercises Code, audits JavaScript and
declarations, checks compiler absence, then injects forbidden manifest,
JavaScript and declaration edges and verifies rejection before restoring them.
