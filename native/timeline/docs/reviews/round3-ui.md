- **F1 · P1 — The new FIFO test breaks the Windows build.** [tst_tracksui.cpp:57](native/timeline/tests/tst_tracksui.cpp:57) unconditionally includes `<unistd.h>`. The fixture also uses `SIGPIPE`, `O_NONBLOCK`, and `mkfifo` at [line 2399](native/timeline/tests/tst_tracksui.cpp:2399). The Windows CI job builds this target with MSVC, which lacks these POSIX facilities. **Fix:** guard the POSIX fixture and headers with `Q_OS_UNIX`, and provide a portable or Windows-specific equivalent. Source-confirmed, not compiled on Windows.

- **F2 · P2 — Empty native timing summaries still pass validation, and the new test masks missing checks.** [web-baseline.mjs:446](native/timeline/scripts/web-baseline.mjs:446) checks timing objects for truthiness. With positive frame counts and `frameMs: {}, renderMs: {}, guiMs: {}`, `fixtureFailures()` returns `[]`. Empty objects are the actual output of [UiBench.cpp:101](native/timeline/src/ui/UiBench.cpp:101) when samples are absent. The [new test at line 60](native/timeline/scripts/conformance/web-baseline.test.mjs:60) simultaneously removes `frameMs` and sets `compositedFrames` to zero. Removing either validation independently leaves all 11 tests passing. Removing `frames > 0` also passes. **Fix:** validate positive sample counts and finite timing values, then test each invalid field separately with otherwise-valid results.

Earlier findings from `rv2-ui.out`:

| Earlier finding | Status | Evidence |
|---|---|---|
| rv2 F1: stale texture references after invalidation | **Fixed** | Acquisitions record generations, invalidation advances them, and stale releases are ignored: [MediaPreviews.cpp:621](native/timeline/src/ui/MediaPreviews.cpp:621), [648](native/timeline/src/ui/MediaPreviews.cpp:648), [707](native/timeline/src/ui/MediaPreviews.cpp:707). |
| rv2 F2: failed native benchmarks pass | **Fixed in part** | Nonzero exits now fail, but empty metrics still pass. See new F2 and [web-baseline.mjs:446](native/timeline/scripts/web-baseline.mjs:446). |
| rv2 F3: failed audio assets silently skipped | **Fixed in part** | Reported failed downloads now fail at [peaks-check.mjs:38](native/timeline/scripts/peaks-check.mjs:38). However, iteration covers only `report.assets`. One successful audio asset plus a required audio clip present only in `missingAssets` still produces no failures. Expected clip coverage needs reconciliation. |
| rv2 F4: timeline rate used for source-frame errors | **Fixed for supported local fixtures** | Source timestamps are collected and compared by frame index: [web-baseline.mjs:245](native/timeline/scripts/web-baseline.mjs:245), [287](native/timeline/scripts/web-baseline.mjs:287), [338](native/timeline/scripts/web-baseline.mjs:338). |
| rv2 F5: filmstrip tests tolerate missing drawing loop | **Fixed for the reported mutation** | Positive cell counts, coverage, and screenshot checks now apply before and after scrolling: [tst_tracksui.cpp:1802](native/timeline/tests/tst_tracksui.cpp:1802), [2254](native/timeline/tests/tst_tracksui.cpp:2254). |
| rv2 F6: mark-clip test cannot distinguish tracks | **Fixed** | Distinct spans and locked/unlocked upper-track cases distinguish the result: [tst_tracksui.cpp:1971](native/timeline/tests/tst_tracksui.cpp:1971). |
| rv2 F7: cut-grip test checks an edge no-op | **Fixed** | The click is three pixels inside the grip and asserts both split spans and another undo entry: [tst_tracksui.cpp:1387](native/timeline/tests/tst_tracksui.cpp:1387). |

The report also carried forward these M2b findings. “Fixed, retained” means this round preserves the earlier fix.

