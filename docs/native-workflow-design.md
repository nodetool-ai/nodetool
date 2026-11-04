# Native workflows compiled for CPU and GPU

This proposal adds a native workflow type: a pure, statically typed dataflow graph compiled into a callable function. It keeps NodeTool's graph format and editor model. It uses a separate node vocabulary whose operations have compiler definitions. The design targets tensor programs, compute shaders, image filters, block audio DSP, neural network inference, and the numerical portions of Comfy-style workflows.

The standalone prototype lives in [`native/workflow`](../native/workflow/README.md). Its supported operations and verification commands are documented there. The sections below define the intended compiler contract and staged roadmap. The prototype is separate from the [QuickJS flow DSL](dsl-native-flow-design.md).

The prototype compiles and runs fixed-shape `f32` graphs on CPU and a supported subset on NVIDIA GPUs. Its fixtures exercise the six numeric domains below. Committed image goldens cover motion blur, CNN classification, an image-to-image CNN filter, and linear-light color grading. The [implementation scope](../native/workflow/README.md#scope-of-the-examples) lists unimplemented operations and integrations. MLIR lowering, additional dtypes, model importers, device-buffer bindings, and full diffusion execution remain future work.

## D1. Keep the graph format, restrict execution

Use the existing `nodes`, `edges`, and optional `links` structure from [protocol types](../packages/protocol/src/api-types.ts). Nodes retain `id`, `type`, properties and UI metadata. Edges retain `source`, `sourceHandle`, `target`, and `targetHandle`. Preserve IDs verbatim. Links carry provenance only and never schedule work.

Mark the workflow with the proposed setting `settings.execution = { kind: "native", version: 1 }`. This fits the existing settings bag without changing graph serialization. A standalone compiler also accepts a bare graph with an explicit native compile command. Target selection is a compile option, so the same document can produce CPU and GPU artifacts.

The native profile requires an acyclic graph of pure operations. Each node defines values once per invocation. Registered operations may contain bounded loops or scans internally. Every connected input has exactly one producer. Fan-out is allowed. Reject control edges, streaming flags, parent/subgraph nodes, dynamic slots, and ordinary provider or script nodes. Reject unknown node types and execution-bearing fields instead of silently ignoring them. Ignore editor metadata.

Normalize `properties`, or legacy `data` when `properties` is absent, consistently with [Graph.fromDict](../packages/kernel/src/graph.ts). Native nodes do not accept `dynamic_properties`. Validate the entire graph before removing unreachable nodes, including disconnected cycles and unsupported operations.

The existing [actor runner](../packages/kernel/src/actor.ts) remains responsible for ordinary workflows. Native execution has no actors, inboxes, events between nodes, retries, or dynamic graph scheduler. Its compiled plan can contain kernel launches and approved library calls.

## D2. Use tensors as the shared value model

A value is a scalar or ranked tensor with a compile-time dtype and shape. Start with `f32`, `i32`, and `bool`; add `f16` and `bf16` with explicit `f32` accumulation contracts for inference. Complex FFT values use a pair of real tensors initially. Reject unsupported dtype/target combinations during compilation.

Adopt trailing-axis broadcasting: align dimensions from the right, and accept dimensions that are equal or one. The result uses the larger dimension. No implicit dtype promotion. Casts are explicit, reductions declare axes and `keepdims`, and matrix multiplication declares batch broadcasting. This provides familiar PyTorch-style expressions without importing Python execution or autograd.

Public buffers initially remain contiguous. Internally, transpose, slice, reshape, and broadcast can be immutable views with compiler-known strides and offsets. Materialize only where a consumer requires it. Reshape preserves logical element order and may require a copy after transpose. This deliberately omits PyTorch's mutable alias semantics, described in its [tensor views documentation](https://docs.pytorch.org/docs/main/tensor_view.html).

Input nodes declare names, dtypes, and shapes. Properties are compile-time constants, while input data and model weights are runtime bindings. Compile a specialization for each input shape signature. Keep dynamic dimensions, ragged tensors, mutation, and data-dependent output sizes out of the initial compiler. Validate shape products and allocation limits before code generation.

Images are tensors with declared color space, alpha convention, and axis layout. Audio is a tensor with declared sample rate and channel axis. These annotations validate domain operations but do not create separate storage engines. Layout and color conversions must be explicit operations, even when the compiler later fuses them.

The versioned `nodetool.native.*` registry defines port names, type/shape inference, purity, numerical semantics, and available target lowerings. Export editor metadata from it. Single-result operations use `output`; operations such as stateful DSP use named results. Each output handle defines a separate SSA value. Do not restrict nodes to one result.

## D3. Compile through LLVM, retain MLIR as the structured lowering target

The C++/CMake prototype uses LLVM JSON for its frontend and generates static C++ expressions and structured loops. Clang lowers that source to optimized LLVM IR and a native shared library. NVIDIA compilation emits PTX through Clang. Graph traversal and JSON parsing occur during compilation, never inside the generated compute function. The generated source and LLVM IR remain inspectable artifacts.

This differs from the original MLIR-first proposal because the available toolchain provides LLVM and Clang without MLIR. The prototype uses LLVM development libraries and Clang rather than an unverified MLIR dependency. Moving structured operations into existing MLIR dialects remains a follow-up. A future MLIR frontend should map graph nodes to SSA values with source locations retaining node IDs and handles for diagnostics.

The prototype frontend validates and topologically orders the graph and resolves types. Generated scalar expressions fuse compatible elementwise operations, while structured loops implement reductions and domain operations. Clang performs constant folding, dead-code elimination, and loop optimization. The planned MLIR frontend would emit `func`, `arith`, and tensor/`linalg` operations and use bufferization to make storage and ownership explicit.

The CPU lowering produces loops and vector operations, then LLVM IR and a native object or shared library for an explicit target triple and CPU features. Initially use one thread and SIMD. Parallel execution can be added after measuring workloads that justify it.

The GPU lowering maps fused loops to GPU blocks and threads and guards tail indices. The prototype uses Clang CUDA device compilation to NVIDIA PTX. The planned MLIR path would outline kernels and lower through NVVM to NVIDIA device code. A small host adapter loads the module and launches kernels. MLIR supplies GPU abstractions and NVVM lowering, but the project still needs a concrete fusion and scheduling policy. See the official [GPU dialect](https://mlir.llvm.org/docs/Dialects/GPU/) and [NVVM dialect](https://mlir.llvm.org/docs/Dialects/NVVMDialect/) documentation.

Start with NVIDIA only. AMD through ROCDL is a later backend, not a promise of initial portability. CPU and GPU share graph semantics and frontend IR, not identical schedules. A target that cannot lower an operation reports a compile error. Never fall back silently to a host node.

For the initial operation set, fuse compatible elementwise expressions into one loop or kernel per output domain. Share intermediates when useful, but permit cheap arithmetic to be recomputed to avoid a large temporary. Do not promise one kernel for arbitrary future graphs. Reductions, stencils, scans, matrix multiplication, and convolution retain structured representations and receive separate schedules. Library calls are fusion boundaries unless their interface supports an epilogue.

## D4. Prepare once, execute repeatedly

Expose three operations: `compile(graph, target, options) -> artifact`, `prepare(artifact, weights, device) -> executable`, and `run(executable, inputs, outputs, scratch) -> status`. Preparation loads modules, packs weights, creates library plans, and allocates persistent device resources. Execution receives preallocated per-invocation storage.

An artifact contains machine code or device code plus a manifest: ABI version, ordered input/output names and shapes, required byte sizes and alignment, target features, scratch requirements, numerical mode, and content hash. Load artifacts only when target and ABI requirements match.

The runtime validates buffer counts, sizes, alignment, device placement, and non-aliasing before entering generated code. Inputs are read-only. Callers own input/output buffers and scratch memory. An invocation writes all outputs and returns only after completion. Separate invocations use separate outputs and scratch, allowing concurrency without mutable graph state.

Keep MLIR memref descriptors behind a generated wrapper with a stable C ABI using buffer addresses and explicit counts. Avoid exposing compiler-specific structures to TypeScript or external callers. No JSON parsing, node lookup, or graph traversal occurs inside the compiled compute function. Generated kernels allocate no heap memory. Approved library paths must disclose workspace and allocation behavior during preparation; real-time audio accepts only allocation-free execution paths.

For GPU execution, upload inputs once, retain intermediates on the device, and download outputs once. Offer a device-buffer entry point for repeated calls so transfers are optional. The synchronous wrapper can use one stream initially. Synchronize before reporting success or releasing buffers. Report driver and launch failures as structured runtime errors. Outputs are invalid after failure.

The artifact contains a fixed launch/call sequence, not a runtime graph scheduler. Use one target per compiled region initially; do not build automatic CPU/GPU partitioning. Compile reports identify generated kernels, library calls, copies, scratch bytes, and unsupported operations.

The first CLI reads a graph and binary tensor buffers. NodeTool integration later adds a single host adapter invoking an artifact. A normal workflow may call that adapter, while the compiled graph itself remains pure.

## D5. Define numerical behavior and caching

Default to strict operation ordering: no reassociation or multiply-add contraction. Specify division, NaNs, infinities, signed zero, and subnormal handling in operation tests. Do not promise bitwise CPU/GPU equality where hardware behavior differs. Compare supported finite values with documented absolute and relative tolerances, and test exceptional values separately.

An explicit fast mode permits reassociation and contraction. Its settings become part of the artifact identity. Report which mode produced every artifact.

Hash normalized reachable operations, wiring, constants, argument/result contracts, native profile version, compiler build, lowering options, numerical mode, linked library versions, scheduling decisions, and target features. Exclude node positions and UI labels. Preserve a separate node-to-diagnostic mapping. Never key cached code only by workflow ID. Validate fully before consulting the cache. Bound compilation time and memory, and publish cache entries atomically.

Native machine code is not a sandbox. The prototype accepts local graphs and trusted compiler-produced artifacts. A hosted deployment must isolate compilation and execution, enforce resource limits, and reject arbitrary supplied binaries. Native nodes do not allow user C++, external symbols, filesystem access, or network access.

## D6. Design around six executable examples

### E1. PyTorch-style tensor operations

Example: `y = relu(x @ weight + bias)`, with `x[B,K]`, `weight[K,N]`, and `bias[N]`. Follow it with a mean reduction over the batch axis.

Provide Input, Constant, Cast, arithmetic, comparisons, Select, Reshape, Transpose, Slice, Concat, reductions, MatMul, and common activations. Broadcasting and views are fundamental compiler operations, not separate copies by default. Constants and explicit runtime parameters must have distinct bindings.

Fuse the bias and activation into a matrix multiplication epilogue where supported. Retain the reduction as a separate stage when that gives a better schedule. Validate against equivalent PyTorch expressions using explicit dtypes. This is inference-oriented tensor programming, not full PyTorch compatibility or training.

### E2. GPU compute shaders

Example: generate a procedural checkerboard, transform its UV coordinates, sample an input image, and blend the two into an output image.

Represent the output domain as a static tensor shape. Coordinate nodes produce logical index grids; these become thread indices on GPU and loop indices on CPU without allocating full coordinate arrays. Provide vector arithmetic, dot products, trigonometric functions, Select, and Sample2D. Sampling declares normalized versus pixel coordinates, nearest versus linear filtering, and clamp/repeat/zero border behavior. Define pixel centers explicitly.

Compile a compute kernel that writes one result per output element. Support CPU evaluation of the same semantics for testing. Rasterization, fragment derivatives, hardware-specific shader source, and arbitrary GLSL/WGSL are separate concerns. A later SPIR-V backend could improve graphics interoperability; the initial NVIDIA backend uses buffers and explicit sampling.

### E3. Image filters

Example: linear-light exposure adjustment, separable Gaussian blur, then alpha compositing.

Provide ColorConvert, Premultiply/Unpremultiply, Resize, Stencil2D, and Composite as domain operations over tensors. Stencils declare coefficients, anchor, padding, and output extent. Define zero-alpha unpremultiplication and border behavior. Keep separable blur as horizontal and vertical stages rather than expanding it into a quadratic neighborhood expression.

Fuse pointwise color operations around stencils when profitable. Tile stencils for neighborhood reuse, and preserve a temporary between separable passes when recomputation costs more than memory traffic. Test impulses, constant images, borders, transparent pixels, and non-multiple tile sizes.

### E4. Audio DSP without streaming edges

Example: process a fixed block through gain, a biquad filter, and a limiter. The function takes `audio[C,T]` and `state_in[C,2]`, and returns `audio_out[C,T]` and `state_out[C,2]`.

State is an explicit input/output value. The host passes the previous block's state into the next invocation, so the graph remains acyclic and each call remains a pure function. A Biquad operation lowers to a sequential scan over time and parallel work over channels. Do not pretend a recurrence is elementwise or introduce feedback edges. Initialization and reset use explicit initial state.

Add FIR, oscillator phase state, FFT/IFFT, windowing, and overlap state as needed. Specify coefficient order, FFT scaling, clipping, sample-rate constraints, and latency. Time-varying controls are tensors, not messages. A fixed-step scan inside a registered operation is compatible with a graph that has no control edges.

Prefer CPU SIMD for small low-latency blocks. GPU is useful for large offline batches or long convolutions, not automatically for a live callback. Prepare plans and buffers before processing: no compilation, allocation, locks, or device synchronization in a real-time callback. Real-time use needs a dedicated prepared CPU execution path and deadline tests; the general synchronous runner alone makes no such guarantee.

### E5. Neural network inference

Example: a small CNN with convolution, bias, activation, pooling, flatten, and a linear layer. Follow with an attention block as a later fixture.

Keep MatMul, Conv2D, normalization, Softmax, and Attention recognizable until backend selection. Lower to generated code or an approved optimized library implementation. Do not expand everything into scalar arithmetic before deciding how it runs. MLIR's [Linalg design](https://mlir.llvm.org/docs/Rationale/RationaleLinalgDialect/) explicitly supports lowering structured operations to library implementations.

Bind weights as immutable external tensors, load them once, and keep them resident across invocations. Code specialization depends on weight shapes/layouts, not weight contents unless weights are explicitly frozen into the artifact. Fold inference-only constants and prepack weights during preparation. Track packed weight identity separately from code identity.

Use `f32` accumulation for reduced-precision products by default. Expose accuracy and determinism options. NVIDIA implementations may use cuBLAS/cuDNN; CPU implementations need an explicit matching library or generated fallback. This is a planned backend dependency, never an automatic Python fallback. [cuDNN's graph interface](https://docs.nvidia.com/cudnn/latest/developer/graph-api/) is one option for supported fused inference regions.

### E6. Comfy-style diffusion workflows

Example: externally prepared prompt conditioning and model weights feed seeded latent noise, fixed-step denoising, VAE decoding, and image postprocessing.

Keep checkpoint loading, tokenization, file decoding, downloads, previews, and saving in an ordinary host workflow. The native graph accepts numeric conditioning, weight bindings, latent tensors, and an explicit seed/counter. It returns tensors. Comfy's IMAGE, LATENT, and MODEL conventions require conversion, not renaming: see its [datatype definitions](https://github.com/Comfy-Org/docs/blob/main/custom-nodes/backend/datatypes.mdx).

A Comfy importer must recognize an allowlist of nodes, normalize layouts and parameter semantics, and reject unsupported custom nodes with source-node diagnostics. Expand a supported model into native operations before compiling; an opaque Python model object cannot be a native tensor input. Model architectures outside the supported importer stay in the host workflow. Do not claim arbitrary Comfy compatibility.

Start with one compiled denoiser step, including classifier-free guidance, invoked repeatedly by the host. A later registered Sampler operation may lower a fixed step count to a compiled loop around that same region. Keep the loop in structured IR instead of duplicating a model graph for every step. Define the sampler algorithm, schedule, initial noise, and RNG algorithm explicitly; a seed alone does not establish compatibility.

Keep latents, weights, and intermediate buffers on the GPU across steps. Return to the host for explicit progress or cancellation points. Test against the supported sampler's reference implementation using intermediate latent comparisons, not just visual similarity of the final image.

## A1. Demonstrate a fused expression

Build `y = minimum(maximum(x * scale + bias, 0), 1)` with Input, Constant, Multiply, Add, Maximum, Minimum, and Output nodes. Use a static image-sized tensor for `x` and runtime scalar inputs for `scale` and `bias`. Save it using the normal graph structure and proposed native node types.

Compile the same file for CPU and NVIDIA GPU. Inspect generated IR to confirm a fused loop/kernel with no intermediate tensor allocations. Run both against a small independent reference evaluator using the native operation contracts. Ordinary NodeTool nodes are not the numerical oracle for this new node vocabulary.

## A2. Verify the compiler through its public interface

Test valid graphs, fan-out and multiple outputs. Reject cycles, duplicate IDs, missing nodes or handles, multiple producers, shape mismatches, unsupported nodes, control edges and streaming declarations. Test malformed documents and oversized shapes before allocation.

Use random small graphs to compare the reference evaluator with compiled CPU and GPU results. Cover scalar broadcasting, tail lengths, exceptional values, and concurrent invocations with separate storage. Verify cache misses for changed constants, targets, or compiler versions and cache hits after editor-only changes.

Measure cold compilation, warm execution, host/device transfers, allocation, and peak memory separately. Compare against an equivalent handwritten C++ loop and GPU kernel. Include small tensors where launch overhead dominates. Report measured throughput rather than assuming compilation beats existing execution.

## A3. Ship in narrow increments

First deliver the validator, reference evaluator, and CPU compiler for the elementwise vocabulary. Then add the NVIDIA lowering and runtime with the same correctness fixtures. Add caching and NodeTool integration after both execute the demonstration graph correctly.

Next implement broadcasting, immutable views, reductions, and matrix multiplication for E1. Add coordinate sampling and stencils for E2/E3, explicit-state scans for E4, then prepared library calls and persistent weights for E5. E6 follows only after its denoiser operations are supported. Dynamic shapes, training, arbitrary shader source, and automatic device partitioning remain outside this plan.

For each example, measure compile/prepare time, warm latency, throughput, peak live memory, transfer bytes, and kernel count. DSP additionally measures worst-case block time and state continuity across blocks. Neural networks compare accuracy and memory at each dtype. Diffusion separates denoiser time from loading, tokenization, VAE, and saving. Tests should assert expected fusion or copy elimination on small representative graphs, without demanding one universal kernel shape.
