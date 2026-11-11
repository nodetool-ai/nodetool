# Video and project export improvements

Status: Proposed. No implementation is included in this plan.

## Goal

Help a media agency deliver client videos and hand editable cuts to another
editor without rebuilding the project. Prioritize short ads, social campaigns,
explainers and branded video. Extend existing exporters before adding formats.

## Current starting point

- The [browser export dialog](../../web/src/components/timeline/ExportVideoDialog.tsx)
  offers MP4, WebM, PNG sequences, WAV and MP3. H.264 availability depends on
  the browser encoder.
- The [server output resolver](../../packages/video-nodes/src/nodes/timeline/outputFormats.ts)
  supports MP4, WebM, ProRes MOV and PNG sequences. MOV selects ProRes 422 HQ
  or 4444 for transparency, but currently uses AAC audio. Encoder availability
  is checked. A ProRes container alone does not establish end-to-end color precision.
- The [Premiere export planner](../../packages/websocket/src/lib/timeline-premiere.ts)
  packages FCP7 XML, referenced media and an export report. It is not a native
  `.prproj` writer.
- The [interchange implementation](../../packages/timeline/src/interchange.ts)
  has both `premiere_xml` and `fcpxml` writers. Premiere mappings include some
  transforms, keyframes, opacity, speed and audio properties. Other features
  produce warnings or require rendering into media. The website's blanket
  statement that these properties do not transfer needs a narrower replacement
  after compatibility verification.
- FCPXML generation exists in the library. This does not establish a complete,
  user-facing Final Cut Pro export or successful import into Final Cut Pro.
- [Timeline bundles](../../packages/project-services/src/timeline-bundle.ts)
  already provide a foundation for collecting project media.

These observations come from source inspection, not new export or import tests.

## Recommended work

| ID | Priority | Improvement | Agency benefit | Feasibility |
|---|---|---|---|---|
| A1 | First | Reliable Premiere handoff and export preflight | Another editor can continue the cut and see what needs attention. | Extend the existing XML, media collection and report paths. |
| A2 | First | Final Cut Pro handoff through FCPXML | Support agencies and freelancers editing on Macs. | Reuse the existing writer, add packaging and UI, and qualify actual imports. |
| A3 | First | Delivery presets and ProRes masters | Deliver review copies, social videos and a reusable master consistently. | Build on existing MP4 and MOV rendering. |
| A4 | Next | Caption sidecars and caption-free versions | Deliver accessible videos and localized variants without rebuilding the edit. | Serialize timed captions already present in the timeline. |
| A5 | Next | Aligned audio stems | Hand dialogue, music and effects to a sound editor or localization partner. | Extend audio export with explicit track selection and shared timing. |
| A6 | Next | Batch delivery and portable handoff packages | Produce a campaign's approved variants with predictable names and files. | Orchestrate existing exports after the individual paths are reliable. |

### A1 — Premiere handoff and export preflight

Show the report before exporting. For each affected clip, identify what remains
editable, what needs rendering into media, what is omitted and what cannot be
found. Never silently drop media or change timing.

Preserve supported cuts, track placement, source ranges and mapped properties.
Verify fractional frame rates, embedded audio, muted tracks and still images.
Offer a reference video with the package so the receiving editor can compare it.
Keep paths portable and filenames unique when different assets share a name.

Add rendering of unsupported visuals as a separate, bounded step. Start with
isolated titles and generated graphics. Masks, blend modes and transitions can
depend on surrounding clips, so do not promise that rendering each clip alone
preserves the result. Offer a rendered section or the reference video when
necessary, and explain the loss of editability. Optional source handles can
follow once trim and retiming behavior is verified.

Acceptance: import a packaged fixture into a named Premiere version on another
machine, relink media, compare timing and supported properties, and account for
every difference in the report.

### A2 — Final Cut Pro handoff

Expose a Final Cut Pro option using modern FCPXML, distinct from the older FCP7
XML used for Premiere. Package media and the same preflight report. Start with
video and audio cuts, gaps, source ranges and sequence settings. Map audio roles
where project metadata supports them. Add still images and common transforms
only after the basic sequence imports correctly.

