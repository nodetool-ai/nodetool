# Torch workflows

Compile fixed-shape NodeTool Torch graphs with strict `torch.export` and
AOTInductor. The C++ adapter loads `.pt2` packages and runs CPU or CUDA tensors.
Python is used for compilation and reference tests. Inference uses LibTorch.
The contract and limits are in the [design](../../docs/native-workflow-design.md).

Use Python 3.12, a C++17 compiler, CMake, LLVM development libraries (JSON and
SHA256 utilities), and the pinned dependencies:

```bash
uv venv --python 3.12 native/workflow/.venv
uv pip install --python native/workflow/.venv/bin/python -r native/workflow/requirements.lock
npm run test:torch-workflow
npm run test:torch-workflow:cuda
```

The CUDA check requires an NVIDIA driver and GPU. Its wrapper assembles build
headers and runtime libraries from the pinned CUDA wheels using
[setup_cuda.py](setup_cuda.py). A complete compatible system CUDA toolkit can
also supply `CUDA_HOME`. The CPU-only CI dependency list is
[requirements-cpu.txt](requirements-cpu.txt).

## Use the workflow editor

After installing the compiler environment and building the C++ adapter below,
start the API bound to loopback with local compilation enabled:

```bash
HOST=127.0.0.1 NODETOOL_TORCH_LOCAL=1 npm run dev:server
```

Choose **New → New Torch workflow…** in the workspace. Start with an empty
canvas or one of the four golden examples. Torch canvases offer operations
from the Python registry, with editable tensor shapes and constant arrays.
The saved workflow carries `settings.execution.kind = "torch"`.

The editor's Run action opens the Torch dialog. Choose CPU or CUDA, edit named
float32 tensor inputs as JSON, then choose **Compile** or **Compile and run**.
Examples include runnable input values. Input values and the selected device
are saved with the graph. The dialog shows build stages, cancellation, errors,
and output shapes and values. Changing the graph hides results from an older
revision. Compilation uses strict export, and inference uses the C++ adapter.

Compilation requires a nonproduction server bound to loopback, the explicit
environment opt-in, and a direct loopback client connection. Enable it only on
a trusted local server without a public reverse proxy. Jobs require workflow
edit access and use saved snapshots. Artifacts are created in private job
directories and removed when the job ends. The API accepts tensor values and
device selection, not filesystem paths, executable names, or native package
uploads. The ordinary actor runner rejects Torch workflows.

The local editor limits graphs to 256 nodes, 1024 edges, and 8 MB of graph JSON.
It checks fake tensor shapes before allocating examples and rejects tensors above
one million elements. Each compiler invocation has a fifteen minute deadline.

Compile an artifact separately:

```bash
native/workflow/.venv/bin/python native/workflow/build_tool.py compile native/workflow/examples/golden/motion-blur.json --target cpu --output build/motion-blur
```

Artifacts contain `package.pt2` and `manifest.json`. The manifest records ordered
names, shapes, float32 dtypes, exact Torch runtime version, target requirements,
compiler settings, content identity, and package SHA256. Cache identity includes
compiler source, constants, toolchain, graph operations, and target requirements.
Editor positions and labels are excluded. Validation precedes cache lookup.
Compilation publishes a completed directory by rename. Changing weights requires
recompilation into a new output directory.

Build and invoke the C++ adapter directly:

```bash
cmake -S native/workflow -B build/native-workflow -DPython3_EXECUTABLE="$PWD/native/workflow/.venv/bin/python" -DCMAKE_BUILD_TYPE=Release
cmake --build build/native-workflow -j2
build/native-workflow/nodetool-workflow run build/motion-blur/package.pt2 build/motion-blur/manifest.json inputs.json outputs.json --repeat 10
```

Input and output JSON map names to `{"shape": [...], "values": [...]}` with
flat numeric arrays. Exceptional float tokens are strings `"nan"`, `"inf"`,
`"-inf"`, and `"-0.0"`. The CLI explicitly transfers host arrays to the selected
device and downloads outputs. The C++ `PreparedExecutable` API accepts LibTorch
tensors already on that device, loads weights and code once, and rejects
concurrent calls on one executable. Outputs may be noncontiguous. Input tensors
must be contiguous float32 with the declared fixed shapes.

The [golden tests](examples/golden/README.md) compare unchanged independent numeric
expectations against eager Torch and actual C++ AOT execution. They also test
invalid graphs, signature errors, incompatible manifests, cache invalidation,
strict-export failure, noncontiguous outputs, and exceptional values. Check output
records compile and execution measurements without assuming a speedup. Host RSS
is the process high-water mark. CUDA allocator peak memory is not measured.

Only trusted local graphs and artifacts are supported. CPU packages must remain
on their build host. Architecture and Torch capability checks do not guarantee
portability to another CPU. Rebuild packages after changing the host compiler
or its toolchain. Packages contain native
executable code. The manifest does not sandbox it. There is no device or eager
fallback. Dynamic shapes, training, custom operators, arbitrary model imports,
audio, shader languages, diffusion orchestration, and Comfy import are outside
the supported contract.
