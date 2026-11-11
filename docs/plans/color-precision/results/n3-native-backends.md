# A34 native backend qualification

Linux checks pass independently on OpenGL and Vulkan, on the NVIDIA GeForce
RTX 3060 and Mesa software adapters. Keep the existing backend selection.
FP16 remains off by default. A34 stays unchecked until Metal and D3D11/WARP
CI confirms the changed checks. This result does not enable A50.2 or qualify
release performance, hardware decode interop or every graphics driver.

## Default-route measurements

Both routes rendered a 32x16 shape timeline with `QSG_RHI_BACKEND` removed,
`QSG_INFO=1` and
`QT_LOGGING_RULES='qt.rhi.general=true;qt.scenegraph.general=true'`.
Each process used a fresh `XDG_CONFIG_HOME` below
`/home/mg/Projects/nodetool-film/tmp/`, also used as `TMPDIR`.
The xcb runs started with `DISPLAY` unset, then used `xvfb-run -a`.
The offscreen runs had `DISPLAY` unset throughout.

| Driver environment | QPA | Export backend/result | Frame-server backend/result |
|---|---|---|---|
| NVIDIA 610.57.04, RTX 3060 | xcb/Xvfb | OpenGL, rendered | OpenGL, rendered |
| Mesa 26.2.5, lavapipe ICD selected | xcb/Xvfb | OpenGL, rendered on llvmpipe | OpenGL, rendered on llvmpipe |
| NVIDIA 610.57.04 | offscreen, no display | No initialized backend, attempted OpenGL, exit 1 | No initialized backend, attempted OpenGL, error response |
| Mesa 26.2.5, lavapipe ICD selected | offscreen, no display | No initialized backend, attempted OpenGL, exit 1 | No initialized backend, attempted OpenGL, error response |

The actual OpenGL adapter strings are `NVIDIA Corporation NVIDIA GeForce RTX
3060/PCIe/SSE2 4.6.0 NVIDIA 610.57.04` and `Mesa llvmpipe (LLVM 23.1.3,
256 bits) 4.6 (Compatibility Profile) Mesa 26.2.5-arch1.1`.
Lavapipe is the Vulkan adapter, not the OpenGL adapter. Selecting its ICD does
not make Qt use Vulkan. Every Mesa run set both `VK_ICD_FILENAMES` and
`VK_DRIVER_FILES` to `/usr/share/vulkan/icd.d/lvp_icd.json`.
Mesa default-route measurements additionally set `LIBGL_ALWAYS_SOFTWARE=1`,
`__GLX_VENDOR_LIBRARY_NAME=mesa` and
`__EGL_VENDOR_LIBRARY_FILENAMES=/usr/share/glvnd/egl_vendor.d/50_mesa.json`,
and removed NVIDIA's `LD_LIBRARY_PATH`. Without Mesa vendor selection this
mixed-driver host initially failed to create an OpenGL context.
`QT_QPA_PLATFORMTHEME` was removed to avoid GTK trying to open a display in
the offscreen runs. A frame-server render error is a JSON error response,
although closing stdin afterwards exits 0. That is not a successful capture.

The editor uses the same selection helper with a different argument.
Two-frame window benchmarks of the same shape document, with the backend
variable unset and xcb/Xvfb on RTX 3060, measured:

| Editor decode option | Actual backend | Adapter | Exit |
|---|---|---|---|
| `--decode sw` | OpenGL | NVIDIA RTX 3060 | 0 |
| `--decode auto` | Vulkan | NVIDIA RTX 3060 | 0 |

`main.cpp` passes whether decode is non-software to `selectGraphicsApi`.
The Linux VAAPI build selects Vulkan only for that case and only when the
backend variable is empty. ExportCli and FrameServerCli pass false and retain
Qt's OpenGL default. The shape benchmark measures selection, not video decode.

## Decision and checks

Keep OpenGL available rather than require a Vulkan driver in the two CLI
entry points. With both Vulkan ICD variables deliberately pointing at a
nonexistent JSON file, both default CLI routes still render on RTX 3060
OpenGL. There is no new Vulkan requirement or new fallback policy.
No shader, export color conversion, BT.709 tag or precision default changed.

| Check | Evidence and scope |
|---|---|
| `tst_workingprecision` | Explicit platform QRhi: Vulkan on Linux, Metal on macOS, D3D11 on Windows. Reports actual backend and adapter. D3D11 now honors the software-renderer flag so WARP CI qualifies WARP. |
| `tst_workingprecision_opengl` | Linux's independently live OpenGL route. Same executable and unchanged inverse-Levels/low-alpha bounds. Both formats allocate and render. |
| `floatFiltering` in that executable | Production copy shader and DrawCache linearly sample the midpoint of a 2x2 RGBA16F texture into an RGBA16F target. RGB matches the average of uploaded half values at alpha 1 and 0.001, within 0.002 times alpha. Nearest sampling would not produce that average. |
| `tst_framecapture_opengl` | Existing asymmetric 65x49 typed-capture test, both precisions. Checks row orientation, float/byte layouts, repeat stability, owned capture and cancellation. Linux-only because OpenGL is an additional Linux default, not a claimed Windows/macOS release route. |
| `tst_framecapture` | Existing full suite on Vulkan, including the same asymmetric offscreen capture. |
| `native_backend_routes` | Renders actual export and frame-server requests under the inherited backend and again with the backend variable removed. Requires the expected platform backend and a nonempty adapter report from each route. Missing reports, unsupported overrides and mismatches fail. It checks that frame-server output exists at the declared byte size. Numerical and orientation assertions are in the suites above. |

