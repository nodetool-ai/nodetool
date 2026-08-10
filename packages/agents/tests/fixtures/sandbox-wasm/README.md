# The scalar reference WASM module

`reference.wasm` is the fixture every sandbox WASM execution test runs against,
and the template a third-party pack copies. It covers each shape the M4 scalar
contract has to handle:

| Export | Signature | What it pins |
|---|---|---|
| `add` | `(i32, i32) -> i32` | integer round trip, host-side int32 range rules |
| `scale` | `(f64) -> f64` | float round trip |
| `noop` | `() -> ()` | a void export resolves `undefined` |
| `bump` | `() -> i32` | a mutable global — instance-per-call makes it always return 1 |
| `spin` | `() -> ()` | never returns, so the per-call timeout kills and replaces the worker |
| `sum-f32` | `(f32, f32) -> f32` | a name that is not a JS identifier, so the manifest needs `{ "wasm": "sum-f32", "as": "sumF32" }` |
| `mem` | memory | a non-function export, so a validation test can prove the "is a memory, not a function" skip reason |

## Toolchain

The repo carries no WAT assembler — no `wabt`, no Rust
`wasm32-unknown-unknown` target — and a native or download-on-install
dependency costs more than a 170-byte fixture is worth. So the toolchain is a
checked-in script:

```bash
node scripts/build-sandbox-reference-wasm.mjs
```

It encodes each binary section literally from `reference.wat`, validates the
result with `WebAssembly.validate`, and writes three files here:

- `reference.wasm` — the binary
- `reference.wat` — the source it encodes; edit this, then re-run the script
- `reference-bytes.ts` — the same bytes base64-encoded, so a browser host can
  load the fixture with no filesystem

Never edit `reference.wasm` or `reference-bytes.ts` by hand.

A pack that ships real WASM would use a normal toolchain (Rust, C, AssemblyScript,
`wat2wasm`); nothing about the contract depends on how the bytes were produced.

## Browser parity

`cases.ts` holds the contract cases as data — guest source plus the expected
outcome — rather than as `it()` bodies, so the shared fixture harness M2 builds
can replay the same list in a real browser. The Node suites in
`packages/agents/tests/js-sandbox-wasm*.test.ts` consume that list today.
