# Torch workflows

A Torch workflow is a NodeTool dataflow graph whose operations map to PyTorch tensor operations. Compile the whole graph with `torch.export` and AOTInductor, then load its artifact in C++ for inference on CPU or CUDA.

The implementation lives in [native/workflow](../native/workflow/README.md). It replaces the earlier handwritten compiler. The four independent golden fixtures execute through strict export and the C++ AOT runtime on CPU and CUDA.

## D1. One graph format, one execution model

Keep NodeTool's [graph format](../packages/protocol/src/api-types.ts): nodes, named ports, data edges, and editor metadata. Preserve IDs. Optional provenance links do not affect execution. Use the workflow setting `settings.execution = { kind: "torch", version: 1 }` and node namespace `nodetool.torch.*` to distinguish this contract from the existing prototype.

Require a directed acyclic graph with one producer per connected input and at least one output. Reject control edges, streaming, mutation, dynamic slots, nested workflows, and unsupported operations. Validate the entire graph, including disconnected nodes, before pruning unused computation. Diagnostics identify the source node and port.

A graph invocation is one pure tensor function. File loading, image decoding, saving, and UI updates belong to the host. There is no per-node runtime scheduler.

## D2. A small allowlist of Torch operations

Start with fixed-shape, contiguous `float32` inputs, scalar tensors, and NCHW images. Outputs have static shapes. Constants and model weights are immutable buffers bound before export. Changing them recompiles the artifact. Runtime input values may change without recompilation.

Support only the operations required by the four golden tests: Input, Constant, Output, Add, Subtract, Multiply, Clamp, Reshape, Permute, MatMul, Conv2D, ReLU, MaxPool2D, and Pad. Lower these to their corresponding Torch operations. Specify convolution stride, padding, dilation, groups, and weight layout as validated properties. Pad supports constant and replicate modes needed by the fixtures.

Use PyTorch's broadcasting, indexing, convolution, and numerical semantics. Do not maintain a second implementation of tensor semantics or a custom kernel vocabulary. NodeTool validates document structure and property schemas; Torch export validates the resulting tensor program. No arbitrary Python source, import names, callable lookup, or custom operators are accepted from documents.

Keep the allowlist and its port/property definitions in one Python registry that also provides editor metadata. Single-result operations expose `output`; Output consumes `value`. Preserve graph-to-operation mappings for errors. The initial importer accepts NodeTool Torch graphs only, not arbitrary Python modules or serialized PyTorch programs.

## D3. Export and compile with AOTInductor

A Python build tool validates the document, topologically constructs a `torch.fx.GraphModule` using trusted operation mappings, and registers constants as buffers. It creates example inputs from the declared signatures and calls `torch.export.export` with strict capture. Export failure is a compile error, never a fallback to eager Python.

Compile the exported program with AOTInductor and package the result as a `.pt2` artifact. Build separate artifacts for CPU and CUDA. Pin PyTorch and its compiler dependencies, and use the documented packaging/loading interfaces for that version. Some compiler entry points live under underscored namespaces, so isolate those calls in one adapter and test them on upgrades.

AOTInductor supports compiled exported programs in non-Python deployments, including C++ loading. See the official [AOTInductor documentation](https://docs.pytorch.org/docs/stable/user_guide/torch_compiler/torch.compiler_aot_inductor.html). NodeTool delegates fusion, buffer planning, kernel selection, and machine-code generation to this compiler. It does not generate C++, LLVM IR, CUDA, or PTX itself.

## D4. Load once, run tensors

Expose `compile(graph, target) -> artifact`, `load(artifact, device) -> executable`, and `run(executable, inputs) -> outputs`.

The C++ adapter uses PyTorch's packaged AOT runtime and tensor types. Python is required for compilation, not inference. Deployment still includes the compatible PyTorch C++ runtime and target libraries; the artifact is not a dependency-free executable.

Store a small manifest beside the package with ordered input/output names, shapes, dtypes, target requirements, graph version, toolchain versions, and content hash. Validate input contracts and artifact compatibility before invocation. Load weights and the executable once. Keep tensors on the selected device across calls; the host explicitly requests transfers.

Start with one in-flight call per executable and a synchronous host-facing interface. Let the packaged runtime manage intermediates and output allocation. Do not introduce caller-owned scratch buffers, a custom tensor ABI, or promises of allocation-free execution. Fail loading or execution explicitly rather than falling back to another device or backend.

Hash the normalized graph, input signatures, constants and weights, target, compiler options, and toolchain versions. Exclude editor positions and labels. Validate before cache lookup and publish completed artifacts atomically. Compile and load only trusted local artifacts initially; native packages are executable code, not a sandbox. CPU packages remain on the build host. Architecture and Torch capability checks do not guarantee portability. Rebuild after changing the host compiler or toolchain.

## D5. Keep four golden tests

Reuse the independent numeric expectations from the [existing golden fixtures](../native/workflow/examples/golden/README.md). Convert their graph definitions to Torch nodes and explicitly convert the motion-blur input from HWC to NCHW. Do not change expected pixels to match compiler output.

- **G1 — Motion blur:** replicate padding followed by a fixed horizontal five-tap convolution. Check center and border impulses plus a ramp.
- **G2 — CNN:** convolution, bias, ReLU, pooling, reshape, and a linear classifier with fixed weights.
- **G3 — AI filter:** the deterministic image-to-image CNN with fixed smoothing/sharpening weights. This demonstrates neural filtering, not trained model quality.
- **G4 — Color grading:** a channel-mixing convolution followed by exposure, contrast, and clamping in linear RGB.

For each fixture, compare eager Torch, compiled CPU, and compiled CUDA outputs against the same committed expected values. Use documented absolute and relative tolerances, not bitwise equality. Disable reduced-precision shortcuts for golden runs where supported. Record compiler numerical settings and test NaN/infinity behavior separately. GPU checks run on a GPU-capable test host and must actually execute the artifact.

Also test invalid graphs, mismatched input signatures, artifact incompatibility, and cache invalidation. Measure cold compilation, loading, warm execution, transfer time, and peak memory separately. Use eager Torch as the performance baseline; no speedup is assumed.

## A1. Deliver one complete path

Implement the graph validator and Torch translator, then make all four fixtures pass in eager mode. Add CPU AOT packaging and C++ execution against those same goldens. Add CUDA packaging and execution only after the CPU path passes. Wire the resulting checks into affected tests and the harness gate.

All four graphs execute through the C++ AOT runtime on both targets without Python inference or silent fallbacks. The handwritten compiler, its runtime, unsupported examples, and dedicated checks have been removed. The independent expected tensors are unchanged.

The check runner records cold compilation, loading, first and warm execution, explicit transfers, eager reference timing, and process peak host RSS. CUDA allocator peak memory is not measured. CPU-only CI runs the compiled CPU path. GPU checks require a CUDA-capable host.

Training, dynamic shapes, additional dtypes, custom kernels, shader languages, audio DSP, Comfy import, general model import, diffusion orchestration, and MLIR integration are outside this design.