All new CTest entries have the `render` label. The existing native workflow
runs that label on Linux/lavapipe, macOS/Metal and Windows/D3D11/WARP.
No new job or matrix entry is needed. OpenGL reuses existing test binaries.
The cross-platform filtering check and route check also run in those suites.

Both Linux adapters and both backends report 256 distinct final codes and zero
maximum code error for the FP16 shared inverse-Levels vector. The byte control
reports 192 distinct codes and maximum error 11. Low-alpha compression passes
at 0.001 and zero-alpha output remains zero. These are numerical checks, not
throughput measurements or evidence for another backend.

The baseline and changed default-route PNG payloads also match byte for byte
on each OpenGL adapter: 136 bytes, SHA-256
`a1a6d120c3f5b2706c30e5ec8f2d045cb79a9f9d6eb7781978e33f31c7f580be`.
This is one tiny shape fixture, not a new full export regression qualification.

## Failure proof and verification

The route check's `check_backend` was given
`native-render-backend Null adapter deliberately invalid` with expected Vulkan.
It failed with exit 1 and `('Vulkan', 'Null', 'deliberately invalid')`.
A second input without a report failed with exit 1 and
`No actual backend/adapter report`. Neither proof changed production or test
source. Afterwards the real route check passed again on Vulkan/lavapipe and
OpenGL/llvmpipe. The first filtering fixture incorrectly treated effect-stage
copying as resizing and failed on both Mesa backends. The final fixture samples
through the production copy shader directly. No numerical bound was relaxed.

Builds used `/home/mg/Projects/nodetool-film/bin/ntbuild color-n2` with only
`nodetool-timeline tst_workingprecision tst_framecapture`. Final build exit 0.
The disk gate did not block. Focused test commands:

```bash
TMPDIR=/home/mg/Projects/nodetool-film/tmp \
LIBGL_ALWAYS_SOFTWARE=1 __GLX_VENDOR_LIBRARY_NAME=mesa \
/home/mg/Projects/nodetool-film/bin/citest color-n2 \
'^(tst_workingprecision(_opengl)?|tst_framecapture_opengl|native_backend_routes)$' -V

# Same regex through nttest, after sourcing ntenv, removing the GTK platform
# theme and setting XDG_CONFIG_HOME to a fresh directory under the task tmp.
/home/mg/Projects/nodetool-film/bin/nttest color-n2 \
'^(tst_workingprecision(_opengl)?|tst_framecapture_opengl|native_backend_routes)$' -V
```

Both exit 0 with seven QtTest passes per precision backend, three per focused
capture suite, and no skips. Vulkan is `llvmpipe (LLVM 23.1.3, 256 bits)` through
citest and `NVIDIA GeForce RTX 3060` through nttest. The restored route check
and full frame-capture suite also pass through citest, with no skips.
The full frame-capture suite passes separately through nttest on RTX 3060
Vulkan. Both full capture runs report 18 passes, zero failures and zero skips.

Evidence is outside the repository. Logs under
`/home/mg/Projects/nodetool-film/logs/` are `a34-baseline-build.log`,
`a34-build2.log`, `a34-default-measure.log`, `a34-ci-final.log`, `a34-gpu.log`,
`a34-capture-restored.log`, `a34-gpu-capture.log`, `a34-no-vulkan.log` and
`a34-negative-{wrong,missing}.log`. Default measurement driver and raw Qt logs
are in `tmp/a34-measure.py` and `tmp/a34-final/` under the same project root.
`git diff --check`, changed-file control-byte checks and local Markdown file
links pass. Editor logs are `tmp/a34/editor-{sw,auto}.log`. Baseline PNGs are in `tmp/a34/`.

At this local checkpoint, Metal and D3D11/WARP awaited CI. The CI confirmation below supersedes that limit. No TypeScript tests, typecheck, lint,
`test:affected`, harness gate, `/verify`, full CTest suite, release-performance
or hardware-decode tests ran. `check-precision.py` was not rerun because no
backend selection, shader or delivery behavior changed. Nothing was pushed,
rebased or opened as a PR. `build-scene-asan/` was left alone.

## CI confirmation

CI on #7284 completed A34. `export_precision`, `native_backend_routes` and
`tst_workingprecision` pass on Metal, on D3D11 with WARP, and on Vulkan with
lavapipe under sanitizers. `tst_workingprecision_opengl` passes on Linux. WARP is
a software renderer, so this does not qualify Windows GPUs. A49.2 covers those.
