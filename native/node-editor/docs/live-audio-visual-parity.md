# Live audio visualization parity

The implemented slice adds bounded waveform and frequency presentation to PCM
playback. This document defines the interfaces and acceptance criteria. It does
not claim physical speaker output or complete audio format parity.

## Inspected behavior

F1. [The web visualizer](../../../web/src/components/common/AudioVisualizer.tsx)
draws 64 bottom-aligned frequency bars with a horizontal multicolor gradient
and a white waveform above them. Its analyser uses a 1024-sample FFT, smoothing
0.7, 512 frequency bins, and every eighth frequency bin for the bars. Bar width
is 60% of its slot, minimum height is 2 logical pixels, and maximum height is
90% of the surface. The waveform uses 512 time samples, a baseline at 25% of
the height, an amplitude of 20%, and a 2-pixel stroke. Default height is 64.
Drawing follows requestAnimationFrame. The canvas has an image role and name.

F2. [The playback hook](../../../web/src/hooks/browser/useRealtimeAudioPlayback.ts)
connects the worklet or scheduled buffer sources through gain to both the
speaker and a MediaStream destination. That destination supplies the analyser.
Incoming chunks awaiting FIFO approval do not produce the visualized signal.
An analyser therefore describes routed playback, rather than every arrival.
Its output does not prove that a physical device emitted sound.

F3. [PcmStream](../src/media/PcmStream.h) currently exposes a level computed
while converting source samples, before successful sink writes. It can describe
unaccepted samples. Before this slice, [RichOutput](../qml/RichOutput.qml) showed
that numeric telemetry and controls. It now renders accepted-frame waveform and
frequency data beside the existing controls. [CanvasMedia](../qml/CanvasMedia.qml) already hosts RichOutput for
rich node output. The actual `nodetool.audio.realtime.AudioOutput` is designated
live by [EditorWindow](../src/ui/EditorWindow.cpp). Completed-file audio uses
[AudioWaveform](../src/media/AudioWaveform.h) and
[MediaPreview](../qml/MediaPreview.qml), with a decoder, envelope, and seek
position. That completed-file path remains separate.

## Decisions and interface

D1. `LiveAudioVisualizer` is a feature-local QQuickPaintedItem. Each existing
PcmStream owns bounded analysis state. The item uses the stable controller
already supplied as `pcmController`. Do not add sample arrays to rich rows,
output history, graph documents, QVariantList properties, or JSON. Do not add a
second audio sink, decoder, backend subscription, or PCM owner. Keep C++20,
QObject parent ownership, context-bound connections, and QPointer observation.

D2. PcmStream taps complete output frames successfully accepted by
`PcmSink::write` in `pump`, after rate/channel/sample-format conversion. Analysis
decodes the accepted device format into normalized mono floats, averaging
stereo. It retains at most one partial output frame across short writes, up to
32 bytes for the supported eight-channel float format. Publish nothing for zero writes, errors, queued arrivals,
conversion alone, or source frames trimmed as stale. Never reinterpret an
incomplete frame after reset or a device-format change. A frame accepted in
several writes enters analysis once, only after its last byte is accepted.

The snapshot represents recent sink-accepted playback, potentially ahead of
sound by the existing bounded hardware lead. It is not a speaker playhead or a
sample-accurate hardware clock. This definition is explicit and testable with
the existing injected sinks, without extending their interface. A future
visual based on hardware consumption would need a separately tested
consumption clock.

D3. PcmStream keeps a fixed 1024-float circular sample window, sequence number,
accepted output sample rate, and generation number. Samples enter once per
accepted frame. Analysis uses the newest window, left-padded with silence until
full. The snapshot has a fixed 512-bin spectrum and 512-point waveform. A
local radix-2 1024 FFT uses fixed scratch arrays, a Blackman window, and
magnitude-to-decibel mapping clamped to the Web Audio default range of -100 to
-30 dB. Magnitudes are normalized by 1024 and smoothed linearly with weight
0.7 before conversion to decibels. The trace uses the first 512 time samples
of that same chronological window. Deterministic tone fixtures cover the
normalization and frequency region. Browser analyser byte-for-byte equality is not an acceptance claim.
Bars sample bins 0, 8, ..., 504 to match the inspected web composition.

D4. The C++ value snapshot has fixed arrays, generation, sequence, and sample
rate. `const AudioVisualFrame &visualFrame() const` exposes the latest snapshot
with `visualFrameChanged()` at the presentation cadence. QML gets only the visual
item's typed `PcmStream *controller` property and appearance properties. No
invokable getter returns raw samples to JavaScript. Controller destruction or
replacement disconnects the item, clears its cached frame, and repaints once.

