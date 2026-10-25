1. **F1 · P2 · Reused surfaces hide sustained budget overruns.**  
   [SurfacePool.h:79](native/timeline/src/preview/SurfacePool.h:79). With an 800-byte budget, acquire three 10×10 targets in two consecutive frames. The first frame reports over budget. The second reuses all three through lines 55–60, bypassing the allocation-only flag at line 69, and reports false despite using 1,200 bytes. Retaining targets introduces this regression.  
   **Fix:** account for every target acquired during the frame, including reused targets. Extend `frameOverBudgetIsReported` to cover consecutive over-budget frames.

2. **F2 · P2 · The new CPU exit-race test accepts incorrect thread attribution.**  
   [tst_cpuusage.cpp:64](native/timeline/tests/tst_cpuusage.cpp:64). `ns >= -1` accepts every documented result. An implementation that preserves live/dead validation but returns process CPU time for every live registration satisfies this assertion and the new advancement test. Incorrect samples taken during thread exit are never checked afterward. Reintroducing the original unlock-before-query race need not fail this test.  
   **Fix:** use a controllable native-query seam. Pause a query, begin exit cleanup, and assert that cleanup cannot close or recycle its handle until the query finishes. Give simulated handles distinct counters. Also compare a sleeping worker against a busy worker.

The earlier report’s nine findings have these statuses. “Fixed” describes the code and assertions, subject to the runtime limits below.

| Earlier finding | Status | Evidence |
|---|---|---|
| **Previous F1:** premature surface eviction | **Fixed** | Current-frame targets survive cleanup and budget eviction at [SurfacePool.h:83](native/timeline/src/preview/SurfacePool.h:83) and line 116. New F1 above concerns reporting. |
| **Previous F2:** CPU query races with exit cleanup | **Fixed in implementation** | [CpuUsage.cpp:157](native/timeline/src/platform/CpuUsage.cpp:157) holds the mutex through the native query. `releaseSlot()` takes that mutex at line 101. The regression test remains inadequate, as new F2 explains. |
| **Previous F3:** failed Vulkan release returns the surface | **Fixed in part** | Failed releases are retained at [VulkanInterop.cpp:380](native/timeline/src/preview/hw/VulkanInterop.cpp:380) and retried at line 226. Teardown still frees them without release at line 340. See the concrete remaining path below. |
| **Previous F4:** quadratic Yoga ownership allocation | **Fixed** | [FlexLayout.cpp:401](native/timeline/src/scene/FlexLayout.cpp:401) owns the node before ordinary vector insertion. Parent-first destruction at line 393 also avoids repeated child-list removal. |
| **Previous F5:** group verification selects a stale binary | **Fixed** | [check-group-surfaces.mjs:34](native/timeline/scripts/check-group-surfaces.mjs:34) selects the explicit or newest binary and passes it to the golden child at line 77. [compare-golden.mjs:62](native/timeline/scripts/compare-golden.mjs:62) executes that binary. |
| **Previous F6:** injected-failure check accepts hangs/crashes | **Fixed** | [check-group-surfaces.mjs:112](native/timeline/scripts/check-group-surfaces.mjs:112) rejects spawn errors, signals, and every exit status except 1, then requires a diagnostic. |
| **Previous F7:** live-counter assertion accepts unconditional failure | **Fixed** | [tst_cpuusage.cpp:39](native/timeline/tests/tst_cpuusage.cpp:39) requires a positive sample. Line 49 requires advancement. These establish progress, not thread identity. |
| **Previous F8:** close-revision assertion uses an obsolete baseline | **Fixed** | [tst_flexlayout.cpp:195](native/timeline/tests/tst_flexlayout.cpp:195) captures the revision immediately before `close()` and compares against it. |
| **Previous F9:** easing stress permits zero reader activity | **Fixed for the reported loophole** | [tst_easing.cpp:68](native/timeline/tests/tst_easing.cpp:68) requires reader startup and activity during writer rounds. It remains a probabilistic lifetime test. |

The remaining **previous F3** path is renderer reinitialization. [PreviewCompositor.cpp:239](native/timeline/src/preview/PreviewCompositor.cpp:239) replaces the interop without clearing `m_pool`. Existing frame references retain the old interop, then retire when replacement frames arrive at [FfmpegSource.cpp:965](native/timeline/src/preview/FfmpegSource.cpp:965). When its last reference disappears, the old interop unconditionally frees `unreleased` mappings, potentially returning them to a still-live decoder without the foreign ownership/layout release. **Fix:** complete releases before teardown, or stop and drain the associated decoders before freeing those mappings. This is a remaining error path, not a runtime-reproduced Vulkan failure.

The report also carried forward these older findings:

