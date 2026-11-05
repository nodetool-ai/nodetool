# Plan 1: FP16 timeline processing

Deliver FP16 with existing effect meanings, then qualify linear-light SDR in a separate milestone. FP16 delivery does not wait for that behavior change. [Plan 2](native-timeline-precision.md) is a deferred native follow-up. [Plan 3](sketch-precision.md) evaluates image storage and editing separately. See [research notes](research-notes.md) for source evidence.

## Decisions

| Decision | Contract |
|---|---|
| **D1: Improve SDR processing first.** | FP16 working color for timeline effects/compositing, with existing 8-bit sources and delivery. Sketch evaluates FP32 working pixels separately. |
| **D2: Keep controls simple.** | No user-facing precision setting. Add web preview resolution controls only if measured cost requires them. Native controls do not determine web UI scope. |
| **D3: Bound the color work to SDR.** | Establish accurate color contracts with FP16. S6 separately introduces one linear-light SDR working space. Defer HDR, wide-gamut workflows, selectable working profiles and a general color-management framework. |
| **D4: Reuse rendering modules.** | Share relevant alpha/transfer helpers, effect parameters and numerical fixtures. Keep necessary GLSL/WGSL implementations. No universal shader compiler or new render framework. |
| **D5: Precision is a renderer choice. The working color space is versioned.** | Do not save an FP16 profile in timeline documents. Use a small internal renderer option for experiments and rollout. The document stores a version of its working color space. Existing documents keep today's rendering on web and native, and a document moves to linear-light SDR only through that version, so version 1 rendering stays supported. Decision taken on 2026-11-04, for heavy-d to confirm. See [D5.1 to D5.6](#working-color-space-version). |
| **D6: Preserve originals.** | Keep source assets encoded or in their original representation. Convert only for processing. Standard image storage is preferred over a custom float serialization format. |
| **D7: Use shared shaders with explicit runtime requirements.** | Require WebGPU for browser timeline/sketch rendering. Use hardware or Dawn/lavapipe for server/agent rendering. Retire separate Canvas2D renderers after each replacement passes. Preserve source rasterizers and unmigrated editing internals. No new renderer or fallback framework. |
| **D8: Add performance features only when needed.** | No adaptive controller, new proxy service or speculative cache framework. Existing proxies remain approximate and never replace originals for final export. |
| **D9: Reuse version history.** | Working-precision changes need no document copy or migration notice. If sketch persistence changes, use existing version snapshots and protect original assets. No reverse converter or exact legacy-pixel promise. |
| **D10: Separate precision from color semantics.** | S0–S5 preserve operation order and parameter meanings. S6 changes color processing explicitly, with its own fixtures and release gate. FP16 alone does not correct gamma-space blending. |
| **D11: Store image documents independently of canvases.** | Saved rasters and original references must be readable outside the browser. GPU handles and viewport captures are not document formats. |
| **D12: Justify broader GPU image editing.** | Establish source-depth needs, then compare a small GPU proof with the existing editor. Add a bounded float16 Canvas experiment only if it can meet those needs and reduce migration cost. Ship one chosen approach, not several precision modes. |
| **D13: Keep image edits recoverable.** | Save, undo and export use completed revisions. Reuse history snapshots and autosave. Working precision, durable encoding and recovery policy are separate contracts. |
| **D14: Use one linear-light SDR working contract.** | S6 uses linear RGB with sRGB/Rec.709 primaries. Decode and encode transfer functions at declared boundaries. Normal compositing, resampling and blur use linear light. Artistic effects retain their declared domains. Alpha, masks and other data are not gamma-converted. |

## Render surfaces and existing behavior

This inventory covers the entry points affected by these plans. A90 traces their shared implementations and any additional callers before changing defaults. It is a table, not a new registry or routing service.

