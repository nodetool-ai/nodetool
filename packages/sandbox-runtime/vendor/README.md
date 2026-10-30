# QuickJS JavaScript profile

`quickjs/` contains the ESM distribution of `@sebastianwessel/quickjs@3.0.1`.
Its upstream license is preserved in `quickjs/LICENSE`.

NodeTool uses the JavaScript execution path. This copy removes the unused
TypeScript transform helper, its public export, and the compiler options from
both sandbox option declarations. The two engine loaders use the same identity
transform as upstream's disabled TypeScript path. The virtual filesystem,
module loader, WASM engine, host bridges, scheduling, and disposal stay upstream.
TypeScript compilation remains in `@nodetool-ai/sandbox-compiler`.

To refresh from an unpacked npm artifact, run
`node scripts/vendor-quickjs-javascript.mjs /path/to/package` from the repository
root. The script checks the upstream package name and version and fails when a
patch target changes. Review the generated diff and run the packed sandbox
consumer regression before accepting an update.
