#!/usr/bin/env bash
# Builds wgpu-native v29.0.1.1 with the native interop functions
# (native-interop.patch) and lays it out as include/ and lib/, the form
# NODETOOL_WGPU_NATIVE_DIR takes.
#
#   build.sh <output-dir>
#
# Needs git, cargo (the toolchain of the checkout's rust-toolchain.toml is
# installed by rustup on first use) and libclang for bindgen.
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: $0 <output-dir>" >&2
  exit 2
fi
here="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$1"
out="$(cd "$1" && pwd)"
tag=v29.0.1.1
commit=6aed50955d934ac36049ba8d002034841633ae02
src="$out/src"

if [ ! -d "$src/.git" ]; then
  git clone --depth 1 --branch "$tag" --recurse-submodules --shallow-submodules \
    https://github.com/gfx-rs/wgpu-native.git "$src"
fi
actual="$(git -C "$src" rev-parse HEAD)"
if [ "$actual" != "$commit" ]; then
  echo "wgpu-native $tag is $actual, expected $commit" >&2
  exit 1
fi
# Idempotent: a checkout that already has the patch is left as it is.
if ! git -C "$src" apply --reverse --check "$here/native-interop.patch" 2>/dev/null; then
  git -C "$src" apply "$here/native-interop.patch"
fi
(cd "$src" && cargo build --release --locked)

mkdir -p "$out/include/webgpu" "$out/lib"
cp "$src/ffi/wgpu.h" "$src/ffi/webgpu-headers/webgpu.h" "$out/include/webgpu/"
if [ -f "$src/target/release/wgpu_native.lib" ]; then
  cp "$src/target/release/wgpu_native.lib" "$out/lib/"
else
  cp "$src/target/release/libwgpu_native.a" "$out/lib/"
fi
grep -q "WGPU_NATIVE_INTEROP_REVISION" "$out/include/webgpu/wgpu.h"
echo "wgpu-native with native interop: $out"