| Surface | Existing path | Treatment in this initiative |
|---|---|---|
| Web timeline preview and browser export | [TimelineRenderer](../../../web/src/components/timeline/render/TimelineRenderer.ts), [WebGPU/Canvas2D factory](../../../web/src/components/timeline/preview/gpu/createCompositor.ts) | Qualify FP16 preview and real browser export, then require WebGPU and retire automatic Canvas2D selection. Keep unaffected document access available. |
| Workflow/server timeline export | [RenderTimeline](../../../packages/video-nodes/src/nodes/timeline.ts) can try browser rendering, then Node compositing, with a restricted rough-cut fallback | Exercise the actual route selection. Qualify Node/Dawn on hardware and the software adapter used by the server image. Rough cut is not precision-equivalent output. |
| Node timeline compositor | [frameCompositor](../../../packages/timeline/src/render/frameCompositor.ts), [Node GPU factory](../../../packages/gpu/src/node.ts) | Same shader precision contract on hardware and lavapipe. Separate numerical correctness from server throughput. |
| Agent timeline preview/comparison | [frames](../../../packages/agents/src/timeline-preview/frames.ts), [comparison](../../../packages/agents/src/timeline-preview/compare.ts) use Canvas2D and CPU effect passes | Migrate to the existing shared headless compositor on hardware or Dawn/lavapipe after server qualification. Preserve tool contracts and regression coverage. |
| Workflow image processing | [image nodes](../../../packages/image-nodes/src/nodes/lib-shader-utils.ts) use shared GPU modules | Keep existing recipe defaults stable. Test affected callers without migrating all image nodes to a new representation. |
| Web sketch editing | [WebGPURuntime](../../../web/src/components/sketch/rendering/WebGPURuntime.ts) with canvas-backed edits/save | P3 evaluates storage and a small GPU editing path. Existing behavior remains during the proof. |
| Agent/CLI sketch rendering and editing | [document renderer](../../../packages/image-editor/src/render/document.ts), [agent host](../../../packages/agents/src/sketch-render/render.ts), [CLI](../../../packages/cli-sketch/src/commands/sketch-render.ts) | Follow the same shared-shader policy through P3's separate proof. Keep the current path until its replacement preserves the required operations/data. Do not make the timeline migration wait for sketch. |
| Native timeline | Branch implementation documented in [P2](native-timeline-precision.md) | Deferred until native integration is scheduled, except A108, which ships before A102. Reuse numerical vectors without making P1 depend on that branch. |

The [production Docker image](../../../Dockerfile) installs lavapipe. Do not classify it as test-only or assume a physical GPU. Verify the runtime adapter in qualification reports rather than inferring live deployment hardware from the Dockerfile.

### Server and browser policy

| Decision | Application |
|---|---|
| **D7.1: Server, agents and CLI** | Use the same effect/compositing code through WebGPU, with qualified hardware or Dawn/lavapipe. Migrated preview/render commands require Dawn and an adapter on that host. A physical GPU is unnecessary, but hosts without an adapter receive an actionable error. Keep ordinary agent tools independent of native renderer initialization. |
| **D7.2: Browser and Electron renderer** | The chosen direction is required WebGPU for timeline/sketch rendering. Compatibility retirement is separate from FP16 delivery. Keep existing Canvas2D selection until browser and packaged Linux desktop qualification pass. Add no new effects to that path. Then remove it through A94 or P3's own gate. Check operation-specific features and preserve work on failure. |
| **D7.3: Native** | Plan for C++ and Qt/QML. Keep Qt RHI as the baseline. When P2 starts, A96 evaluates whether C++/Dawn shader reuse justifies a renderer change before backend-specific precision work. Otherwise continue with Qt RHI and qualified platform adapters such as Windows WARP. Rust and a universal shader framework are outside this plan. |

Reuse existing device caching, configuration, job limits and diagnostics. Keep CPU decoding, encoding and text/shape source rasterization where useful. No new remote-rendering service, queue system or automatic backend-switching controller is needed. Shared shaders reduce drift but still require numerical tolerances, cold-start and throughput measurements on each adapter.

Switch a server/agent caller only after its replacement passes correctness, resource and completion budgets. Keep native renderer loading lazy and optional for non-rendering agent use. Document the new render-command prerequisites and test minimal installs with no addon/adapter. Then remove obsolete implementations only when no remaining caller needs them. Keep restricted rough-cut behavior/diagnostics unchanged; it cannot satisfy a composited-export or precision gate.

Timeline documents remain openable without an FP16 document gate. On an unsupported browser, explain which rendering/editing operations are unavailable while preserving documents, downloads and unaffected features. WebGPU availability alone does not guarantee FP32 features or successful allocations. For future sketch rasters, qualify viewing, metadata edits and pixel writes separately. Never replace saved data with a failed or lower-precision recovery result.

## S0: Establish coverage, visible benefit and cost

