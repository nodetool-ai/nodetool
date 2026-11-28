# Timeline stress measurement

Build `tst_timeline_perf`, then run:

```sh
ctest --test-dir native/timeline/build -LE window -R '^tst_timeline_perf' --output-on-failure
```

`StressDocument.h` preserves the F5 document: the dense clip has 2,000 notes.
Each scenario starts a fresh editor with isolated preferences at 1920×1080.
The edit workload repeats F5's video move, marker add/delete, track rename,
MIDI move and undo. The assistant variant uses registered assistant move edits.
That path applies overwrite semantics, so its work can differ from `moveClip`.
The assistant path has its own `agent` budget.

Each test runs an unprofiled counter/timing pass and a separate diagnostic profiler pass. Results are
written to `build/perf-<scenario>.json` and `.timing.json`. The profile contains
binding, creation, signal-handler and JavaScript sites for scroll, zoom and
both drags, including release. Edit profiling omits JavaScript call tracing to
bound memory. Times never gate CI.

Counters have these boundaries:

- `objectCreations` observes parented QObject and visual-child lifecycles in
  the loaded editor. Reparenting does not count. It excludes unparented objects
  that never enter the observed trees. Existing external trees must be seeded
  with `observe()` before reparenting. The driver seeds the editor, model,
  window (including overlays) and engine. Visual child notifications visit
  only the added child. Objects moving off the UI thread are detached before
  the handoff. `delegateCreations` matches the exact
  object names of the generated clip IDs, excluding transition handles. Qt's profiler counts construction and completion ranges separately,
  so its creation-range totals are reported separately from object counts.
  Profiler `MenuItem` creation ranges are diagnostic only because profiling
  changes timer scheduling. Transient menu objects attached to the observed
  trees are classified while alive.
- `crossings` counts JSON/QVariant conversions at the named `crossingSites`:
  clip inspector cache misses, gesture clip data, model markers, piano-roll
  note commit and reload. Cached property reads do not count. This gate samples
  these four boundaries. `InspectorEdits::document`, `SpeedController::document`,
  `TransitionController::document`, `ReframeController::document`,
  `AutomationController::tracks` and `MarkerSession::rows` are excluded from this
  sample. Their downstream copies and transformations are outside this gate.
  Moving work to those APIs requires extending the gate before claiming a
  reduction in total marshaling. The counters do not measure all marshaling.
  `payloadBytes` sums compact UTF-8 JSON payload sizes at those boundaries.
  It measures logical transfer volume, not physical allocator copies. Size
  caching avoids serializing an unchanged payload repeatedly in the recorder.
- `valueTypeWriteBacks` counts whole `Q_GADGET` property writes from QML,
  including field assignments and whole-value assignments. Interceptors forward
  each write to its setter once. The observer covers writable gadget properties
  in the editor and model trees present when the measured workload starts.
  Properties with an existing interceptor are excluded. The selfcheck writes a
  gadget field in QML and checks one counter increment and one C++ setter call.
- `jsonParses` counts edit validation and document-replacement parser calls.
  Startup parsing is excluded. Signal counters cover model clip, timeline,
  marker and source notifications. `dataChangedRows` counts notifications from
  models observed through the editor, document, window and engine trees.
  `dataChangedRowsByModel` splits that total by model type. Pooled slot identity
  changes are reported separately as `reboundClipRows` and `reboundTrackRows`.
  Exact lane edit roles remain covered by `tst_tracksui`.

Seeded objects are inspected synchronously. Construction retries run only for
newly attached children. The observer selfcheck rejects retries for a seeded
scene and verifies discovery of models added after observation starts.

Every frame records `guiActionMs`, `deferredEventsMs` and
`renderSyncReadbackMs`. `frameSamplesMs` retains their partition for each frame,
including frame zero. The `Clip.qml` root `Creating` site's `maxMs` reports
synchronous clip construction. Deferred loaders remain in the frame phases.

`budgets/aot-hot-files.json` limits unique failed function sites in the generated
hot-file `.aotstats` reports, including `ClipChrome.qml`. `tst_timeline_aot`
checks those reports. `tst_timeline_aot_checker` proves that a new failure,
a missing report or an empty scan fails the check.



Edit phase timers form an exclusive stack. `undo_stack` excludes redo's parse,
replacement and synchronous signal fan-out. Marker notifications belong to
fan-out too. The gap between summed phases and action/frame time includes
unscoped action work, deferred bindings, layout, paint and readback. The edit
result also records individual operation samples. `actionMs`,
`deferredEventsMs` and `captureMs` partition each edit operation. CPU render/sync
callbacks can execute within the latter intervals and must not be added to them.

The default is offscreen software with the basic render loop. To request a
real RHI backend on a capable machine, keep QPA offscreen:

```sh
NT_TIMELINE_PERF_GPU=1 ctest --test-dir native/timeline/build -LE window -R '^tst_timeline_perf_zoom$' --output-on-failure
```

The GPU mode uses `QQuickRenderControl` and an RHI texture target without
showing a window. It rejects software fallback or target creation failure. `renderCpuMs`
and `syncMs` measure CPU scene-graph stages. `guiActionEventsMs` measures input
and event dispatch. `guiAndReadbackMs` includes GUI work and readback waiting,
so it is not GPU execution time. No profiler TCP port or localhost is needed.

`budgets/ui-120hz.json` gates counters only. The runner rejects missing fields
and measurements above the committed ceilings in the checkout. Tests need no
remote Git refs, including in shallow CI checkouts. `--base-budget` optionally
checks ceilings against an explicit reviewed baseline. Adding scenarios against
that baseline requires `--allow-new-budget`. New counters start with a zero ceiling. There is no automatic budget update. The checker tests exercise deliberate
increases, missing counters and invalid negative counts.