| Earlier finding | Status and evidence |
|---|---|
| M2b F1: per-delegate atlases and retained textures | **Fixed, retained.** Shared atlases and budgeted textures remain, with generation protection added: [MediaPreviews.cpp:496](native/timeline/src/ui/MediaPreviews.cpp:496), [689](native/timeline/src/ui/MediaPreviews.cpp:689). |
| M2b F2: whole-clip geometry | **Fixed, retained.** Visible-span drawing remains, with stronger tests: [MediaPreviews.cpp:1029](native/timeline/src/ui/MediaPreviews.cpp:1029), [tst_tracksui.cpp:2254](native/timeline/tests/tst_tracksui.cpp:2254). |
| M2b F3: misleading save banner | **Not assessed.** Save implementation and QML changes are outside the requested scope. |
| M2b F4: stale same-path previews | **Fixed, retained.** File-version identity and completion checks remain: [MediaVersion.h:13](native/timeline/src/ui/MediaVersion.h:13), [MediaPreviews.cpp:517](native/timeline/src/ui/MediaPreviews.cpp:517). |
| M2b F5: abandoned decoding | **Fixed in part.** The new callback handles interruptible reads, but cannot interrupt a blocked local `open`/`read`. Image decoding also remains uninterruptible: [MediaPreviews.cpp:66](native/timeline/src/ui/MediaPreviews.cpp:66), [318](native/timeline/src/ui/MediaPreviews.cpp:318). The FIFO test continuously supplies bytes at [tst_tracksui.cpp:2419](native/timeline/tests/tst_tracksui.cpp:2419), so it misses a truly stalled read. |
| M2b F6: empty-lane selection | **Fixed, retained.** Gap presses still route through `pressLane`: [TrackLane.qml:47](native/timeline/qml/Tracks/TrackLane.qml:47). |
| M2b F7: unsupported shortcuts advertised | **Fixed, retained.** Mark-clip and available-action filtering remain: [ClipGestureController.cpp:714](native/timeline/src/edit/ClipGestureController.cpp:714), [903](native/timeline/src/edit/ClipGestureController.cpp:903). |
| M2b F8: FFmpeg failures become skips | **Fixed, retained.** Only a missing executable skips. Execution and output failures fail assertions: [tst_tracksui.cpp:1717](native/timeline/tests/tst_tracksui.cpp:1717). |
| M2b F9: audio-source identity collision | **Fixed, retained.** Identity includes `audioPath`: [TimelineModel.cpp:17](native/timeline/src/model/TimelineModel.cpp:17). |
| M2b F10: stale length after reopening | **Fixed, retained.** Replacement clears probes and advances generation: [ClipGestureController.cpp:113](native/timeline/src/edit/ClipGestureController.cpp:113). |

| Earlier M4 finding | Status and evidence |
|---|---|
| M4 F1: gesture restores an old document | **Fixed, retained.** Replacement drops gestures and cancellation checks document generation: [ClipGestureController.cpp:113](native/timeline/src/edit/ClipGestureController.cpp:113), [555](native/timeline/src/edit/ClipGestureController.cpp:555). |
| M4 F2: edits lose resolved media | **Fixed, retained.** Document-level media resolution survives edits: [TimelineModel.cpp:74](native/timeline/src/model/TimelineModel.cpp:74), [143](native/timeline/src/model/TimelineModel.cpp:143). |
| M4 F3: partial linked split | **Fixed, retained.** Refusal preflight excludes the linked unit: [EditActions.cpp:225](native/timeline/src/edit/EditActions.cpp:225). |
| M4 F4: drops bypass media-track ownership | **Fixed, retained.** Drops removing owner IDs are rejected: [EditActions.cpp:488](native/timeline/src/edit/EditActions.cpp:488). |
| M4 F5: ripple freezes group parents | **Fixed for the reported case, retained.** Groups remain ripple participants: [EditActions.cpp:25](native/timeline/src/edit/EditActions.cpp:25), [45](native/timeline/src/edit/EditActions.cpp:45). |
| M4 F6: Escape and interleaved commands | **Fixed, retained.** Commands cancel the gesture first: [ClipGestureController.cpp:627](native/timeline/src/edit/ClipGestureController.cpp:627). |
| M4 F7: missing source caps | **Fixed for the remaining reported case.** `audioPath` now supplies fallback identity: [ClipGestureController.cpp:843](native/timeline/src/edit/ClipGestureController.cpp:843). The new fallback-cap test passed. |
| M4 F8: conformance false passes | **Fixed for the remaining reported case.** Refusal messages now use exact equality: [known-differences.test.ts:99](native/timeline/scripts/conformance/known-differences.test.ts:99). |
| M4 F9: normalization hides retained-ID corruption | **Fixed, retained.** Input IDs remain protected from normalization: [normalize.ts:17](native/timeline/scripts/conformance/normalize.ts:17), [40](native/timeline/scripts/conformance/normalize.ts:40). |

Verification and test sensitivity:

- **Qt:** All five runnable changed cases passed: cut grip, mark clip, both filmstrip drawing cases, and audio fallback cap. Three additional existing cases passed. The existing texture-sharing test failed during setup because the read-only sandbox blocked `QFile::link`. The overall invocation exited 1.
- **JavaScript:** All 16 new Node tests passed. In-memory mutations exposed the native-validation gaps in F2. All five peaks tests rejected targeted broken implementations.
- **Exact refusals:** Ran the four changed assertion bodies against `build-r2/timeline-ops` in an in-memory harness. All passed and rejected both altered error text and missing exceptions.
- **C++ test sensitivity:** Source inspection shows that removing the drawing loop, reversing track priority, losing interior-grip cutting, or removing the audio fallback would fail the revised assertions. These were not compiled mutation runs.
- **Remaining coverage gaps:** All web-baseline tests also pass if `timingByClip()` always returns `null`, because frame tests inject their own lookup callbacks. The cancellation fixture misses fully blocked reads. An anonymous-pipe probe against installed libavformat confirmed that cancellation did not unblock such a read.

I did not run the new scene-graph invalidation test: it removes `QT_QPA_PLATFORM` in a child despite belonging to a test without the `render` label. I also did not run the filesystem-writing FIFO test, Windows compilation, full Vitest conformance, or browser/server benchmarks. No files were edited or rebuilt, no servers or port-7777 requests were used, and no visible windows or sound were produced.