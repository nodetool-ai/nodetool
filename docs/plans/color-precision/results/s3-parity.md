# A43.2: Undithered server/browser WebGPU parity

A43.2 is met for the fixtures below. Browser/server undithered working-frame
parity passes on same-adapter SwiftShader. The migrated agent comparison below
passes on same-adapter lavapipe with RGBA8 working targets. It checks the real
child response before PNG encoding and accounts for the delivery boundary
against the server working frame. Agent previews remain 8-bit and FP16 stays
off by default. These results do not qualify live editor presentation,
WebCodecs, video decoding, native delivery or the browser's public exporter.

The browser did not select lavapipe or the RTX 3060 in the attempts below.
Their Node outputs were compared against browser SwiftShader as cross-adapter
diagnostics. Those runs cannot certify same-adapter parity on lavapipe or
NVIDIA. No Canvas2D render counts as evidence here.

## Boundary and fixtures

[render.a432Browser.gpu.test.ts](../../../../packages/timeline/tests/render.a432Browser.gpu.test.ts)
uses a [shared fixture](../../../../packages/timeline/tests/a432Fixture.ts).
It constructs a sequence once and sends that exact document as JSON to Chromium.
Both sides resolve its layers and animations at 500 ms and 30 fps. The original
assets are deterministic 768×432 RGBA buffers, rendered at 768×432 without
proxies, resizing or compression. The first is a grayscale ramp with a white
edge patch in its lower half. The second reverses red and holds blue at 96.
These are synthetic original stills, not decoded camera media.

Server renderer: Node/Dawn HeadlessFrameCompositor.renderWorkingFrame.
Browser renderer: Chromium GpuFrameCompositor, with ImageBitmap upload through
copyExternalImageToTexture, flipY=false and premultipliedAlpha=false, matching
the preview still-image upload contract. Both use production shared shaders.
The test supplies internal precision options directly. It does not expose FP16
in the editor or exporter. The browser copies its working texture to a mapped
buffer before presentation, unpremultiplication, dithering or encoding.

Each format runs ramp, 1/16 opacity, a half-complete fade-in, two overlapping
half fades, radius-6 blur, and grain with seed 7, amount 0.3 and size 1. Blur
and grain must change the control picture. The initial smooth ramp did not
change under RGBA8 blur, so the final original includes an edge patch. Alpha
checks require the expected coverage, including 3/4 for the overlapping fades.
Missing layers, GPU validation errors, nonfinite samples and blank browser
readbacks throw.

Errors are absolute differences in premultiplied working RGBA multiplied by
255, averaged over every channel and pixel. They are not rounded delivery
bytes or straight RGB errors at low alpha. Binary64 transport preserves the
readback values.

The predeclared maximum is one code for RGBA8, allowing a neighboring UNORM
rounding result. FP16 allows four half-float steps at [0.5,1), or
4 × 255 / 2048 = 0.498046875 codes, budgeting storage rounding through source
promotion, two blur passes and blending. Capture adds no quantization. These
fixtures remain in [0,1]. The maximum bound also bounds the mean. A 1e-10
arithmetic allowance covers JavaScript subtraction of normalized byte values.
Initial one-code differences such as 1.0000000000000107 exposed that issue.
Neither GPU tolerance was widened to fit measurements.

## Browser startup and actual adapters

Chromium 155.0.8059.84 reports vendor google, architecture swiftshader,
device 0xc0de, description SwiftShader Device (Subzero), isFallbackAdapter=true.
Without developer features its device and description are hidden. A GPU clear
and buffer readback returned [255,128,0,255]. This is software WebGPU, not
Canvas2D. No physical GPU ran the browser comparison.

For the same-adapter run, both Vulkan variables point to
/usr/lib/chromium/vk_swiftshader_icd.json. Node/Dawn then reports vendor google,
device swiftshader-device-subzero-, description SwiftShader driver 5.0.0.
Both hosts use the installed Chromium SwiftShader implementation.

