#!/bin/sh
# Builds and runs each row of the kernel benchmark. See README.md.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
: "${WASMTIME_DIR:?set WASMTIME_DIR to a Wasmtime C API release}"
: "${QJS:?set QJS to a qjs binary of QuickJS-ng}"
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
cd "$here"

clang -O2 -o "$out/native" native.c -lm
clang -O2 -ffp-contract=off -o "$out/native_nofma" native.c -lm
clang -O2 -fno-vectorize -fno-slp-vectorize -o "$out/native_novec" native.c -lm
clang -O2 -I"$WASMTIME_DIR/include" -o "$out/wasmtime_host" wasmtime_host.c \
  -L"$WASMTIME_DIR/lib" -lwasmtime -Wl,-rpath,"$WASMTIME_DIR/lib" -lm

"$out/native" native
"$out/native_nofma" native-nofma
"$out/native_novec" native-novec
"$out/wasmtime_host" biquad.wat "$out/biquad.wasm"
node node_bench.mjs "$out/biquad.wasm"

{
  echo "globalThis.BLOCKS_OVERRIDE = 2200;"
  cat kernel.js
  echo 'globalThis.__bench.runJs("QuickJS-ng");'
} > "$out/qjs_all.js"
"$QJS" "$out/qjs_all.js"
