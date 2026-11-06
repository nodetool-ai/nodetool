# A106: Working color space version reporting

A106 refuses unsupported timeline pixels. It enables no version 2 rendering,
changes no new-document default and makes no migration decision. D5.6 remains
for heavy-d. A107's persistence matrix remains separate work.

The one support limit is `MAX_SUPPORTED_WORKING_COLOR_SPACE_VERSION = 1` in
`packages/timeline/src/colorSpaceVersion.ts`, exported from
`@nodetool-ai/timeline`. A102 owns any later change after route qualification.
All routes share this exact report, with the document's value substituted:

> Document workingColorSpaceVersion is 2. This build supports versions up to 1. Open it with a build that supports this value.

> Document workingColorSpaceVersion is 3. This build supports versions up to 1. Open it with a build that supports this value.

The web read-only view says the same thing in plain language: "This timeline uses color version 2. This version of NodeTool supports up to version 1. Update NodeTool to edit or export it."

The wording matches the inspected `origin/film/color-n4` files
`native/timeline/src/model/TimelineJson.cpp` and
`docs/plans/color-precision/results/n4-version-field.md`. Agent wrappers can
prefix the shared report with operation context.

## Route inventory

Every row preserves the existing rendering path for absent and numeric 1.
Versions 2 and 3 produce no timeline pixels. Guards run before render resources
or output are created. No rendering algorithm was changed.

| Route | Inspected source | Absent / 1 | 2 / 3 |
| --- | --- | --- | --- |
| Web editor preview | `TimelineEditor.tsx`, `PreviewArea.tsx`, `PreviewCompositor.tsx`, `gpu/createCompositor.ts` | Existing WebGPU/Canvas2D preview | Metadata-only view before editor mount |
| Web export download and save to assets | `ExportVideoDialog.tsx`, `useTimelineExport.ts`, `render/TimelineRenderer.ts` | Existing export | Editor actions unavailable. Direct renderer calls also reject |
| Embedded preview in chat, storyboards and node output | `components/timeline/TimelineRenderer.tsx` | Existing isolated preview | Metadata view before instance creation |
| RenderTimeline browser | `video-nodes/src/nodes/timeline.ts`, `timeline/browserRender.ts` | Existing browser renderer | Node entry and direct browser driver reject |
| Headless browser page | `render/headless/renderPage.ts`, shared `HeadlessRenderRequest` | Existing encode/upload | Rejects before encoding. Driver and page preserve the version in render options |
| RenderTimeline Node/Dawn | `timeline.ts`, `timeline/compositeRender.ts` | Existing GPU compositor | Node entry and direct compositor reject |
| Restricted rough cut | `timeline.ts` fallback | Existing restricted fallback | Node entry rejects before fallback selection |
| Agent frame preview and contact sheet | `capabilities/timelines.ts`, `timeline-preview/frames.ts` | Existing Canvas2D pixels | Rejects before loading canvas or assets |
| Agent comparison | `capabilities/timelines.ts` | Existing two-sided render | Both sides keep their version and use the guarded frame renderer |
| Agent storyboard finish and layout checks | `agentic-storyboard-finish.ts`, `storyboard-layout-check.ts` | Existing frame renderer | Shared frame gate. Newly constructed reference sequences remain unversioned |
| Agent clip inspection | `capabilities/timeline-clip-frames.ts` | Existing shape/text/3D and raw media frames | Rejects before either branch |
| Agent render_timeline | `capabilities/timelines.ts` | Existing render job | Shared error before starting a job, independently checked by RenderTimeline |
| CLI timeline render | `commands/timeline-render.ts`, `timeline-debug/target.ts` | Existing video/stills/selected frames/contact sheet | Throws before render-pack loading or injected renderer. Handler reports failure exit status |
| Web agent raster clip frames | `useTimelineAgentBridge.ts`, `preview/rasterClipFrames.ts` | Existing clip rasterization | Unsupported editor does not bind the bridge. Store load also rejects |
| Remaining Canvas2D drawing | `timeline/src/render/canvas2d.ts`, `frameCompositor.ts`, browser `gpu/canvas2dCompositor.ts` | Existing layer drawing | APIs take layers, not documents. Their document-owning callers above enforce the version |

Searches enumerated callers of `renderTimelineComposited`,
`renderTimelineInBrowser`, `renderTimelineFrames`, `HeadlessFrameCompositor`,
`computeActiveLayers`, `drawTimelineFrame`, `preview_timeline_frame` and
`renderRasterClipFrames`. `timeline-bridge.ts` also resolves a layer stack
without drawing it. Low-level text/shape/media/3D rasterizers do not own a
timeline document. Asset thumbnails and waveforms display source media rather
than a timeline composite. Unsupported editors mount none of those panels.
Native routes belong to A108 and were only inspected for wording.