The first probes used /usr/bin/chromium, as video-nodes does. Later probes used
/usr/lib/chromium/chromium directly to bypass personal launcher flags. The
test defaults to that direct binary and accepts CHROME_PATH. Playwright also
inserts --enable-unsafe-swiftshader. Removing that default in a separate
lavapipe probe still selected SwiftShader.

All probes were headless, with DISPLAY unset, the designated TMPDIR, and
--enable-unsafe-webgpu --ignore-gpu-blocklist --disable-dev-shm-usage.
The initial wrapper probes explicitly enabled unsafe SwiftShader too.

| Additional flags or variant | Driver environment | Actual requestAdapter result |
|---|---|---|
| --enable-features=Vulkan --use-angle=vulkan, wrapper | lavapipe and RTX | SwiftShader, readback passed |
| Vulkan, --use-angle=swiftshader --use-webgpu-adapter=swiftshader, wrapper | lavapipe and RTX | SwiftShader, readback passed |
| Vulkan, ANGLE Vulkan, --disable-vulkan-surface, wrapper | lavapipe | SwiftShader, readback passed |
| Same no-surface flags, wrapper | RTX | null |
| No additional flags, wrapper | lavapipe and RTX | SwiftShader, readback passed |
| E2E: Vulkan,UseSkiaRenderer, --use-gl=angle --use-angle=swiftshader --enable-webgpu-developer-features | lavapipe and RTX | SwiftShader, readback passed |
| Vulkan, ANGLE Vulkan, --disable-software-rasterizer, developer features | RTX | SwiftShader, readback passed |
| Vulkan, ANGLE Vulkan, --use-webgpu-adapter=llvmpipe or =NVIDIA, developer features | RTX | SwiftShader, readback passed |
| Seven native/selector/SwiftShader/no-surface/default/E2E variants, direct binary | lavapipe | SwiftShader, readback passed |
| Those seven variants, Playwright Chromium 151.0.7922.34 | RTX | SwiftShader, except no-surface returned null |
| Vulkan, ANGLE Vulkan, --use-vulkan=native, developer features, direct | lavapipe and RTX | SwiftShader, readback passed |
| Forced-native plus --disable-vulkan-surface | lavapipe | SwiftShader, readback passed |
| Forced-native plus --disable-vulkan-surface | RTX | null |
| Forced-native plus --use-gpu-in-tests | lavapipe and RTX | SwiftShader, readback passed |
| Three forced-native variants with Playwright's unsafe-SwiftShader default removed | lavapipe | SwiftShader, readback passed |

Passing GPU names to --use-webgpu-adapter did not select those GPUs.
Chromium's [test configuration](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/web_tests/FlagSpecificConfig)
documents SwiftShader selection. Environment variables alone are not proof
of the browser adapter.

RTX forced-native startup logs include "vkCreateInstance() failed: -7" and
"Failed to create and initialize Vulkan implementation." Disabling the Vulkan
surface produced a null adapter instead. Native browser Vulkan initialization
remains an environment question for the owner. The strict test fails on null
or mismatched adapters. CI skips with the actual reason when Chromium or a
matching browser adapter is unavailable. Skips never certify A43.2.

## Measurements

Every row compares Node/Dawn against Chromium WebGPU before delivery.
SwiftShader/SwiftShader is the only same-adapter column. The other columns
compare Node llvmpipe or RTX against browser SwiftShader. Values are max / mean
in premultiplied working RGBA code units.