Analysis declarations live in `AudioVisualAnalysis.h` with definitions in
`PcmStream.cpp`, so standalone run tests retain their Core/Multimedia boundary.
The controller and item connections run on the GUI thread. The item copies a
complete frame during the GUI-side signal callback. `paint()` reads only that
item-owned cache and appearance values. It must not access PcmStream, schedule
audio, emit signals, or change a QObject during scene-graph painting. Follow
[Qt's paint-thread restrictions](https://doc.qt.io/qt-6/qquickpainteditem.html#paint).

D5. Visible visual items register/unregister an observation with their
controller. One controller presentation timer runs only while it has observers
and is queue-active. Use a 33 ms interval and compute at most one FFT per tick,
shared by run output and canvas views. Coalesce arrival bursts by sequence.
Hidden or window-inactive views unregister. Stop, fatal error, reset, restart,
replacement, cancellation, and scope teardown clear the ring and smoothing,
increment generation, and send one empty frame immediately. Queued and stopped
streams show silence. After accepted writes stop, replace stale samples with
silence after the last accepted block's duration plus the configured lead
bound. One precise single-shot timer invalidates stale static frames, without
an animation loop. Clearing stale visual history preserves a partial accepted
frame. Done continues normal visualization while the sink drains, then clears. No synthetic motion runs
without accepted signal.

[QTimer](https://doc.qt.io/qt-6/qtimer.html#accuracy-and-timer-resolution) can fire
late and coalesces missed timeouts. Cadence is a maximum work rate, not a timing
guarantee. Never perform catch-up FFT loops after a stalled GUI.

D6. Analysis storage, including FFT/window/smoothing scratch and published
frame, must stay below 64 KiB per controller, independent of stream duration.
Each visual item stores one frame below 8 KiB. Ingestion is O(accepted frames),
analysis O(1024 log 1024), and drawing O(64 + 512). No FFT or allocations occur
inside the sample loop. No per-chunk queued signal carries samples. Record
analysis call counts and elapsed CPU under the native harness before claiming
performance. A duplicated canvas/run view must not double FFT work.

## Presentation contract

D7. Start/Stop, Restart, and the existing state label remain. Actual bars and
a trace replace the numeric level caption. Buffered/drop counters remain
available to diagnostics, not the normal media presentation. The visual fills
available width, has a preferred height of 64 scaled logical pixels, clips to
its bounds, and never changes node width or scroll position on each frame.
Qt applies device pixel ratio. Do not multiply layout sizes by DPR.

Existing native Theme and Metrics properties pass from QML: primary/secondary
accent, warning, success, info, primary text, stroke, and UI scale.
Build the horizontal gradient from those existing palette roles, maintaining
the web's colored bar composition in both schemes. Use primary text at 60%
opacity for the trace. The native host supplies the background surface.
Keep the bar geometry above, scaled through the feature's appearance inputs.
Do not copy web hex colors into C++, edit shared primitives, introduce blur
or offscreen effects, or use a waveform-shaped static placeholder as signal.
The flat native rendering intentionally omits the web shadow glow.

D8. Expose an image accessible role and name `Streaming audio visualization`.
The sibling state label conveys Playing, Waiting, Queued, Stopped, and errors
without color. The image is not a focus stop or a live region. Keyboard focus
and button names stay with the controls. Theme.reducedMotion displays a static
signal frame refreshed only on state transitions, without a recurring visual
timer or animated smoothing. Playback continues. Returning to full motion resumes the
latest bounded signal window. Hidden and inactive windows do no visual work.

## File ownership

| Owner | Files and purpose |
| --- | --- |
| PCM/visual implementation | `src/media/PcmStream.h/.cpp`: accepted-frame tap, fixed analysis state, shared snapshot cadence, reset behavior |
| PCM/visual implementation | New `src/media/AudioVisualAnalysis.h` and `src/media/LiveAudioVisualizer.h/.cpp`: fixed-array analysis interface and painted item, following AudioWaveform's local paint pattern |
| PCM/visual implementation | `src/media/VideoFrameView.cpp`: add the item to existing media type registration |
| PCM/visual implementation | `qml/RichOutput.qml`: import existing media module, bind visual controller and native appearance, retain controls/state |
| Build integration | `CMakeLists.txt`: production and native test source wiring |
| PCM/visual implementation | `tests/media/LiveAudioVisualizerTest.cpp`: sample acceptance, analysis, cadence, stale invalidation, and framebuffer behavior |
| Existing host coverage | `tests/ui/RichOutputHostTest.cpp` and canvas-host fixtures: retained controls and completed media behavior |

RunOutputModel's controller key and QObject lifetime contract stay unchanged.
CanvasMedia renders RichOutput using the same retained controller as run
output. The actual AudioOutput canvas needs no separate visualization owner.
No shared primitive, completed waveform, media resolver, web, npm, or backend
change belongs to this slice. No new dependency or build directory is needed.

## Native acceptance

A1. Fake-stream tests exercise the accepted-frame boundary. Feed silence, a
bin-aligned sine, a second tone, and stereo opposite-phase samples. Assert a
flat silence trace, changing signed waveform, expected dominant frequency
region, and cancellation on mono downmix. Test float, PCM16, and converted
output formats. Verify a short write cutting through a frame, a zero write,
an error, and retry do not publish unaccepted or duplicate frames.

A2. Queue two controllers. Only accepted frames from the active controller may
animate. Cover live stale dropping, starvation, valid done drain, Stop,
Restart, replacement with completed media, scope change, deletion, and GUI
stall. Verify immediate stale-frame invalidation and no use after destruction.
Long fake streams must keep fixed storage and bounded analysis calls. Two
observers must receive the same generation/sequence with one FFT per tick.

A3. Through the actual RichOutput host and actual AudioOutput canvas, capture
native rendered frames for silence and two changing tones. Assert nonempty
bar and trace pixels in their expected regions, changing geometry across
signals, valid light/dark contrast, and no clipped controls. Capture 1280×720
and 960×1000, UI/text scaling, high DPR, and reduced motion. Exercise native
mouse and keyboard Start/Stop/Restart with incoming sibling outputs. Numeric
state assertions alone cannot satisfy visual acceptance.

A4. Run focused native PCM, analysis, rich-output, canvas capture, and relevant
native media suites in the parent's existing build, then the agreed complete
native and sanitizer gates. Record commands, exit status, render artifacts,
and bounded-work measurements. Completed-file waveform seek/zoom/player
retention tests must still pass. Fake streams and render captures prove the
visual and routing boundaries. They do not establish physical speaker output.
