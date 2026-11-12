# Render scheduling

`RenderSchedule` is the scheduling and texture-lifetime portion of WP08. It does
not encode WebGPU commands or render pixels. The wgpu-native backend, shader
catalog integration, texture presenter and asynchronous readback are still
required before WP08 can meet its exit criteria.

## Preparation and ownership

`prepare` validates the render/control projection through the canonical loader,
resolves session, fixed and input-relative dimensions, and lowers graph names
to indices. It rejects delayed-input modules until WP23, invalid dimensions,
retained consumers of volatile outputs and texture budgets too small for the
live outputs. Only ancestors of the present source receive execution storage.

The schedule owns metadata, cached values and command arrays. It retains no
borrowed JSON. After preparation it belongs exclusively to one render thread
and is destroyed after that thread stops using it. It creates no workers.

GPU ownership belongs to the future backend. `textures()` describes its fixed
allocations. Texture slots occupy the first entries in declaration order,
followed by volatile and retained pool textures. `passes()` describes module
keys, ordered input names, uniform counts and output contracts. Color-space
tags are preserved independently of physical texture compatibility. Pass
outputs are premultiplied, as enforced by the loader. Slot alpha modes and the
requested presentation color space remain available to the backend.

Resizing or changing a slot's dimensions requires preparing a replacement
schedule and backend resources before activation. That replacement starts with
invalid outputs. In-place resource resizing and cross-plan cache migration are
not implemented.

## Frames and invalidation

The host evaluates control registers before `beginFrame` and supplies stable
register and slot-version snapshots. A slot's version must change when its
pixels or backing texture change. Texture dimensions, format and interpretation
must still match the prepared slot contract. There is no concurrent mutation
or synchronization inside this API.

`beginFrame` validates referenced uniform values before mutating state. It
returns indexed pass commands with borrowed input and uniform spans. It does
no JSON parsing, allocation, I/O or GPU calls. The backend must encode the
commands in their returned order and copy/present the reported source before
completing the frame. This order preserves volatile texture lifetimes.

A retained pass runs when its cached output is invalid, a source version
changes, or a uniform value changes. Slot changes propagate through versions.
Dimension changes invalidate outputs through replacement preparation. Volatile
passes run for every active frame, including paused edits that need their
outputs reconstructed. An unchanged paused frame requests no presentation.
An exposed or reconfigured target can request presentation of a retained output
without rerunning that pass.

An accepted frame with `present == true` must receive `completeFrame` before the
next `beginFrame`. Successful completion commits output validity. Failed
encoding/submission invalidates cached outputs and rebuilds the cache lists
without allocation, so the host can retry. Device loss must still stop the host.
The backend must not report success after dropping a command or failing to
present. Returned spans must not be retained into the next frame.

## Texture budget and retention

The default budget is 512 MiB. It includes declared texture slots and both
execution pools. The host reserves bytes for other session textures, including
its present target, through `reservedTextureBytes`. Uniform buffers, staging
buffers and metadata need separate accounting in the backend.

Volatile textures are assigned by liveness within a frame. A producer's texture
cannot be reused until its final consumer has encoded its read. Retained
textures never enter that pool. Preparation reserves enough retained cells for
the maximum simultaneously live outputs of each dimension/format group, then
uses spare budget to preserve more outputs across frames.

Retained cells use intrusive LRU lists. A pass pins its cell through its final
consumer. Only unpinned cells can be evicted. Eviction clears the previous
owner's validity and texture index, forcing recomputation when needed. Lists
and commands use storage allocated during preparation. Pool compatibility
requires identical dimensions and format. Each group has a fixed prepared
capacity, so a cell cannot be reassigned to a different format or size during a
frame. Minimum live-set requirements are reserved before optional cache space.

## Verification still needed

### Native pipeline API blocker

The graph runner pins wgpu-native `v29.0.1.1` in
[host-image-gpu.cmake](../graph-runner/cmake/host-image-gpu.cmake).
[Design section 9.2, rule 4](../../docs/plans/graph-runner-realtime.md#92-device-presenters-and-the-shared-queue)
requires shader compilation information and asynchronous pipeline status
callbacks without concurrent device-wide error scopes. That release exports
`wgpuDeviceCreateComputePipelineAsync`, `wgpuDeviceCreateRenderPipelineAsync`
and `wgpuShaderModuleGetCompilationInfo`, but their bodies are
[`unimplemented!()` stubs](https://github.com/gfx-rs/wgpu-native/blob/v29.0.1.1/src/unimplemented.rs).
The same stubs exist in the inspected
[upstream revision](https://github.com/gfx-rs/wgpu-native/blob/589e6caa4e9fa5596f601e82ca5d3937a1afc829/src/unimplemented.rs).
Header availability therefore does not establish runtime support. These entry
points must not be called by the backend.

Backend implementation needs a decision: either maintain a native API patch,
or authorize an explicit provisional offline-only exception that creates
pipelines synchronously before activation on a private device. The latter
would not qualify shared-device live preparation or resolve RT-F44. The design
has not been changed, and no fallback has been implemented. This finding comes
from source inspection, not a runtime test.

### Pending execution evidence

The `realtime-render-schedule` test source covers 100-frame retention beside a
volatile chain, synthetic pixel preservation, liveness reuse, LRU pressure,
uniform/slot invalidation, paused edits, target exposure, failed submissions,
dimension changes, rejection cases and a 2,000-pass chain. It includes a C++
allocation counter with a positive control. Test execution is deferred at the
user's request. These fixtures use a CPU command consumer and cannot establish
GPU output correctness or adapter support.

WP08 still needs asynchronous pipeline creation with status handling, cached
bind groups, one packed uniform buffer per frame, actual texture presentation,
three staging buffers with nonblocking mapping, and three software-adapter
shader-chain goldens. The allocation checks, sanitizer runs and mandatory
repository checks must run on the final implementation. Earlier audio/control
results do not validate this increment. M0 hardware gaps remain in
[M1_STATUS.md](M1_STATUS.md).
