# Sandbox runtime

The shared QuickJS interpreter and worker isolation used by the full agent host
and the optional minimal Code feature. The lean host accepts workspace, secret,
asset and reporting callbacks. It never executes user JavaScript in Node.

Host and WASM imports require separately installed capability adapters. The lean
host can execute explicitly resolved guest JavaScript modules without a compiler.
