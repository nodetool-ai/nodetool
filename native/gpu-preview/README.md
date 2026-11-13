# nodetool-gpu-preview

A Qt Quick item that shows textures of the graph runner's wgpu-native engine
without reading pixels back. A WGSL shader writes a texture on the wgpu
device, and the Qt scene graph samples that same GPU memory. The item is
ordinary scene graph content: other items draw over it, and it takes part in
clipping, opacity and transforms.

The module is separate from the timeline and from the graph runner. The
runner stays free of Qt: it only gains shareable textures
([gpu_share.h](../graph-runner/src/host/gpu_share.h)). The timeline's
compositor and hardware decoding are unchanged.

## Status

| Platform | Mechanism | Source | Compiled | GPU validation | Run |
|---|---|---|---|---|---|
| Linux, Vulkan | Two `VkDevice`s, memory shared as an opaque file descriptor, ownership moved with queue family transfers | Complete | Yes, GCC 13 | Validation layer 1.3.275, see [Validation](#validation) | Yes, on Mesa lavapipe (a software driver). No hardware GPU was available |
| macOS, Metal | One `MTLDevice` in both runtimes, the consumer holds a retained `MTLTexture` | Written | No | No | No |
| Windows, D3D12 | None | Not implemented. Both sides report sharing as unavailable | No | No | No |

Linux needs a wgpu-native with the native interop functions
([third_party/wgpu-native](../graph-runner/third_party/wgpu-native/README.md)).
With the pinned release binaries the module builds, and the item reports that
sharing is unavailable.

The macOS code (`src/MetalImporter.mm`, and the Metal branch of
`gpu_device.cpp`) was written without a compiler or a Mac. Treat it as
unverified until the macOS job of
[native-gpu-preview.yml](../../.github/workflows/native-gpu-preview.yml) has
built it and run the tests.

On Windows, wgpu's device and Qt's would have to share an `ID3D12Resource`
and agree on its resource state at each handoff. The patch exports the
`ID3D12Device` and `ID3D12Resource` of wgpu, and nothing more was built. The
timeline's window renders with Direct3D 11 for D3D11VA decoding, so a
Direct3D 12 item could not live in that window either.

## How a frame travels

```text
producer thread                         render thread (Qt scene graph)
───────────────                         ──────────────────────────────
slot = ring.beginWrite()
texture.reclaim()        take the content back from the consumer side
device.runInto(...)      the shader writes the shareable texture
texture.publish()        wait for the GPU, hand the content over
ring.publish(slot)  ───────────────▶    frame = ring.present()
                                        importer.acquire(frame)   open once, take the content
                                        draw with the texture
                                        importer.release(old)     after the next frame replaced it
ring: slot is free  ◀───────────────    ring.retire(old)          once Qt's GPU finished with it
```

`FrameRing` holds three slots. A slot is written only in the `Writing` state
and sampled only in `Displayed` or `Retiring`, so the producer never writes a
texture the scene graph samples. When no slot is free the producer skips the
frame and the item keeps showing the last one. Nothing on the render thread
waits for the producer.

### Vulkan

wgpu-native and Qt each create their own `VkDevice`. Sharing one device would
put both runtimes on one `VkQueue`, which Vulkan requires to be externally
synchronized and which neither runtime can lock for the other.

1. `Device::createShareable()` creates a `VkImage` with dedicated, exportable
   memory on wgpu's device and wraps it as a `WGPUTexture`
   (`wgpuDeviceCreateTextureFromNativeVulkanImage`). wgpu-native calls a drop
   callback after the last GPU work that uses the texture. The callback
   destroys the image and frees the memory.
2. `SharedTexture::open()` exports the memory as an opaque file descriptor
   (`vkGetMemoryFdKHR`). `VulkanImporter` creates an image with the same
   parameters on Qt's device and imports the memory. A successful import owns
   the descriptor.
3. Before importing, the importer compares `deviceUUID` and `driverUUID` of
   both physical devices and asks the driver whether the format is importable.
   A mismatch is an error on the item. There is no path that copies pixels.
4. `publish()` waits until wgpu's queue is empty, then releases the image to
   `VK_QUEUE_FAMILY_EXTERNAL` in `SHADER_READ_ONLY_OPTIMAL`. `acquire()` takes
   it for Qt's queue family, `release()` gives it back, and `reclaim()` takes
   it for wgpu again and restores the layout wgpu-hal tracks.
5. The window needs `VK_KHR_external_memory_fd` on its device.
   `nt::preview::prepareWindow()` asks for it before the window is shown.

### Metal

Metal has one `MTLDevice` object per GPU, so wgpu and Qt hold the same device
when they use the same GPU. The importer checks the registry id and the
device identity. A texture of that device is valid in Qt's command buffers
as it is, so `open()` returns a retained `id<MTLTexture>`. Ordering comes
from completion: `publish()` waits for wgpu's command buffers, and
`release()` commits an empty command buffer on Qt's queue and waits for its
completion handler.

## Ownership and threads

| Object | Owner | Threads | Destroyed |
|---|---|---|---|
| `WGPUTexture` of a shareable texture | `ShareState` (the device's `SharedTexture`), shared by the device's table, the ring and the importer | Any | When the last holder lets go. `release()` and `releaseRun()` only remove the id |
| Exported `VkImage` and memory | wgpu-native, through the texture's drop callback | Freed on the thread that runs the callback | After the texture is released and its GPU work completed |
| `FrameRing` | Shared by the producer and the scene graph node | Thread-safe, one mutex | With its last holder |
| `ShaderFrameSource` worker | The source, a `std::jthread` | Its own thread. State crosses under `ShaderWorkerState::mutex`, notifications as queued calls | Joined in the source's destructor |
| `PreviewNode`, `TextureImporter`, imported `VkImage`, memory and `QSGTexture` | The scene graph | Render thread only | With the node: when the item leaves the scene or the scene graph is invalidated. The importer first returns every texture to the producer |
| `GpuPreviewItem`, `GpuFrameSource` | Their QObject parents | GUI thread. `updatePaintNode()` sends its result to the GUI thread as a queued call by value | With their parents |

## Build

Qt 6.12 with Qt Quick and Shader Tools. The build rejects other minor
versions, because wrapping a float texture needs
`QQuickWindowPrivate::createTextureFromNativeTexture()`.

```bash
native/graph-runner/third_party/wgpu-native/build.sh /path/to/wgpu-interop
```

```bash
cmake -S native/gpu-preview -B native/gpu-preview/build -G Ninja -DCMAKE_PREFIX_PATH=/path/to/Qt/6.12.0/gcc_64 -DNODETOOL_WGPU_NATIVE_DIR=/path/to/wgpu-interop
```

```bash
cmake --build native/gpu-preview/build
```

On Linux the Vulkan headers must be installed (`libvulkan-dev`). On macOS
the pinned wgpu-native is enough, so omit `NODETOOL_WGPU_NATIVE_DIR`.

## Use

```qml
import NodeTool.GpuPreview

ShaderFrameSource {
    id: source
    catalog: catalogJson           // a shader catalog document
    module: "demo.plasma@1"        // a compute or fragment module of it
}

GpuPreviewItem {
    anchors.fill: parent
    source: source
}
```

Call `nt::preview::prepareWindow(window)` before the window is shown.
`GpuPreviewItem.status` is `Unavailable` with `statusText` set when the window
or the device cannot share. `ShaderFrameSource.stats()` returns the counters
of `ShareStats`. A producer other than `ShaderFrameSource` subclasses
`GpuFrameSource` and drives the ring itself.

## Demo

`nodetool-gpu-preview-demo` runs `demo/plasma.wgsl` as a compute module and
shows it under a moving QML rectangle and a status line.

```bash
native/gpu-preview/build/nodetool-gpu-preview-demo --size 1920x1080 --frames 120
```

`--frames` quits after that many displayed frames and prints the counters as
JSON. `--float` uses the rgba16float module, `--free` renders without waiting
for the display.

## Tests

```bash
xvfb-run -a ctest --test-dir native/gpu-preview/build --output-on-failure
```

| Test | Checks |
|---|---|
| `tst_gpupreview` | Window pixels of a compute shader's output, orientation, QML above the item, clipping, opacity, premultiplied alpha, fill modes, a float texture, resize, pause, rapid replacement, scene graph recreation, minimize, two items, create and destroy cycles, shader errors, an unprepared window |
| `tst_gpupreview_software` | A window without a GPU device refuses with a reason |
| `tst_gpupreview_validation` | The suite under the Vulkan validation layer on both devices |
| `gr_gpu_share_tests` | The ring's state machine and the device's shareable textures, without Qt |
| `gr_gpu_share_validation_tests` | The same under the validation layer |

`-DNT_SANITIZE=address,undefined` and `-DNT_SANITIZE=thread` build with
sanitizers. In a ThreadSanitizer build a test fails when a report has a frame
in this module or in the graph runner. Reports inside Qt, lavapipe and GLib,
which are not instrumented, do not fail it.

### Validation

The headless test is clean under the validation layer. The Qt suite produces
one message class, `UNASSIGNED-CoreValidation-DrawState-InvalidImageLayout`
on Qt's device, for every use of an imported image. Qt's device has never
transitioned that image, so the layer records `UNDEFINED`, while the acquire
names `SHADER_READ_ONLY_OPTIMAL`, the layout the exporter left. Starting from
`UNDEFINED` would silence the layer and allow the driver to discard the
frame. `tests/run-validation.cmake` accepts that one message and fails on any
other. Whether a newer validation layer still reports it was not checked.

## Measurements

One run each of the demo with `--frames 120`, on Mesa lavapipe 25.2.8 (Vulkan
on the CPU), 4 cores of an Intel Xeon at 2.1 GHz, under Xvfb. The driver
executes the compute shader on the CPU, so these numbers say nothing about a
hardware GPU. The target of 60 frames per second at 3840×2160 was not met
here and remains unmeasured on hardware.

| Frame | Pacing | Frames per second | CPU transfers | GPU copies | Textures created | Dropped | Wait for GPU, mean | Latency, mean |
|---|---|---|---|---|---|---|---|---|
| 1920×1080 rgba8unorm | display | 58.7 | 0 | 0 | 3 | 0 | 12.7 ms | 17.9 ms |
| 3840×2160 rgba8unorm | display | 19.2 | 0 | 0 | 3 | 0 | 46.3 ms | 52.0 ms |
| 1920×1080 rgba16float | display | 47.3 | 0 | 0 | 3 | 0 | 15.5 ms | 21.3 ms |
| 1920×1080 rgba8unorm | free | 69.7 | 0 | 0 | 3 | 68 | 11.5 ms | 16.5 ms |

"Wait for GPU" is the time `publish()` waited, which includes the shader's
run time. "Latency" runs from the start of a frame's write to its first
presentation.

## Limits

- No hardware GPU run on any platform. Cross-device sharing between two
  Vulkan devices of a hardware driver is unverified.
- macOS is unverified, Windows is not implemented (see [Status](#status)).
- Device loss was not tested. A lost wgpu device makes `publish()` throw, and
  the source reports the error. `Device::acquire()` keeps a lost device for
  the life of the process, so frames do not resume. A lost Qt device
  invalidates the scene graph, which the recreation test covers.
- One item per source. A second item on the same source would take frames
  from the same ring.
- Output textures of `Device::run()` cannot be shared on Vulkan: their memory
  is not exportable. A graph output reaches the item only when it was written
  with `runInto()` into a texture from `createShareable()`.
- The timeline's preview does not use this module. Its window asks for its
  own Vulkan device extensions, and `prepareWindow()` keeps those.
