# wgpu-native native interop

`native-interop.patch` adds native handle functions to wgpu-native v29.0.1.1
(commit `6aed50955d934ac36049ba8d002034841633ae02`). Texture sharing on Vulkan
([gpu_share.h](../../src/host/gpu_share.h)) needs them. The release binaries
that [gpu-device.cmake](../../cmake/gpu-device.cmake) pins do not have them,
so a build with the pinned binaries has no Vulkan texture sharing and says so
in `Device::shareSupport()`.

## What the patch adds

The pinned release exports `wgpuDeviceGetNativeMetalDevice` and
`wgpuTextureGetNativeMetalTexture`. Its `wgpuQueueGetNativeMetalCommandQueue`
returns null on every platform. It has nothing for Vulkan or D3D12. The patch
adds the same kind of function for those backends, in `ffi/wgpu.h` and
`src/lib.rs`:

| Function | Returns |
|---|---|
| `wgpuDeviceGetNativeVulkanInstance` | `VkInstance`, borrowed |
| `wgpuDeviceGetNativeVulkanPhysicalDevice` | `VkPhysicalDevice`, borrowed |
| `wgpuDeviceGetNativeVulkanDevice` | `VkDevice`, borrowed |
| `wgpuDeviceGetNativeVulkanQueue` | `VkQueue`, borrowed, externally synchronized |
| `wgpuDeviceGetNativeVulkanQueueFamilyIndex` | the queue's family index |
| `wgpuTextureGetNativeVulkanImage` | `VkImage`, borrowed |
| `wgpuDeviceCreateTextureFromNativeVulkanImage` | a texture over a caller-owned `VkImage`, with a drop callback |
| `wgpuDeviceGetNativeD3D12Device` | `ID3D12Device`, borrowed |
| `wgpuTextureGetNativeD3D12Resource` | `ID3D12Resource`, borrowed |

`WGPU_NATIVE_INTEROP_REVISION` in `wgpu.h` marks a build that has them. The
build system looks for it.

Every function returns null, zero or `UINT32_MAX` on another backend. No
existing function, struct or enum value changes, so a program built against
the pinned header links and runs against the patched library.

The getters call wgpu-core's `device_as_hal` and `texture_as_hal`, as the
Metal getters do. The texture import calls wgpu-hal's `texture_from_raw` with
`TextureMemory::External` and wgpu-core's `create_texture_from_hal`. The
patch adds `ash` and `windows-core` as direct dependencies at the versions
wgpu-hal already resolves, for the handle conversions.

The D3D12 functions are compiled only on Windows. They have not been built or
run: nothing uses them yet.

## Build

```bash
native/graph-runner/third_party/wgpu-native/build.sh <output-dir>
```

Then configure a project with `-DNODETOOL_WGPU_NATIVE_DIR=<output-dir>`. The
script clones the tag, checks the commit, applies the patch and runs
`cargo build --release --locked`. It needs cargo and libclang.

## Upstream

The functions follow the naming and the ownership rules of the Metal getters
that wgpu-native already has, so they can be proposed upstream as they are.
Until a release contains them, this patch must be rebased when the pinned
version changes: the pin in `gpu-device.cmake` and the tag and commit in
`build.sh` move together.
