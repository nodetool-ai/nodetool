# Render scheduling

`RenderSchedule` manages scheduling and texture lifetimes. `OfflineGpu` adds a
provisional private-device wgpu-native backend for WP08. Software-adapter pixel
references and native host sanitizers pass in the configurations recorded below.
Neither class supplies live/shared-device support.

## Preparation and ownership

`prepare` validates the render/control projection through the canonical loader,
resolves session, fixed and input-relative dimensions, and lowers graph names
to indices. It rejects delayed-input modules until WP23, invalid dimensions,
retained consumers of volatile outputs and texture budgets too small for the
live outputs. Only ancestors of the present source receive execution storage.

The schedule owns metadata, cached values and command arrays. It retains no
borrowed JSON. After preparation it belongs exclusively to one render thread
and is destroyed after that thread stops using it. It creates no workers.

GPU ownership belongs to the backend. `textures()` describes its fixed
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

### Native pipeline API limitation

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

The approved [offline M1 exception](../../docs/plans/graph-runner-realtime.md#provisional-offline-m1-exception-rt-f44)
permits synchronous pipeline preparation and validation scopes on a private
device before activation. `OfflineGpu` implements that path. It creates no
shared device, accepts no external native handles and has no live-session
attachment. Its validation checkpoints preserve the graph-node diagnostic.
The live/shared-device compilation and callback path remains blocked. The
dependency finding comes from source inspection, not a runtime test.

### Offline backend

Enable `NT_REALTIME_OFFLINE_GPU=ON` to build `nodetool_realtime_offline_gpu` and
its fixture executable. The core-only default still needs no GPU dependency.
The optional target downloads the same pinned wgpu-native release and hashes as
the graph runner. Its catalog comes from the existing
`graph-runner/guest/host/gpu-catalog.mjs` exporter, using built package outputs.
The preparation API takes that format-1 JSON and the trusted IR module registry.

One offline host thread owns the instance, adapter, device, queue, schedule,
pipelines, textures, bind groups and staging buffers. Each C handle has an RAII
owner. Callback records outlive the device and instance and publish status through
atomics. Destruction cancels mappings and destroys the private device while those
records are still alive. Native device release may wait while draining GPU work,
so teardown is not a realtime operation. It introduces no worker threads or global GPU cache.

Preparation creates fragment or compute pipelines, the full texture pool, a
premultiplied RGBA8 session target and a white default texture for optional
catalog inputs. The target and white texture count against the texture budget.
Recipes must already be lowered into passes. Only single-sample 2D float texture
bindings, write-only storage outputs, ordinary samplers and uniform buffers are
supported. Alpha contracts must match explicitly. Unsupported contracts reject
preparation rather than silently changing the shader.

Each IR uniform addresses one expanded catalog field in catalog order, including
individual array elements. Scalar/vector widths must match. Fields are packed
into one aligned frame buffer, capped at 64 MiB and the device limit. Floating
point values must fit float32. Integer fields use the catalog's modulo-2^32
conversion. Each block declares its binding size and selects its aligned range
with a dynamic offset during encoding. A frame writes this buffer at most once
and submits one command
buffer. No JSON parsing or application-owned container growth occurs in the
frame path. Driver-internal allocations remain unmeasured.

All possible input/output bind groups are prepared before activation. The fixed
cache limit defaults to 32,768, including presenter groups. Large Cartesian
products reject preparation with a diagnostic. This bounds storage and prevents
bind-group creation during execution. Candidate lists come from the scheduler's
retained pools and volatile assignments. Runtime selection uses sorted lookup.

The presenter scales by nearest texel lookup and writes premultiplied RGBA8. It
converts between linear and sRGB/encoded-SDR transfer functions on unassociated
RGB before restoring alpha association. Data-tagged textures require data
presentation. It owns no window or surface. Presentation dimensions are fixed
until replacement preparation.

`uploadSlot` accepts exact-size, tightly packed interleaved RGBA texel bytes: RGBA8 or
IEEE half RGBA according to the slot format. Bytes must already match the declared
alpha/color convention. The host increments the slot version after a write.
Unuploaded reachable inputs reject execution, while unrelated slots do not block
the pruned present chain. All calls stay on the same owning host thread.

Readback uses three prepared buffers with 256-byte row alignment. A requested
capture when all three are occupied rejects before advancing the schedule.
`poll` performs one nonblocking native poll and dispatches events. `takeReadback`
copies the oldest ready frame to caller storage, strips row padding and unmaps
the buffer. It does not wait. Device errors latch failure and require destroying
the backend rather than pretending cached output remains valid.

### Execution evidence and remaining gaps

The Windows offline harness passes `realtime-render-schedule`, including
retention, liveness reuse, LRU pressure, invalidation, paused edits, failed
submissions, a 2,000-pass chain and a C++ allocation counter with a positive
control. These CPU fixtures do not establish driver allocation behavior.

The software-adapter GPU fixture passes four shader-chain pixel references,
compute upload/readback, optional-mask defaults, unused-slot readiness,
readback ordering/backpressure, invalid preparation and pending-map destruction.
It requests a software adapter and fails when one is unavailable.

The retention fixture combines a retained red source with an alternating green
volatile chain for 101 frames. A separate schedule instance checks that the
retained producer runs once and four volatile passes run every frame, using
two pool textures. GPU readbacks check both channels on every frame, and a
deliberately corrupted retained pixel fails the comparator. These schedule
counts are not direct GPU execution counters. Preparing the same pass graph
with an 8×8 session replaces the 4×4 resources and passes the resized golden.
This covers offline replacement preparation, not in-place live resizing.

The cache-pressure fixture checks pixels while three retained passes share two
execution textures. A separate schedule instance verifies eviction and live-input
protection. The GPU budget includes the present target and default white texture,
and preparation rejects a budget one byte below the minimum.

The readback fixture fills all three staging slots with different frame colors,
then consumes and refills each slot while older captures remain queued. Frame
numbers and pixels must remain ordered after a rejected full-ring submission.
A short readback span must reject without consuming the capture. Teardown cases
leave either one or three map requests outstanding. These are C++ host-lifetime
checks, not an allocation audit of the prebuilt GPU library or driver.

Static uniform ranges produced incorrect per-pass values on the tested pinned
Windows D3D12 backend. Explicit block sizes alone did not fix same-sized blocks
with different values. Binding each aligned range through a dynamic offset
passes both cases. The underlying backend cause is not established. No pixel
reference was relaxed.

The Windows ASan offline harness also passes, including pending-map teardown.
The prebuilt GPU library and driver are not instrumented. Standalone Linux
lavapipe Release and ASan/UBSan checks pass with leak detection enabled.
Full-host Linux Release, ASan/UBSan and TSan also pass at `d1656fead3`.
The expanded retention/resize fixture passes Windows Release and ASan, and
standalone Linux lavapipe Release and ASan/UBSan at `0c09a8c5dc`. Full-host
sanitizer qualification of that fixture remains pending. Driver allocation checks
and live preparation remain pending. Live/shared-device support still requires
supported asynchronous compilation/error reporting outside the offline
exception. See [verification details and M0 gaps](M1_STATUS.md).