| Fixture | Renderers | Working format | SwiftShader / SwiftShader | llvmpipe / SwiftShader | RTX 3060 / SwiftShader |
|---|---|---|---:|---:|---:|
| ramp | Node/Dawn vs Chromium WebGPU | rgba8unorm | 0.000000 / 0.000000 | 0.000000 / 0.000000 | 0.000000 / 0.000000 |
| ramp | Node/Dawn vs Chromium WebGPU | rgba16float | 0.000000 / 0.000000 | 0.249023 / 0.030021 | 0.124512 / 0.025747 |
| low-alpha | Node/Dawn vs Chromium WebGPU | rgba8unorm | 0.000000 / 0.000000 | 1.000000 / 0.003906 | 1.000000 / 0.022461 |
| low-alpha | Node/Dawn vs Chromium WebGPU | rgba16float | 0.000000 / 0.000000 | 0.015564 / 0.001876 | 0.007782 / 0.001609 |
| fade | Node/Dawn vs Chromium WebGPU | rgba8unorm | 0.000000 / 0.000000 | 1.000000 / 0.041504 | 1.000000 / 0.569336 |
| fade | Node/Dawn vs Chromium WebGPU | rgba16float | 0.000000 / 0.000000 | 0.124512 / 0.015010 | 0.062256 / 0.012874 |
| crossfade | Node/Dawn vs Chromium WebGPU | rgba8unorm | 0.000000 / 0.000000 | 1.000000 / 0.036133 | 1.000000 / 0.694499 |
| crossfade | Node/Dawn vs Chromium WebGPU | rgba16float | 0.000000 / 0.000000 | 0.124512 / 0.027066 | 0.124512 / 0.025593 |
| blur | Node/Dawn vs Chromium WebGPU | rgba8unorm | 0.000000 / 0.000000 | 0.000000 / 0.000000 | 1.000000 / 0.000158 |
| blur | Node/Dawn vs Chromium WebGPU | rgba16float | 0.000000 / 0.000000 | 0.373535 / 0.057396 | 0.373535 / 0.047687 |
| grain | Node/Dawn vs Chromium WebGPU | rgba8unorm | 0.000000 / 0.000000 | 1.000000 / 0.000068 | 1.000000 / 0.016170 |
| grain | Node/Dawn vs Chromium WebGPU | rgba16float | 0.000000 / 0.000000 | 0.373535 / 0.056414 | 0.249023 / 0.050691 |

No case exceeds its declared tolerance. Same-adapter SwiftShader is exactly
equal in both formats. Cross-adapter differences reach one RGBA8 step and
three FP16 steps. Those diagnostics cannot isolate host from adapter errors.

[B218](../../../../native/timeline/docs/gaps-backlog.md) remains open. The grain
fixture is not the older CPU/GPU or legacy-grain matrix. Its cross-adapter
differences appear above. This run does not reproduce or clear the recorded
NVIDIA PNG/WebP/MOV low-alpha failures. No NVIDIA behavior was changed.

## Verification and limits

The changed delivery file passed seven tests on llvmpipe and seven on RTX.
The new parity test passed six fixtures in both formats on same-adapter
SwiftShader. Explicit cross-adapter runs passed on Node llvmpipe and RTX.
Node llvmpipe reports Mesa 26.2.5-arch1.1 / LLVM 23.1.3. Node RTX reports
NVIDIA GeForce RTX 3060 / 610.57.04.

A strict lavapipe negative run exited 1 specifically for browser adapter
mismatch. Its CI-mode counterpart skipped one test. No it.fails was added.
Package-scoped source and test typechecks passed for timeline and video-nodes.
Only the changed test files ran. No production code changed, so earlier
default-frame hash fixtures were not rerun. FP16 stays off by default.
BT.709 and the six colour-boundary expected failures are unchanged.

Commands source /home/mg/Projects/nodetool-film/bin/ntenv, unset DISPLAY and
set TMPDIR=/home/mg/Projects/nodetool-film/tmp. Lavapipe sets both
VK_ICD_FILENAMES and VK_DRIVER_FILES to /usr/share/vulkan/icd.d/lvp_icd.json.
RTX sources /home/mg/.local/nvidia-610/env.sh after ntenv. SwiftShader sets both
Vulkan variables to /usr/lib/chromium/vk_swiftshader_icd.json. Runs use
systemd-run --user --scope -p MemoryMax=6G and LP_NUM_THREADS=2. Available
memory stayed above 5 GB at the checks.

From packages/timeline, run npx vitest run tests/render.a432Browser.gpu.test.ts
--maxWorkers=1. A432_REPORT selects the report path. Set
A432_ALLOW_CROSS_ADAPTER=1 only for explicitly labelled diagnostics.
A432_REQUIRE_WEBGPU=1 prevents CI skips. A432_BROWSER_FLAGS accepts a JSON
array of extra launch flags. From packages/video-nodes, run npx vitest run
tests/timeline-delivery-checks.gpu.test.ts --maxWorkers=1.