- [x] **A90: Complete the surface inventory.** Trace browser, server, agent, CLI and native callers and tests. Identify renderer prerequisites, lazy-loading boundaries and CPU helpers needed during migration or source rasterization. Include sketch pixel-edit/save callers for P3. Reuse existing harnesses and diagnostics.
- [x] **A81: Prove numerical and visible benefit.** Reconcile the small [inverse-Levels regression](https://github.com/nodetool-ai/nodetool/blob/33963a5d7111bda52f116392d1b7c34eab7e3430/packages/gpu/tests/precision.test.ts) with current code in the existing GPU harness rather than copying it. It exists on `feat/native-timeline` and not on main, whose `packages/gpu` differs. It also hard-codes `rgba8unorm` intermediates and asserts the byte floor (at least 192 levels, at most 11 codes of error), which the requirement below replaces. Add three recognizable scenes: a dark fade, a sky gradient with vignette/blur, and chained grading with glow. Compare identical RGBA8 and FP16 chains with controlled output conversion. Require 256 distinct levels and maximum one-code error for the diagnostic ramp with dithering disabled. Capture realistic final-output comparisons as well as undithered working measurements.
- [ ] **A82: Measure cost on representative routes.** Start with hardware and container Dawn/lavapipe. Measure cold start, steady-state rendering, allocations and transfers using five warmups and twenty alternating samples of the same eight-pass 4K workload. The discrete-GPU trial budget is at most +2 ms median and +3 ms p95. Set server completion and API-latency budgets before measurement. Compare representative API request latency/error rates idle versus during a 4K render. Verify no growth across twenty create/render/dispose cycles. Add a constrained GPU before browser rollout.

  The owner accepted the RTX 3060 cost, but representative API latency during 4K rendering, a no-growth soak and a constrained GPU remain unqualified. See [cost evidence](results/a82-cost.md) and [server measurements](results/s3-operational-budgets.md).

**Exit gate:** visible improvement and server/agent costs are demonstrated with complete caller coverage. Browser rollout also requires constrained-device results. Arithmetic tests alone do not justify rollout.

## S1: Small runtime interfaces

- [x] **A15: Define internal working precision.** Add one renderer option selecting the working format and a reversible rollout switch using existing configuration. Keep timeline schemas and document identities unchanged. Preserve the old renderer behavior during qualification without creating a feature-flag service or user precision menu.
- [x] **A14: Type the working-frame interface.** Carry representation, dimensions, stride, alpha association and known color interpretation. Keep raw RGBA MIME meanings stable. Limit changes to affected render/output interfaces, not Python/provider transport.
- [x] **A97: Make color declarations match actual processing.** Trace affected uploads, module inputs/outputs and presentation/export paths. Correct default or inherited `linear` labels that describe encoded samples. Declare color versus mask/data inputs and the actual transfer/alpha interpretation without inferring it from FP16 storage or a linear sampler. Correct both producers and consumers before enabling mismatch checks on these paths. Add no automatic conversion during this precision milestone. Include shared image-node callers so corrected metadata does not change recipe behavior. Record transfer assumptions found here in A101's inventory.
- [x] **A98: Test unchanged-color boundaries.** Add import/render/export fixtures for supported SDR image/video routes, ramps and low-alpha edges. Establish expected values from the actual decoder output and declared delivery encoding. Detect missing or double transfer conversion and separate codec loss from rendering error. Keep these identity checks distinct from A81's precision-benefit scenes and S6's deliberately changed mixtures. A102 reuses them to pin version 1 rendering.
- [x] **A19: Check actual resource usages.** Validate the formats, limits and usages used by each renderer. Separate the existing `f16Storage` capability from shader-f16 arithmetic. FP16 textures do not need that optional arithmetic feature. Request optional FP32 features only where P3 actually needs them. Handle allocation failure and device loss without changing fallback policy as a side effect.
- [x] **A18: Correct resource keys and byte budgets.** Include format, source revision and render size where needed. Update pools, pipeline compatibility, cache accounting and typed readback layout/lifetime. Keep final byte delivery buffers. Test mixed-format reuse, eviction and release.

**Exit gate:** precision is an internal renderer change with correct resource ownership, truthful color declarations and unchanged-color checks. No document migration is required.

Owner decision, 2026-11-05: S1 passes for “colour doesn't change” with today's export behavior retained. The original six boundary failures were recorded at closeout. The later A101 decision pins three BT.709 routes to O1. VP9 alpha delivery passes on lavapipe with libvpx, while the default-decoder limitation remains B216. P3 PNG normalization and HEVC remain B215 and B217 in the [backlog](../../../native/timeline/docs/gaps-backlog.md). Browser/native delivery and the NVIDIA low-alpha disagreement remain unqualified. See the [S1 gate record](results/s1-runtime-interfaces.md#s1-owner-closeout). S2 has not started.

## S2: Preserve precision through the working chain

Primary modules: [executor](../../../packages/gpu/src/executor.ts), [recipes](../../../packages/gpu/src/recipe.ts), [compositor](../../../packages/timeline/src/render/frameCompositor.ts) and [effects](../../../packages/timeline/src/render/effects.ts).

- [x] **A21: Share necessary alpha/transfer helpers.** Consolidate helpers touched by precision work. Cover zero/low alpha and transfer breakpoints. Share numerical vectors with native code without undertaking unrelated shader cleanup.
- [x] **A22: Add explicit recipe working-format slots.** Only declared working slots inherit precision. Fixed source, mask, LUT and output formats retain their meanings. Reject accidental fixed-byte working-color passes. Update bindings, storage declarations and pipeline keys together. This covers the whole module set, not a few recipes: every shader module declares `rgba8unorm`, 65 of 65 on main and 74 of 74 on `feat/native-timeline` (`git grep -l rgba8unorm <ref> -- packages/gpu/src/shaders`). Of those, 9 and 17 bind it as a storage texture, so their WGSL binding is format-specific. Classify each module's slots before adding formats.
- [x] **A23.1: Upgrade normalization and geometry targets.** Promote byte sources once, then retain FP16 through crop/transform targets. Test subpixel placement and source/display separation.
- [x] **A23.2: Upgrade compositing and transitions.** Cover blend operations and group surfaces while preserving effect semantics.
- [x] **A23.3: Upgrade effect intermediates.** Cover ping-pong targets, adjustments and nested recipes. Trace the full chain for hidden byte conversions.
- [x] **A23.4: Preserve temporal precision.** Retain existing float accumulation and make prior-frame resources format-aware. Test seeks, source changes and cache reset.
- [x] **A24: Remove accidental byte rounding.** Fix byte alpha bridges and storage-driven rounding. Preserve intentional Posterize behavior. Test nearly transparent edges over dark/light backgrounds.
- [x] **A28: Qualify the complete chain and callers.** Extend numerical/effect-parity tests and use existing agent fixtures where applicable. Compare shared shaders on hardware/lavapipe with declared tolerances. Separate geometry/effect correctness from precision differences. Do not weaken assertions to hide missing effects or use a byte renderer as an FP16 oracle. Agent migration has its own gate in A91 and does not block browser precision delivery.
- [x] **A88: Convert at the final output.** Resolve alpha before RGB quantization. Apply stable spatial dithering after final image resampling, never to working textures or alpha. Native explicit-size export resamples bytes today, which P2's A84.2 corrects. For opaque constant patches, require at most one code error and mean bias below 0.1 code across a complete dither tile. Raw working captures remain undithered.

**Exit gate:** the working chain preserves precision and realistic output improves without unintended effect changes. Met for the opt-in shared GPU/headless chain on NVIDIA RTX 3060 and lavapipe. The checked S2 tasks describe that shared implementation. Browser, native and agent-host delivery remain separate qualification gates. See the [A28 closeout](results/s2-working-chain.md#a28-closeout-and-scoped-s2-gate) for measurements and limits.

### Conditional performance work

Only schedule these tasks if A82/A49 show that reduced preview resolution is necessary. They are not prerequisites for precision correctness.

- [ ] **A45: Add web Full/Half/Quarter preview if needed.** Use existing preferences/primitives, default to Full and preserve export resolution. No adaptive switching or new proxy service.
- [ ] **A47: Qualify reduced-resolution geometry if A45 proceeds.** Scale project-space pixel effects. On flat/gradient fixtures require mean error <= 1/255, p99 <= 3/255 and mask displacement <= one reduced pixel against reduced full-resolution output. Test fine spatial effects separately. Keep conservative full-resolution paths where scaling is unqualified.

## S3: Qualify server export

Qualify the existing shared server renderer first. Browser delivery and agent parity then have independent exit gates. A delayed agent dependency migration or CPU-code removal must not hold back browser precision. Sketch and native work remain separate.

- [x] **A40: Preserve precision to encoder conversion.** Keep existing 8-bit delivery. Quantize once into the required layout with explicit range/alpha behavior. Reuse encoding and streaming infrastructure.
- [x] **A42: Qualify the shared server renderer.** Exercise RenderTimeline's existing browser/Node selection and explicitly test Node/Dawn on lavapipe. Verify numerical output, missing-driver errors, cancellation, cold start and resource limits. Reuse the device cache and existing concurrency controls. Keep restricted rough-cut behavior/diagnostics unchanged and identify the actual renderer. No new routing service.
- [x] **A41.2: Check actual video delivery.** Decode output and inspect pixels, formats and tags. Separate codec error from working-precision error. New 10-bit codecs remain deferred.
- [x] **A43.2: Compare full-resolution preview/export before encoding.** Use original assets, identical parameters and seeds. Compare undithered server/browser WebGPU output with explicit tolerances. Include migrated agent output once A91 passes. Name the renderer and working format in reports. Older Canvas2D results cannot certify high-precision output. [Working-frame evidence](results/s3-parity.md): browser/server on same-adapter SwiftShader and migrated agent/server on same-adapter lavapipe (RGBA8).

  A91 is met. The migrated-agent comparison accounts for final RGBA8 resolve
  and lossless PNG delivery against the undithered server working frame.
- [x] **A44: Keep proxies out of final export.** Use originals or report missing media. Approximate proxies cannot satisfy precision/parity gates.
- [ ] **A49: Qualify operational budgets.** Measure 1080p/4K workloads on discrete/constrained hardware and lavapipe. Interactive targets: <1% missed deadlines over two minutes at 1080p30 and warm seek p95 <= max(250 ms, 1.25 times baseline). Server targets: bounded memory, cancellation, completion/throughput and API-latency budgets. Repeat contention tests at configured maximum render concurrency. Measure actual CPU/thread use; job count alone does not bound driver threads. Adjust existing job limits and driver/process settings if needed, without a new scheduler.
  The server half is measured in the [operational report](results/s3-operational-budgets.md), including safety stops and deployment limits. The S3 server gate remains unmet. Browser interactive targets and real constrained hardware remain open.
- [ ] **A50: Enable qualified server rendering.** Use existing internal configuration. Test unavailable adapters, allocation failure, device loss and repeated export. Preserve document access and diagnostics. No document copy flow or new precision UI.

  Owner decision, 2026-11-05: FP16 stays off on the server. A49 measured a 4K FP16 render at 4,091 MiB against the 4 GiB replica limit, and FP16's benefit is only established for dark fades. Each deployed replica sets `NODETOOL_TIMELINE_RENDER_CONCURRENCY=1`. A50 stays open until a future measurement justifies enabling it. See [the budgets](results/s3-operational-budgets.md).

**Exit gate:** shared server rendering meets image, resource, completion and API-contention budgets on its deployed adapter.

## S4: Deliver browser preview and export

The user-visible release includes [ExportVideoDialog](../../../web/src/components/timeline/ExportVideoDialog.tsx) and [useTimelineExport](../../../web/src/hooks/timeline/useTimelineExport.ts), not only the server renderer.

- [ ] **A93: Qualify and enable browser FP16.** Exercise real browser preview and WebCodecs export using A81's scenes on discrete and constrained devices. Meet A49's interactive targets and check pre-encode parity plus decoded delivery. Reuse the [Playwright host](../../../web/playwright.config.ts), verify its actual WebGPU adapter and include SwiftShader numerical qualification alongside lavapipe. Do not infer adapter selection from ANGLE flags or use software timings as hardware evidence. Record renderer/adapter/format diagnostics and validate encoder support separately. This release does not wait for A91/A92 or A94.

**Precision exit gate:** browser preview/export visibly benefit and constrained-device targets pass. Existing Canvas2D behavior can remain while the compatibility tasks below are unfinished.

### Separate compatibility task: Linux Electron

A95 can run before FP16 work and does not depend on S3 or A93. It establishes a usable desktop WebGPU path. A93/P3 subsequently qualify their new working formats on that path. Requiring WebGPU is the chosen product direction, but removing existing access waits for this evidence.

- [ ] **A95: Qualify and fix Linux Electron WebGPU.** Reproduce adapter availability in the packaged app using its pinned Electron/Chromium version. Record GPU/driver and X11/Wayland session, including AMD hardware. Compare default startup with the minimum Linux-only switches needed, applied before app readiness. Treat `enable-unsafe-webgpu` and Vulkan/ANGLE switches as candidates to verify, not a guaranteed fix or a blanket flag bundle. Preserve sandbox settings. Test timeline preview, actual export, Sketch editing/save and device-loss recovery with current formats. Check startup/GPU-process stability and Windows/macOS startup regressions. Record the supported configurations and remaining gaps.
- [ ] **A94: Require WebGPU for browser timeline rendering.** After A93 and A95 pass, remove automatic Canvas2D renderer selection in a separate change. Document supported browser/OS configurations and known exclusions using current platform evidence. Explain unavailable adapters/features, preserve unsaved work and document downloads, and update tests that forced Canvas2D to use the existing qualified Playwright host. Keep source rasterizers. If Linux desktop qualification fails, defer removal while FP16 ships on supported routes. Sketch's editing internals and fallback retirement follow P3.

**Compatibility exit gate:** the packaged Linux desktop works on declared configurations, browser exclusions are documented, and unsupported rendering fails clearly without deleting work. Flags or API presence alone do not pass this gate.

## S5: Agent rendering parity

This track improves effect coverage and consistency, including ordinary 8-bit agent previews. It changes renderer prerequisites and is separate from the browser FP16 release.

- [x] **A91: Move agent timeline rendering to shared shaders.** Adapt preview/comparison callers to the existing headless compositor on hardware or Dawn/lavapipe. Preserve outputs, geometry/timing, source rasterization, diagnostics and cancellation. Load the native renderer lazily at render invocation. Document required addon/adapter setup and test a minimal install: ordinary agent tools still load, while rendering returns an actionable missing-runtime/adapter error. Qualify numerical coverage, startup cost, contention and clean one-shot CLI completion before switching. Do not wrap browser/video export to render a frame.

  The queued child and caller migration are implemented. Memory, queue latency,
  numerical comparisons, complete CLI exit and API contention are recorded in
  [S5 results](results/s5-agent-rendering.md#current-qualification-queued-child-and-migrated-callers).
  The clean local-tarball install loads ordinary tools and returns actionable
  missing-addon guidance, satisfying the minimal-install clause. Registry-only
  installation is blocked by the unpublished `@nodetool-ai/presets` dependency,
  and a clean installed-addon render remains unverified.

  In the same PR, update [root test prerequisites](../../../AGENTS.md) and audit affected CI jobs. The [agent test matrix](../../../.github/workflows/quality-checks.yml) already installs Mesa. Verify other entry points and require real adapter-backed coverage rather than accepting skipped render tests. Keep deliberate no-adapter tests separate.

- [ ] **A92: Retire superseded agent CPU implementations.** After A91 passes, enumerate callers and remove unused effect/compositing code. Hosts without an adapter follow D7.1's explicit error contract. Keep helpers still used by source rasterizers, sketch editing or browser callers that A94 has not yet retired. Retain regression fixtures and no-adapter tests. Move the assertions of [render.precision.test.ts](https://github.com/nodetool-ai/nodetool/blob/33963a5d7111bda52f116392d1b7c34eab7e3430/packages/timeline/tests/render.precision.test.ts) and [render.curveFidelity.test.ts](https://github.com/nodetool-ai/nodetool/blob/33963a5d7111bda52f116392d1b7c34eab7e3430/packages/timeline/tests/render.curveFidelity.test.ts) to the GPU harness before removing the code they cover. [cpuLegacyEffects](../../../packages/timeline/src/render/cpuLegacyEffects.ts) stores `Uint8ClampedArray` pixels, so it is not a float reference, and A28 already bars a byte renderer as an FP16 oracle. After A92, reference coverage is A21's shared numerical vectors, A102's computed values and agreement between hardware and lavapipe. None of these is an independent CPU implementation. The [effects audit](https://github.com/nodetool-ai/nodetool/blob/33963a5d7111bda52f116392d1b7c34eab7e3430/native/timeline/docs/effects-implementation-audit.md#L124) asks for a float CPU reference, while D7 and P2's A50.2 reject a separate CPU effect renderer. This disagreement is recorded in [open items](#open-items).

**Exit gate:** agent previews/comparisons use qualified shared shaders, minimal non-rendering installs still work, and renderer prerequisites are documented and tested.

## S6: Linear-light SDR after FP16 delivery

Schedule after S3/S4 qualify FP16. This milestone does not block their release or depend on agent migration, native integration or Sketch. P2/P3 adopt the same contract through their own follow-ups. Keep existing encoded behavior for version 1 documents, including after the replacement passes. A99 to A102 change rendering only for documents at version 2. No HDR support or general profile-conversion system is required.

### Working color space version

The project owner took this decision on 2026-11-04, following the [effects audit](https://github.com/nodetool-ai/nodetool/blob/33963a5d7111bda52f116392d1b7c34eab7e3430/native/timeline/docs/effects-implementation-audit.md#L124). heavy-d should confirm it. FP16 stays a renderer choice and is not saved.

| Decision | Application |
|---|---|
| **D5.1: Field** | `workingColorSpaceVersion`, a positive integer at the root of the timeline document. It lives in the `timeline_sequences.document` JSON, not a new column, so version snapshots carry it. |
| **D5.2: Values and default** | Absent or 1 means today's encoded SDR rendering. 2 means S6's linear-light SDR. Existing documents stay absent. Load, save, autosave and restore neither add the field nor change its value. |
| **D5.3: Web, server and agents on an unsupported version** | Open the document read-only and name its version and the highest version this build supports. Preview and export produce no pixels under other rules. A route that cannot honor version 2, such as Canvas2D, reports this the same way. Commands return an actionable error. |
| **D5.4: Native on an unsupported version** | The same report, with a nonzero exit from `--export`, `--stills` and the frame server. Absent and 1 keep rendering as they do today. Version 2 is unsupported until A103 passes. |
| **D5.5: Release order** | The native timeline ships as a separate download from Electron, so web and native versions can differ for a long time. S6 can ship before N4 without the same document rendering differently: native renders unversioned documents as today and reports version 2 instead of rendering it. This needs A105 and A108 released before A102 enables version 2. [Native builds without A108](https://github.com/nodetool-ai/nodetool/blob/33963a5d7111bda52f116392d1b7c34eab7e3430/native/timeline/src/model/TimelineJson.h#L17) ignore unknown fields and would render version 2 under version 1 rules with no report, and a later release cannot change a build already installed. |
| **D5.6: For heavy-d to decide** | Whether new documents start at 2, and whether an existing document can move through an explicit action. Whether read-only is the right unsupported-version behavior. Whether Sketch needs the same field for A104. |

- [x] **A105: Add the working color space version field.** Add D5.1's field to [TimelineSequence](../../../packages/timeline/src/types.ts), the protocol's [`timelineDocument` and `timelineSequenceResponse`](../../../packages/protocol/src/api-schemas/timeline.ts), the [model's document conversions](../../../packages/models/src/timeline-sequence.ts) and the [tRPC save merge](../../../packages/websocket/src/trpc/routers/timeline.ts). Zod strips an undeclared field on every save, which would silently return a document to version 1. Accept any positive integer so a server keeps a version newer than its renderers. Reject other values rather than reading them as 1. This field has no rendering effect. Deploy it before any writer produces version 2.
- [x] **A106: Report unsupported versions on web, server and agent routes.** Apply D5.3 in the browser renderer, [RenderTimeline](../../../packages/video-nodes/src/nodes/timeline.ts), agent previews and remaining Canvas2D routes. Test a version 2 document on a route without linear-light support and a version 3 document on all routes. Assert the saved document is unchanged. See [route inventory, preservation tests and verification limits](results/s6-version-reporting.md).
- [x] **A107: Test the version round trip.** Use one fixture set across surfaces: field absent, 1, 2 and 3. Exercise schema parse, `toTimelineSequence`/`fromTimelineSequence`, tRPC saves with and without the field, snapshot and restore, clone, retarget, and native parse through autosave. Require absent to stay absent and every value to survive unchanged. Prove the test fails when the protocol schema omits the field, then restore it.
  TypeScript round trips pass, including agent retarget, template-based browser creation, and code rebaking, using the [shared JSON fixtures](../../../packages/timeline/tests/fixtures/working-color-space-versions.json). Native parse and autosave now consume that file through CMake and preserve every version, including absence. Unsupported versions remain blocked from rendering. See the [native round-trip and report verification](results/n4-version-field.md).
- [ ] **A99: Implement explicit SDR input/output boundaries.** Use linear RGB with sRGB/Rec.709 primaries internally. Decode the transfer function of the actual incoming samples, accounting for conversions already performed by browser/native decoders. sRGB and Rec.709 share primaries but have different transfer functions. Declare supported inputs and the existing policy for missing metadata. Unassociate encoded premultiplied RGB before transfer decoding, then premultiply in linear light. Handle zero alpha explicitly. Reverse the necessary steps for the output's declared encoding, quantizing/dithering only after final transfer encoding. Keep alpha and mask/data values outside RGB transfer conversion.
- [ ] **A100: Move light-mixing operations to linear working pixels.** Cover normal alpha compositing, group surfaces, resampling, blur, additive glow and ordinary crossfades. Convert before filtering, not after averaging encoded samples. Reuse FP16 surfaces and existing passes. Preserve geometry, timing and operation order. Keep color interpretation, including the document's version, in resource compatibility checks so old cached pixels cannot be reused under the new meaning.
- [ ] **A101: Declare effect-domain exceptions.** Inventory affected grading controls, LUTs and artistic blend modes. Retain encoded-domain behavior where their definition requires it, with explicit conversion around those operations and correct alpha association. Reuse shared transfer helpers. Do not blindly linearize every shader, reinterpret LUT contents or add parallel effect implementations. Qualify exceptions before enabling the chain.

  Owner decision, 2026-11-05: keep BT.709 delivery as pass-through with today's BT.709 tag (O1). Do not convert delivered values. In the study's sRGB-like player model, supported by Chromium source, pass-through matches the source. Under BT.1886 it is closer than strict conversion. Strict conversion wins only under an inverse-709 interpretation, which was not confirmed as any major player's default. The transfer tag is knowingly inaccurate, and that is accepted to preserve source appearance. See the [Q27 evidence](results/q27-bt709-delivery.md) and [boundary tests](../../../packages/timeline/tests/render.colorBoundary.gpu.test.ts).

  Include these existing transfer assumptions, which disagree today, so S6 does not convert twice:

  - [`color.exposureLinear`](https://github.com/nodetool-ai/nodetool/blob/33963a5d7111bda52f116392d1b7c34eab7e3430/packages/gpu/src/shaders/color/exposureLinear/v1/module.ts) decodes and re-encodes sRGB inside the module. It exists on `feat/native-timeline` only. [`exposeRgb`](https://github.com/nodetool-ai/nodetool/blob/33963a5d7111bda52f116392d1b7c34eab7e3430/packages/timeline/src/render/exposure.ts) is its CPU counterpart.
  - Native exposure [decodes and re-encodes sRGB](https://github.com/nodetool-ai/nodetool/blob/33963a5d7111bda52f116392d1b7c34eab7e3430/native/timeline/shaders/effects/clip.frag#L443) in the clip shader.
  - Native [Color Match](https://github.com/nodetool-ai/nodetool/blob/33963a5d7111bda52f116392d1b7c34eab7e3430/native/timeline/src/color/ColorMatch.cpp#L23) assumes sRGB when it models a grade.
  - Native export [tags the BT.709 transfer](https://github.com/nodetool-ai/nodetool/blob/33963a5d7111bda52f116392d1b7c34eab7e3430/native/timeline/src/export/ExportEngine.cpp#L141).
  - Native [`LayerFrame`](https://github.com/nodetool-ai/nodetool/blob/33963a5d7111bda52f116392d1b7c34eab7e3430/native/timeline/src/preview/LayerSource.h#L36) has a YUV matrix and no transfer field. P2's A30 adds one.

- [ ] **A102: Qualify and release the SDR behavior change.** Test unchanged-color round trips, black/white mixtures, transparent colored edges, fades, blur/glow and encoded-domain effects. A 50/50 opaque black/white crossfade should produce linear 0.5, approximately sRGB 0.735, before quantization. Compare browser/server working output and decoded export with declared tolerances on hardware, lavapipe and the qualified browser software adapter. Include agent routes when migrated. Rerun A49's cost/resource gates, including conversion passes. Compare documents with the field absent and at 1 against pre-S6 output on the same routes, using A98's fixtures, and require them to stay within declared tolerances on web and server. Document the appearance change for documents that reach version 2. Older routes that remain encoded follow D5.3 rather than claiming parity. Enable version 2 on qualified routes through existing release configuration, after A105 and A108 are released and without migrating existing documents. Take an existing version snapshot before a document moves to version 2.

**Exit gate:** documents with the field absent or at 1 keep their rendering, the version survives A107's round trip, unsupported versions are reported rather than rendered, input/output colors remain correct, light-mixing fixtures match linear reference values, artistic exceptions retain their declared behavior, and qualified preview/export routes agree within measured budgets. Remaining Canvas2D paths are not linear-light reference renderers and gain no new effects for this milestone.

## Open items

These are unresolved. This plan records them and does not settle them.

- **Clamping on float targets.** `rgba8unorm` targets clamp written values to 0..1 and `rgba16float` targets do not, so out-of-range values can reach later passes. On main, 29 of the 65 shader modules have no `clamp` or `saturate` call in their WGSL. On `feat/native-timeline` the count is 30 of 74. A call elsewhere in a module does not prove that its output is bounded. Not all of these modules were read, and geometry-only modules may need no clamp. A23.3 and A28 need the answer.
- **Float CPU reference.** The effects audit asks for one, and A92 retires CPU implementations without building one. heavy-d should decide whether shared vectors and computed values are enough, or whether a small float reference should exist in test code only.

## Delivery and deferred scope

At 3840x2160, raw RGBA8/16F/32F frames occupy approximately 31.64/63.28/126.56 MiB. Count working surfaces, history, transfers and readbacks. Texture byte size alone does not predict frame time or compressed file size.

Keep one coherent task per commit with verification evidence. Follow [Development Standards](../../DEVELOPMENT_STANDARDS.md) and [Harness-First Engineering](../../HARNESS_FIRST.md). Code changes require the affected tests, typecheck, lint and harness gate, with relevant GPU/native tests when selection misses them. Documentation changes require link checks.

Defer selectable color profiles, wide-gamut workflows, HDR, high-depth video decode, new codecs/interops, automatic preview quality, new proxy/tile services, broad workflow-image migration and Python/provider transport. Linear-light SDR is scoped to S6 and the linked native/Sketch follow-ups. Do not remove existing CPU paths or implement a new fallback architecture as incidental cleanup.

An explicit server-export action is an optional follow-up, not a requirement for precision or a replacement for interactive preview/Sketch. It can reuse the existing render workflow and job lifecycle, but must handle saved revisions, asset access, authorization, cancellation and result download. No automatic remote fallback is introduced.