Choose and document an FCPXML version against the supported Final Cut Pro
versions. Verify whether plain XML or an `.fcpxmld` bundle is appropriate for
that version and delivery. Do not describe this as a native Final Cut library
export or promise a lossless round trip.

Acceptance: import into Final Cut Pro on macOS, verify connected clips, audio
placement, media relinking and frame-accurate cut boundaries. Use the same
reference sequence as Premiere and document target-specific differences.

Apple documents [FCPXML project transfer](https://support.apple.com/guide/final-cut-pro/use-xml-to-transfer-projects-verdbd66ae/mac).
Adobe explains that [modern FCPXML is not directly importable into Premiere](https://helpx.adobe.com/premiere/desktop/organize-media/import-files/migrate-from-final-cut-pro-x.html).
Keep the two export targets separate.

### A3 — Delivery presets and masters

Offer a small set: review MP4, delivery MP4, ProRes 422 HQ master and ProRes 4444
with alpha. Expose resolution, frame rate and quality settings with explicit
defaults. Use existing aspect-ratio adaptation, but require a framing review
before delivery. Do not assume changing the canvas size produces an approved cut.

Add PCM audio to the ProRes master path when supported by the media build.
Record color-space and transfer metadata and keep SDR Rec.709 the initial
delivery target. Avoid HDR claims until the rendering, conversion, encoding
and display paths have been qualified together. Identify whether each preset
runs in the browser or on the server before starting it.

Acceptance: inspect encoded dimensions, frame rate, duration, codec, audio,
color tags and alpha, then compare decoded output with representative frames.

### A4 — Captions

Export SRT and WebVTT sidecars alongside the finished video. Offer versions with
and without burned-in captions. Preserve cue timing and language labels. State
which styling is lost in each sidecar format. Do not add translation as part of
this export work.

Acceptance: import sidecars into a target editor and player and compare text,
Unicode characters, line breaks and cue boundaries against the timeline.

### A5 — Audio stems

Export selected tracks or groups as WAV files for dialogue, music and effects.
Use one start time and duration for every stem, including leading silence, and
include a reference mix. Start with an explicit track-to-stem mapping rather
than guessing from names. Decide how shared effects, ducking, gain and muted
tracks apply, and report whether stems reproduce the mix when summed.

Acceptance: import stems into an audio editor at a common origin and verify
synchronization, channel layout, clipping and the documented mix behavior.
Loudness targets should be configurable delivery requirements, not one claimed
universal social-platform setting.

### A6 — Batch delivery and packages

Queue selected timelines or approved aspect-ratio variants with consistent
client, campaign, version and language names. Include a manifest, reference
video, captions, selected stems and project interchange files as requested.
Report each job's result and allow retrying a failed export without rerunning
successful ones.

Reuse the existing media packaging code. Address archive size limits explicitly
through streaming, Zip64 support or a folder-based alternative. Preserve the
NodeTool project as an optional archive, clearly separate from files another
editor can import. Record checksums and required external media.

Acceptance: move a package to another machine, verify its manifest and media,
and complete the documented import without access to the original workspace.

## Scope boundaries

Do not add native `.prproj`, `.drp` or Final Cut library writers. Start with
documented interchange formats. A Resolve handoff is a later compatibility
candidate using an existing XML path, subject to an actual import qualification.
It is not a separate exporter in this first plan.

Defer AAF, EDL, broadcast MXF, DCP, OpenEXR/DPX sequences and HDR delivery until
a concrete client workflow justifies their implementation and qualification.
Animated GIF/WebP can remain a separate conversion task. These additions would
not solve the primary agency need: reliable delivery and editable handoff.

## Execution and verification

Implement A1 and the basic A2 handoff first, followed by A3. Add A4 and A5 before
batching them in A6. Keep shared media collection and reporting in the existing
export services rather than introducing another project representation.

Use small fixtures covering cuts, gaps, overlapping clips, fractional frame
rates, still images, titles, transitions, missing media and separate audio.
Automate serialization and packaging checks, then qualify imports in the actual
target editors. Valid XML alone is not evidence of a working handoff. Record
editor versions and limitations before updating public compatibility claims.

No tests or assets were created or run for this planning document.