TMPDIR retains a432-parity-{swift,lvp,rtx}.{json,log}, a432-alpha-{lvp,rtx}.log,
a432-mismatch-negative.log, a432-ci-skip.log, a432-*-types.log and the small
browser probe scripts/logs named a432-probe-*, a432-native-*, a432-direct-*,
a432-bundled-*, a432-forced-* and a432-no-fallback-*. Test browser profiles
are removed by Playwright. No ffmpeg or ffprobe binary ran.

Not run: test:affected, root typecheck, root lint, harness gate, /verify, full
suites, hosted CI, video decode parity, presentation checks, WebCodecs delivery,
native output or agent output in that earlier run. The agent follow-up is
recorded below. No push, rebase, branch switch or PR was performed.

Implementation commits: d22426a418 records the alpha diagnostic and
27f21ffaf0 adds the browser/server working-frame comparison. The report and
scoped plan checkbox are committed separately.


## Migrated agent comparison after A91

Test implementation: `723503180c`.

[timeline-a432-parity.gpu.test.ts](../../../../packages/agents/tests/timeline-a432-parity.gpu.test.ts)
uses the same `fixtureDocument`, original buffers, dimensions and 500 ms sample
as the browser/server comparison. PNG originals are encoded losslessly for the
agent's normal asset loader. The shared fixture now supplies `currentAssetId`:
the initial run correctly reported missing assets without it. The older test
provided pixels directly by clip ID, so it had not exercised asset selection.
This was fixture metadata, not a renderer defect. No production code changed.

The test lives in agents, where Canvas and GPU dependencies are allowed. No
manifest, production import or dependency cut changed. It calls the default
`renderTimelineFrames` shared-shader path through the real `createRenderChild`
client. A test entry imports the production child unchanged and observes its
cached GPU device. A wrapper records IPC inputs and responses without replacing
rendering. Every child adapter must match the server's vendor, device and
description. Original decoded source bytes, dimensions, resolved opacity and
effects (including grain seed) are asserted against the independently resolved
server layers. The full-resolution PNG must be complete with no omitted effects.
Blur and grain must change the ramp control.

### Comparison points and bounds

Server: Node/Dawn `HeadlessFrameCompositor.renderWorkingFrame`, premultiplied
`rgba8unorm`, before final alpha resolve, dither or encoding. A second render
uses `renderFrame` to obtain the same delivery stage as the child.

Agent: Node/Dawn `HeadlessFrameCompositor.renderFrame` in the production child,
straight RGBA8 immediately after final resolve and before PNG encoding. The test
also decodes the actual agent PNG through Skia and compares every channel.
Both hosts use the agent's production opaque-black ground. These six fixtures
retain alpha 255 throughout, asserted across the server working frame, so the
straight-alpha divide is identity. The low-alpha fixture tests 1/16 layer
opacity over black, rather than transparent PNG delivery. The existing browser
comparison above independently retains transparent working-alpha coverage.

The child defaults to `rgba8unorm`. Its delivery shader does not dither in this
format. FP16 alone selects the dithered delivery shader. No FP16 option is
passed to the agent or enabled in production. Server working versus server
delivery is required to be exactly equal, as is child delivery versus decoded
PNG. Thus the different observation points consume zero additional error
budget for these opaque fixtures. The maximum server/agent allowance remains
one RGBA8 code for adjacent UNORM rounding, matching the existing RGBA8 bound.
The same bound limits the mean. This does not authorize a one-code PNG loss or
cover straight-RGB amplification at transparent edges.

Errors are absolute RGBA byte differences across all 768×432 pixels, including
alpha, with no rounding of reported errors. The 240-second correctness timeout
allows six cold children at their production 30-second deadline plus 60 seconds
for parent rendering, asset/PNG work and teardown. It is not a latency budget.
A temporary two-code server-delivery corruption made the new comparison fail
at the one-code assertion. It was removed before the final passing run.