The CLI target reader dropped the version before rendering. It now retains and
validates the field with A105's protocol field schema. The new CLI test failed
with a zero-duration error instead of the version report before this correction.

## Web read-only behavior

There was no document-wide read-only mode. Unsupported documents now show
metadata through existing `FlexColumn`, `Text` and `AlertBanner` primitives,
before mounting `TimelineEditorBody` and its provider. Users can read the name,
size, frame rate, duration, track count, clip count and version report. Copy says:

> Read-only. Editing, saving, preview and export are unavailable in this build.

The editor, playback, autosave, legacy migration hooks, linked-script sync and
agent edit bindings do not mount for that document. Other workspace tabs keep
their existing shell. A store load guard also refuses an unsupported document
before clip normalization or legacy caption migration, preserving previous
edited work. Headless agent operations reject unsupported documents before
applying edits. Metadata reads remain available. Server persistence schemas
still accept newer versions as A105 requires.

## Preservation evidence

- Web shell tests open 2 and 3 and require metadata and the shared report, no
  load/autosave hook calls, and identical input serialization before and after.
- Store tests load unsupported documents over existing edited work and require
  the previous state object and incoming serialized document to stay unchanged.
- CLI tests write real files at 2 and 3, require the version error and no render
  call, then compare the saved file bytes exactly.
- Agent render tests save 2 and 3 in the database, invoke the capability, and
  compare the persisted document string afterward. No output asset is created.
- Browser exporter, embedded preview, headless page, server browser/Dawn and
  Canvas2D tests reject 2 and 3 and compare input serialization afterward.
- Shared policy tests accept absent and 1 without mutation. Disabling the
  assertion makes both unsupported cases fail. Restoring it passes.

Existing accepted-version tests exercise the unchanged render paths. Fresh
byte-for-byte exported video parity against the parent commit was not measured.
The six `it.fails` GPU color-boundary cases were untouched. Tests did not spawn
ffmpeg or ffprobe binaries.

## Verification and gaps

Focused passing files, run from their package directory with
`npx vitest run <files> --maxWorkers=1` or file-filtered Jest `--runInBand`:

- Timeline: `colorSpaceVersion.test.ts`.
- Video nodes: `timeline-colorSpaceVersion.test.ts`, `timeline-nodes.test.ts`,
  `timeline-browser-path.test.ts`, `timeline-composite.test.ts`.
- Agents: `timeline-colorSpaceVersion.test.ts`, `timeline-mask-frames.test.ts`,
  `capabilities-timeline-preview.test.ts`.
- Agents: the two unsupported-version cases in
  `capabilities-timeline-render.test.ts` also passed with `-t 'unsupported version'`.
- CLI: `timeline-colorSpaceVersion.test.ts`,
  `timeline-render-completeness.test.ts`, `timeline-target.test.ts`.
- Web: `TimelineEditor.test.tsx`, `TimelineRenderer.test.tsx`,
  `TimelineRenderer.release.test.ts`, `TimelineStore.projectSettings.test.ts`,
  `renderPage.colorSpaceVersion.test.ts`.

Timeline and video-node package typechecks passed. Agent, CLI and web
package-only typechecks were attempted and remain blocked by unbuilt outputs,
including execution, game-nodes and image-nodes, and errors in untouched
game-runtime code. Targeted Turbo builds were limited to timeline, video-nodes,
pack-manager and cli-common dependency closures. The setup script ran. The
missing web dependency tree was copied from the existing checkout using
copy-on-write. Initial Node 26 tests hit a native ABI mismatch. Checks were
rerun with Node 24.22.1.

The selected broader agent files `capabilities-timelines.test.ts`,
`capabilities-timeline-render.test.ts` and `timeline-headless-media-parity.test.ts`
were attempted. They could not all pass because `@nodetool-ai/execution`
entry points were unbuilt. Their accepted-version end-to-end paths remain
unqualified here. No interactive browser, hardware GPU, cross-platform or native
verification was performed.

`TMPDIR` was `/home/mg/Projects/nodetool-film/tmp`. GPU-capable runs unset
`DISPLAY` and set both `VK_ICD_FILENAMES` and `VK_DRIVER_FILES` to
`/usr/share/vulkan/icd.d/lvp_icd.json`.

Root `test:affected`, root typecheck, root lint, `harness gate`, `/verify` and
`build:packages` were not run. No full suite completed. One root `npm test`
was accidentally started from the wrong directory and its process tree stopped
before restarting file-filtered web tests. It is not a verification result.

`git diff --check` and a control-byte scan passed. No push, rebase or PR was
performed. No owner decision was needed to implement the requested D5.3 behavior.
