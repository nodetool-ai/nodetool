# Native workflow compiler

This standalone C++ compiler lowers a fixed-shape numeric graph to a reusable
native artifact. It does not execute NodeTool workflows or load TypeScript nodes.

Build with CMake, a C++17 compiler, LLVM development libraries, and Clang on PATH:

```bash
cmake -S native/workflow -B native/workflow/build
cmake --build native/workflow/build -j
ctest --test-dir native/workflow/build --output-on-failure
```

Compile and execute the procedural example, which needs no input files:

```bash
native/workflow/build/nodetool-workflow compile native/workflow/examples/compute-shader.json --output /tmp/nw-shader --target cpu --mode strict
native/workflow/build/nodetool-workflow inspect /tmp/nw-shader
native/workflow/build/nodetool-workflow run /tmp/nw-shader --output image=image.bin --repeat 10
```

Use the names and byte sizes in the artifact's `manifest.json`. The CLI rejects
missing or extra bindings and input files whose sizes disagree with the manifest.
It reads input files and prepares the executable once before the repeat loop.
Each output is staged in its destination directory and renamed after execution.
Multiple output files are not a single atomic transaction.

The public C++ `PreparedExecutable` in [runtime.hpp](runtime.hpp) loads an artifact
once and accepts caller-owned input, output, and scratch buffers. Buffers must
meet manifest sizes and alignment and must not overlap. CPU artifacts expose
`nw_run` through `library.so`. CUDA artifacts contain `kernel.ptx` and require a
CUDA driver and a compatible GPU at execution time. Preparation retains CUDA
allocations across calls.

Artifacts contain executable native code. Run artifacts only from trusted
sources. The manifest validates the calling convention and buffer layout, not
the safety of the shared library or GPU program.

## Supported graph contract

Node types use `nodetool.native.<Operation>`. Ordinary operations produce
`output`. `Output` consumes `input`. Unary operations consume `input`, binary
operations consume `a` and `b`, and `Select` consumes `condition`, `a`, and `b`.
Inputs and weights declare `name`, `dtype: "f32"`, and a static `shape`.
An empty shape denotes a scalar. Inputs, outputs, weights, and scratch are
contiguous. Comparisons produce numeric `0.0f` or `1.0f`; `Select` treats nonzero
as true. `Cast` currently accepts only the identity `f32` cast.

| Operation group | Implemented operations and restrictions |
|---|---|
| Values and arithmetic | Input, Weight, Constant, Output, Add, Subtract, Multiply, Divide, Minimum, Maximum, Negate, Abs, Floor, Sqrt, Greater, Less, Equal, Select |
| CPU math | Sin, Cos, Exp, Log, Tanh, Relu, Sigmoid, Softmax |
| Tensor structure | Reshape, Transpose, ReduceSum, ReduceMean, rank-two MatMul. Reductions accept one `axis` and optional `keepdims`. Trailing axes broadcast for elementwise operations. |
| Images and inference | Coordinate, Stencil2D on HWC tensors, Conv2D with NCHW input and OIHW weights, MaxPool2D with NCHW input. Convolution and pooling accept scalar `stride` and symmetric `padding`. |
| Audio | CPU Biquad with `audio[C,T]`, `state[C,2]`, coefficients `[b0,b1,b2,a1,a2]` and normalized `a0=1`. Direct form II transposed produces `output` and `state_out`. |
| Diffusion arithmetic | CFG consumes `uncond`, `cond`, and constant `scale`. DenoiseStep computes `latent - step * noise`. SeededNoise uses a documented integer hash, not a model or a compatible diffusion sampler. |

Stencil kernels use correlation order, a centered anchor at
`floor(kernel_shape / 2)`, and `clamp`, `repeat`, or `zero` borders. Coordinate
indices use pixel centers `(index + 0.5) / extent` when normalized. Conv2D uses
zero padding and cross-correlation. MaxPool2D ignores padded values by treating
them as negative infinity. Weights remain runtime bindings, so changing their
contents does not recompile code.

CUDA supports the listed operations except Sin, Cos, Exp, Log, Tanh, Sigmoid,
Softmax, and Biquad. Unsupported target operations fail during validation.
The toolkit-free CUDA path emits PTX for `sm_52` and uses the CUDA driver API.
Each launch evaluates output elements directly. CPU structured operations and
shared computed values materialize into caller-owned scratch once. CPU Biquad
runs one sequential scan per channel.

Strict mode disables fast math and multiply-add contraction. Minimum and Maximum
use C `fminf` and `fmaxf` semantics, including their handling of one NaN operand.
Fast mode enables Clang fast math. Tests check finite values with explicit
absolute tolerances and check exceptional values separately.

## Preparation, artifacts, and limits

CPU calls on one `PreparedExecutable` may run concurrently with separate caller
buffers. A CUDA executable retains device allocations and rejects overlapping
calls on the same instance. Use separate prepared executables for concurrent
CUDA invocations. Keep every executable alive until its calls finish.
The synchronous CUDA adapter uploads input and weight buffers and downloads
outputs on every call. A device-buffer API and persistent weight upload are
follow-up work. The API makes no real-time audio deadline guarantee.

Artifacts include generated source, optimized LLVM IR for CPU or CUDA source
and PTX, and a manifest with buffer contracts, target features, scratch bytes,
kernel count, transfer bytes, numerical mode, and content identity. Compilation
uses a private staging directory and publishes it by rename. Recompiling into
an existing directory reuses a matching artifact. A different identity requires
a new output directory. Identity includes generated code, contracts, compiler
source build identity, Clang executable contents, target, and numerical mode.
Editor positions and labels do not enter the identity. Graph validation happens
before cache lookup. The diagnostic node map remains separate from code identity.

Documents are limited to 16 MiB and graphs to 4096 nodes. Tensor and total scratch
size are bounded before native code generation. Compiler subprocesses have a
60-second deadline and a 2 GiB memory limit. These limits do not provide a
sandbox for native code.

## Scope of the examples

The [committed image goldens](examples/golden/README.md) cover directional motion
blur, CNN classification, an image-to-image CNN filter, and color grading. Tests
read fixed expected tensors and compare actual compiled CPU and CUDA execution.

The fixtures cover tensor expressions, procedural coordinates, separable image
blur, explicit-state block audio, a small CNN, and seeded guidance/Euler update
arithmetic. They do not implement arbitrary PyTorch, shader languages, full
neural model loading, Comfy importing, a denoiser model, VAE decoding, or a full
diffusion pipeline. Other deferred operations include additional dtypes,
Sample2D, color-space conversion, slice/concat, attention, FFT, and library-backed
BLAS or DNN execution. The compiler exports no editor registry metadata yet.

The prototype uses C++ expression generation followed by Clang/LLVM rather than
MLIR. The [revised design](../../docs/native-workflow-design.md) replaces this experiment with a Torch-only compiler using AOTInductor. That replacement is not implemented here.

Run the GPU correctness tests explicitly on a CUDA-capable host:

```bash
NODETOOL_TEST_CUDA=1 python3 native/workflow/tests/test_workflow.py native/workflow/build/nodetool-workflow
```