### Agent measurements

Adapter on server and every child: vendor `mesa`, device
`llvmpipe-llvm-23-1-3-256-bits-`, description
`llvmpipe: Mesa 26.2.5-arch1.1 (LLVM 23.1.3)`, Vulkan lavapipe.
Renderers in every row: Node/Dawn server versus Node/Dawn agent child with
Skia PNG encoding/decoding. Working format: `rgba8unorm`. Values are max / mean
in code units. All comparisons use the same adapter within each pair.

| Fixture | Working vs child before PNG | Working vs agent decoded PNG | Server delivery vs decoded PNG | Max bound |
|---|---:|---:|---:|---:|
| ramp | 0 / 0 | 0 / 0 | 0 / 0 | 1 |
| low-alpha | 0 / 0 | 0 / 0 | 0 / 0 | 1 |
| fade | 0 / 0 | 0 / 0 | 0 / 0 | 1 |
| crossfade | 0 / 0 | 0 / 0 | 0 / 0 | 1 |
| blur | 0 / 0 | 0 / 0 | 0 / 0 | 1 |
| grain | 0 / 0 | 0 / 0 | 0 / 0 | 1 |

Server resolve and PNG round-trip max/mean are also 0/0 for every fixture.
No over-tolerance result or shared-renderer defect appeared. These are software
adapter measurements, not hardware or arbitrary-media qualification. The
browser/agent pair was not run together on lavapipe. The earlier browser/server
SwiftShader results and this server/agent lavapipe result are separate
same-adapter comparisons.

### Follow-up verification

Commands run from the worktree root, after sourcing
`/home/mg/Projects/nodetool-film/bin/ntenv`, with `DISPLAY` unset,
`TMPDIR=/home/mg/Projects/nodetool-film/tmp`,
`TMPPREFIX=/home/mg/Projects/nodetool-film/tmp/a432-agent`,
`LP_NUM_THREADS=2`, and both `VK_ICD_FILENAMES` and `VK_DRIVER_FILES` set to
`/usr/share/vulkan/icd.d/lvp_icd.json`. `NODE_OPTIONS=--conditions=nodetool-dev`
keeps parent and child on current workspace source rather than stale output.
No ffmpeg or ffprobe binary is used by the image-only fixture.

```bash
A432_REPORT=/home/mg/Projects/nodetool-film/tmp/a432-agent-lvp.json \
  npx vitest run packages/agents/tests/timeline-a432-parity.gpu.test.ts --maxWorkers=1
node scripts/run-tsc.mjs -p packages/agents/tsconfig.json --noEmit
node scripts/run-tsc.mjs -p packages/timeline/tsconfig.json --noEmit
npx oxlint --config .oxlintrc.anti-slop-enforced.json \
  packages/agents/tests/timeline-a432-parity.gpu.test.ts \
  packages/agents/tests/fixtures/a432-render-child.ts \
  packages/timeline/tests/a432Fixture.ts
```

The selected test, both package typechecks and selected-file oxlint passed.
The first agents typecheck found stale model declarations and a missing
pack-core declaration. Only those dependency outputs were refreshed with
`build-typescript-workspace.mjs`. The models dependency build exited 2 on
unrelated Rapier API errors in `game-runtime/src/spatial3d/world.ts`, while
emitting the declarations needed here. The subsequent agents typecheck passed.
No capability table generation ran. `git diff --check` and a control-byte scan
passed. Logs are `a432-agent-lvp.log`, `a432-agent-negative.log`,
`a432-{agents,timeline}-types.log` and `a432-{models,pack-core}-build.log`
under the designated temporary directory. The JSON report records every
fixture's child adapter and all five error comparisons.

Not run in this follow-up: `test:affected`, root typecheck, root lint,
`harness gate`, `/verify`, any full suite, unchanged dependency-cut tests,
browser tests, hardware, hosted CI or packaging checks. No push, rebase, merge,
branch switch or PR was performed.
