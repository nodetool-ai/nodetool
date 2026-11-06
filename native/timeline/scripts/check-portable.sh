#!/usr/bin/env bash
# The non-Apple code on the macOS development machine (PLAN M6), as far as
# it can run here:
#   1. build-m6-portable: -DNT_PORTABLE=ON builds without VideoToolbox and
#      with the portable platform code (CPU counters, no App Nap or occlusion
#      hooks); its ctest runs, the hardware decode tests skip.
#   2. build-m6: with a Vulkan-Headers folder, VulkanInterop.cpp and the
#      Linux branch of HwWindow.cpp compile against Qt's Vulkan API and
#      FFmpeg's DRM headers (objects only, not linked or run).
# The Windows D3D11VA path needs the Windows SDK and is not compiled here.
# Builds run at low priority with 3 jobs (NT_JOBS overrides).
set -euo pipefail

cd "$(dirname "$0")/.."
qt=$(brew --prefix qt)
jobs=${NT_JOBS:-3}
headers=build-vulkan-headers/Vulkan-Headers-1.3.290/include
if [[ ! -d "$headers" ]]; then
    mkdir -p build-vulkan-headers
    curl -sSfL -o build-vulkan-headers/h.tar.gz https://github.com/KhronosGroup/Vulkan-Headers/archive/refs/tags/v1.3.290.tar.gz
    tar xzf build-vulkan-headers/h.tar.gz -C build-vulkan-headers
fi

cmake -S . -B build-m6-portable -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_PREFIX_PATH="$qt" -DNT_PORTABLE=ON > /dev/null
nice -n 10 cmake --build build-m6-portable -j "$jobs"
(cd build-m6-portable && ctest -j 2 --output-on-failure)

cmake -S . -B build-m6 -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_PREFIX_PATH="$qt" \
    -DNT_CHECK_VULKAN_HEADERS="$PWD/$headers" > /dev/null
nice -n 10 cmake --build build-m6 -j "$jobs" --target nt_linux_hw_check
nm -C build-m6/CMakeFiles/nt_linux_hw_check.dir/src/preview/hw/VulkanInterop.cpp.o | grep -q "VulkanInterop::wrap" ||
    { echo "error: the Linux hardware path was not compiled" >&2; exit 1; }
echo "portable build tested; Linux hardware path compiled"