| Historical finding | Status after this commit | Evidence |
|---|---|---|
| Surface F1: allocation failure reported as exact | **Remains fixed** | Creation checks and exact-frame exclusion at [PreviewCompositor.cpp:405](native/timeline/src/preview/PreviewCompositor.cpp:405), lines 680 and 753. |
| Surface F2: inadequate nested-compositing checks | **Fixed in code** | Nested, tie-order and empty-group cases at [check-group-surfaces.mjs:46](native/timeline/scripts/check-group-surfaces.mjs:46), now using the selected binary. Pixel comparisons were not rerun. |
| Flex F1: floating-point contraction | **Remains fixed** | Compilation setting at [CMakeLists.txt:134](native/timeline/CMakeLists.txt:134). |
| Flex F2: large-number formatting | **Remains fixed** | Scientific conversion at [TextAnimation.cpp:68](native/timeline/src/scene/TextAnimation.cpp:68). |
| Flex F3: percentage whitespace | **Remains fixed** | Conversion through trimmed `jsNumber` at [FlexLayout.cpp:167](native/timeline/src/scene/FlexLayout.cpp:167). |
| Flex F4: Yoga exception leaks | **Remains fixed** | Immediate ownership at [FlexLayout.cpp:401](native/timeline/src/scene/FlexLayout.cpp:401). |
| Flex F5: exclusion audit misses groups/unobserved IDs | **Unchanged, remains fixed** | Descendant and coverage audit at [plan-compare.mjs:72](native/timeline/scripts/plan-compare.mjs:72). |
| Flex F6: line-stagger waiver hides unrelated defects | **Unchanged, remains fixed** | Normal comparison restored at [plan-conformance.mjs:505](native/timeline/scripts/plan-conformance.mjs:505). |
| Flex F7: layouts rebuilt every frame | **Remains fixed** | Revision/canvas/text cache lookup at [SceneEval.cpp:509](native/timeline/src/preview/SceneEval.cpp:509). |
| M6 F1: discarded pixels/missing foreign release | **Fixed in part** | Content-preserving acquisition at [VulkanInterop.cpp:564](native/timeline/src/preview/hw/VulkanInterop.cpp:564). The teardown release gap remains. |
| M6 F2: timeout frees pending resources | **Remains fixed** | Pending ownership and fence collection at [VulkanInterop.cpp:125](native/timeline/src/preview/hw/VulkanInterop.cpp:125). |
| M6 F3: auxiliary DRM planes discarded | **Remains fixed** | Plane-count validation and complete layouts at [VulkanInterop.cpp:480](native/timeline/src/preview/hw/VulkanInterop.cpp:480). |
| M6 F7: registration leaks every frame | **Remains fixed** | TLS registration reuse at [CpuUsage.cpp:135](native/timeline/src/platform/CpuUsage.cpp:135). |

**The macOS hypothesis is confirmed, and predates this commit.** [CpuUsage.cpp:20](native/timeline/src/platform/CpuUsage.cpp:20) returns a borrowed Mach port name, subsequently queried at line 27. A no-write probe using those APIs observed thread 83 reuse thread 25’s port name, `6403`. Querying the old name returned `KERN_SUCCESS` and the replacement thread’s nonzero CPU time. Apple’s implementation returns the name without retaining it, and its own persistent consumer explicitly retains the send right. [Apple implementation](https://github.com/apple-oss-distributions/libpthread/blob/main/src/pthread.c#L902-L908), [retained consumer](https://github.com/apple-oss-distributions/libpthread/blob/main/src/qos.c#L341-L345).

Use stable registration IDs with synchronized exit invalidation, or an owned handle whose lifetime covers every consumer. Retaining a raw name only until thread exit does not protect stale numeric callers after its eventual reuse.

**The transition resolver is quadratic within each active sibling bucket.** [SceneEval.cpp:237](native/timeline/src/preview/SceneEval.cpp:237) calls the full scan at line 188 once per sibling. Buckets contain active, visible, non-adjustment clips sharing a track and resolved parent. The scan costs `O(Σ bucket_size²)`, including equal-start clips that ultimately have no partner. This is unchanged by the fix.

A linear partner-selection pass **can preserve exact parity after stable sorting**: maintain the earliest maximum-end candidate from strictly earlier start times, process equal-start clips before adding that batch to the candidates, and update the maximum only on strict `>`. Preserve transition generation and merge order. This matches [transition.ts:154](packages/timeline/src/render/transition.ts:154). Sorting still costs `O(n log n)` unless its order is already available or cached.

**Changed-test sensitivity**

| Test/change | Assessment |
|---|---|
| Both changed/new surface tests | Their live-target assertions reject the previous premature deletion. They miss consecutive over-budget reporting. |
| `oneRegistrationPerThread` | Still rejects changing registration IDs or growing the registration count. |
| `liveThreadCounterAdvances` | Rejects unconditional `-1` and constant positive counters. Does not establish attribution. |
| `samplingWhileThreadsExit` | Does not reject incorrect attribution or reliably reject the original race. New F2. |
| Easing concurrency test | Rejects zero reader activity. Does not force eviction between lookup and invocation, so a lifetime defect can still pass without sanitizer detection. |
| Close-revision test | Rejects missing close-time revision advancement. |
| `bench_scene --relayout` | A measurement tool, not a regression gate. Removing invalidation or restoring quadratic behavior can still exit successfully. |
| Script changes | In-memory execution confirmed binary propagation and rejection of timeout, signal, spawn-error, wrong-exit and missing-diagnostic cases. |

These C++ sensitivity judgments are source-based. **Compiled mutation tests were not run**, because rebuilding was prohibited.

**Verified:** the existing `build-r2` suites passed offscreen: `tst_surfacepool` (9), `tst_cpuusage` (7), `tst_easing` (4), `tst_flexlayout` (13), and `tst_sceneeval` (20), including setup/cleanup cases. `bench_scene scene-flex.json --relayout` completed 120 frames, median 0.0938 ms. An in-memory comparison against the actual TypeScript `headOverlap` body matched 411,128 partner/overlap results across 10,000 generated buckets.

**Not verified:** Vulkan execution/fault injection, Linux/Windows CPU behavior, sanitizers, rendered golden pixels, or full-scene parity for a rewritten transition resolver. The windowless render test on the default platform aborted with “no screens available,” exit 134.

No edits, rebuilds, servers, port-7777 requests, visible windows, sound, or vendored-source inspection. The working tree remained clean.