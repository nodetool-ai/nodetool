# Compressed realtime audio parity proposal

Design only. The [PCM implementation](streaming-audio-parity.md) remains frozen
for its combined native and sanitizer checkpoint. No decoder implementation,
dependency installation, CMake change or build is authorized by this document.

## Evidence and decision

F1. [ElevenLabs realtime TTS](../../../packages/elevenlabs-nodes/src/nodes/realtime-tts.ts)
defaults to `mp3_44100_128`. It forwards base64 provider bytes unchanged with
`encoding: "mp3"`, `sample_rate: 44100`, `channels: 1` and the requested format.
Its offered Opus formats similarly emit `encoding: "opus"`. Chunk boundaries
are provider message boundaries, with no container or packet-boundary field.
Empty final chunks carry done. A decoder must preserve state across messages.
Metadata does not prove that Opus messages contain complete raw packets or an
Ogg stream. The provider's [WebSocket documentation](https://elevenlabs.io/docs/api-reference/text-to-speech/v-1-text-to-speech-voice-id-stream-input)
describes base64 audio messages but does not settle that framing contract.

F2. Native currently rejects compressed encodings visibly. The web hook's
non-f32 path interpreting bytes as PCM16 cannot establish compressed support.
Native acceptance requires real decoded samples delivered before input done.
A completed-file fallback remains completed-file playback.

F3. Public [Qt 6.12 QAudioDecoder](https://doc.qt.io/qt-6/qaudiodecoder.html)
supports `setSourceDevice`, `bufferReady`, `read`, `finished` and `formatChanged`.
It is technology preview and describes decoding media files. Its public
contract does not establish recovery after temporary sequential-input
starvation, bounded internal buffering, or stop/resume at the current position.
Its documented stop/start behavior resumes from the beginning. Repeatedly
replacing a growing QBuffer discards decoder state and is unsuitable.
[QIODevice](https://doc.qt.io/qt-6/qiodevice.html) provides sequential devices and
readiness signals, but those alone do not prove a backend consumes incremental
compressed input correctly. No private Qt backend APIs are proposed.

F4. Node editor links Qt Multimedia, not direct FFmpeg. Timeline already links
libavformat, libavcodec, libavutil and libswresample through pkg-config.
[AudioSource](../../timeline/src/audio/AudioSource.h) opens and seeks files and
has whole-file operations. It is not a ready incremental transport decoder.
Its ownership patterns are useful, but importing the timeline UI is unnecessary.
Qt's bundled FFmpeg implementation does not imply a supported application
link interface to those libraries.

D1. First approve a small, native-only public-Qt prototype against a fake
sequential QIODevice. It must prove early output, starvation recovery,
terminal flush, cancellation and bounds on each shipping backend. Failure
rejects that backend path before production integration. Current evidence
does not justify promising that Qt passes this gate.

| Option | Incremental contract | Packaging impact | Decision |
| --- | --- | --- | --- |
| Public QAudioDecoder | Must demonstrate starvation recovery and bounded buffering | Existing Qt Multimedia deployment, platform/backend variation remains | Prototype first |
| Direct FFmpeg | Public parser and send/receive decode APIs, demuxing needed for containers | Add explicit development/runtime libraries on Linux, macOS and Windows, codec configuration and redistribution review | Preferred fallback for MP3 plus containerized Opus |
| mpg123 plus libopus and Ogg demux | mpg123 has feed mode, libopus requires packet boundaries | Multiple dependencies and custom/container parser surface, independent platform packaging | Consider only if direct FFmpeg packaging is rejected |

The [mpg123 feed API](https://www.mpg123.de/api/group__mpg123__input.shtml)
explicitly accepts input buffers. [libopus](https://opus-codec.org/docs/opus_api-1.5/group__opus__decoder.html)
decodes packets, not an arbitrary concatenation of transport chunks.
[FFmpeg's public codec API](https://ffmpeg.org/doxygen/trunk/avcodec_8h.html)
provides parsing and send/receive decoding. A direct implementation must prove
its incremental demux behavior too. For blocking custom AVIO, use a dedicated
worker with a bounded input ring, condition wakeups and cancellation, rather
than returning a temporary EOF. Restrict accepted formats to MP3 and verified
Opus containers, disable network protocols and impose probe limits.

## Proposed interfaces and budgets

D2. Add an independently testable `CompressedAudioDecoder` interface with
`begin(scope, generation, encoding)`, `push(bytes)`, `finishInput()` and
`cancel()`. Results distinguish `NeedInput`, `PcmReady`, `Finished` and
`Error`. `push` reports accepted bytes or a terminal pressure error, never
silently drops encoded fragments. `PcmBlock` owns finite interleaved float32
samples, actual rate, channel count and generation. Deliver blocks through a
bounded pull interface or bounded worker mailbox, never one queued Qt signal
with a copied payload per provider message.

D3. Add a validated decoded-block ingress to the existing PCM controller after
the freeze is lifted. Reuse its converter, sink, FIFO arbitration, controls and
scope identity. Do not base64 encode decoded PCM and reparse JSON. Compressed
decode has no independent playback sink, speaker output or FIFO owner. A public
QMediaPlayer with audioOutput unset may serve internally as a decode backend,
feeding QAudioBufferOutput samples into the existing PCM path. Actual decoder format
establishes playback format. Reject unsupported channels, invalid rates,
metadata conflicts and later rate/channel changes with an actionable error.
Reject concatenated/chained streams until an explicit tested policy exists.

D4. Initial proposed bounds, to tune from prototype measurements: 256 KiB per
decoded wire payload before allocation, 512 KiB pending encoded bytes, 64 KiB
header/probe scan, 2 seconds of media-time encoded backlog once timestamps or
frame duration are known, and one at-most-120 ms decoded block in flight.
Count decoder pending output and mailbox PCM in the existing combined lead
budget, not just the source ring. Split decoded blocks into the remaining
whole-frame budget. Decode while stopped/queued only within these same bounds.
Cap work per dispatch at 32 frames or 2 ms, then yield. These are proposed
acceptance budgets, not measured performance. Inspect backend-owned memory
separately before accepting a Qt path.

D5. Compressed input cannot use PCM's arbitrary oldest-byte discard policy:
MP3 reservoirs and Opus/container state depend on prior bytes. Decode valid
frames sequentially and discard old decoded PCM for live monitoring. If decode
cannot keep up within the encoded cap, fail visibly and release the audio slot.
Do not accumulate unbounded input or drop random compressed bytes to catch up.
Once frames are available, use the existing 100 ms default lead and at most
40 ms prime. Report provider/probe/codec latency separately. A small hardware
lead does not prove bounded end-to-end latency.

## Lifecycle

D6. Every asynchronous decode completion carries the complete session/run/node/
output generation. Validate it before PCM ingress. Replacement, reset, account
change and run cancellation invalidate the generation, cancel workers, clear
encoded/decoded mailboxes and release only the appropriate queue entries.
Successful run completion finishes input and drains, rather than canceling.
Outer or inner done closes input once. Flush delayed decoder samples, then
finish PCM only when no decoder or mailbox output remains. Queue promotion
waits for hardware drain. Input starvation before done retains the slot.

D7. Stop immediately silences/reset hardware and removes queue membership.
It preserves explicit stopped intent across later data. Bounded decoding may
continue so live Start can resume at current data without losing codec state.
Live Start discards stale decoded samples. Restart uses the existing delayed
FIFO behavior and generation guard. Generic replay stores decoded PCM under
the existing 4 MiB retention policy, with truncation feedback. It does not retain
an unlimited second compressed archive. Decoder fatal errors cancel/dequeue,
show the cause and reject later bytes in that generation. Start cannot repair
discarded headers after such an error. Require a new output generation, or
offer replay only when retained valid PCM permits it.

## Verification and bounded implementation path

A1. After approval and release of the freeze, create deterministic MP3 and
verified Opus fixtures using in-process libav encoders or
[`runtime/media/testing`](../../../packages/runtime/src/media/testing.ts).
Generation is separate from native test execution. Commit small fixtures with
codec/container/rate/channel/duration and expected tone measurements. Native
tests must run without npm, provider access, audio devices or ffmpeg CLI.
Existing timeline CLI-generated fixture patterns are not a precedent for this
work. Compare lossy output by frame duration, RMS, frequency and tolerance,
not sample equality against an uncompressed original.

A2. Prototype the decoder alone. Split input at every byte of representative
headers and frame boundaries, then deterministic random partitions. Feed an
initial complete-frame prefix while withholding done and all later bytes.
Require PCM output during that pause. Resume after multiple empty periods and
require continuous output. One input message need not produce a frame.
Test empty input, ID3/header bounds, malformed base64, truncated final headers/
frames, corrupt frame bodies and unsupported containers. Specify whether any
valid prefix plays before a terminal corruption error. Never report truncated
input as a clean finished stream.

A3. Integrate via fake PcmSink and existing RunOutputModel/UI tests. Exercise
long input beyond the replay cap, producer pressure, queued/stopped streams,
short/zero writes, done flush before promotion, mono/stereo and rate changes,
replacement while decoding, delayed stale completions, device failure and
controller/window destruction. Require no stale samples after Stop/reset,
bounded memory and work, finite audio and no queue blockage. Deliberately
mutate early-output gating, generation checks, encoded cap and final flush to
prove the checks fail. A test that receives sound only after done must fail.

A4. Parent registers targets/dependencies and runs the combined native and
sanitizer checkpoint after source ownership is released. Verify packaged
Linux, macOS and Windows decoder availability and fixture playback separately.
Physical audition, device loss and measured first-audio latency remain a
separate report from device-free test results. No implementation or parity
completion is claimed by this proposal.

R1. Opus framing remains unverified. Obtain an authorized sanitized provider
byte fixture or an authoritative framing contract before implementing Opus.
Sniffing a bounded Ogg header may select a supported container but cannot
manufacture packet boundaries for raw Opus. An unavailable fixture blocks an
Opus parity claim, not MP3 prototype progress.

R2. Public Qt decoder buffering may exceed application limits or treat
temporary starvation as completion. The prototype must reject this path if
either cannot be bounded through public APIs. A working local backend alone
does not establish cross-platform support.

R3. Adding direct codec libraries changes native packaging. Parent approval
must select dependencies, supported codec configuration and platform delivery
before any CMake or install work. This document requests a prototype decision,
not permission to modify the frozen PCM implementation.

## Public Qt capability probe

F5. The parent approved a cache-only probe after this proposal. Source, tiny
CMake target, generated fixtures, commands and logs are kept outside the
repository in a local build cache. Shipping measurements use the Qt 6.12.0
`gcc_64` installation, with runtime library/plugin paths
verified and FFmpeg 9.0.1 LGPL reported by Qt. Earlier system-Qt exploratory
logs use FFmpeg n9.0.2 and are excluded from shipping conclusions.

F6. In-process `runtime/media/testing` generated four-second 48 kHz mono MP3
and Ogg Opus tones. The Ogg prefix includes complete header pages and the first
audio page. The MP3 prefix contains 42 complete frames. Complete sequential
controls decode both formats. A nonblocking sequential device returning zero
at temporary starvation emits genuine Float PCM within 3–4 ms through
QAudioDecoder, but then finishes early. After feeding resumes, neither decoder
nor low-latency QMediaPlayer consumes the remaining suffix. The
[Qt 6.12 IO adapter](https://raw.githubusercontent.com/qt/qtmultimedia/6.12/src/plugins/multimedia/ffmpeg/qffmpegioutils.cpp)
directly forwards QIODevice reads. This is supporting source evidence for the
observed failure, not an application dependency on private APIs.

F7. QAudioDecoder performs initial reads on the GUI thread, so blocking that
device would block GUI-driven input delivery. QMediaPlayer performs measured
reads on worker threads. A bounded mutex/condition input adapter for the latter
waits for bytes or true done/cancel and wakes before Stop. It consumes all
resumed bytes, matching complete-player control totals: 180864 MP3 frames and
191040 Opus frames. GUI heartbeat intervals remain at most 11 ms in those
cases. Cancellation before done wakes the read, Stop returns, and a further
250 ms observation receives no PCM. Delayed-header input also recovers.

F8. Public [QAudioBufferOutput](https://doc.qt.io/qt-6/qaudiobufferoutput.html)
is restricted to Qt's FFmpeg backend. With public LowLatencyStreaming intent
and 4096-byte probe size, the player delivers first PCM after 245 ms for MP3
and 23 ms for Opus. Warm restart gives 242 ms and 21 ms respectively. These
timings start at source selection, excluding object/plugin construction.
Player controls deliver fewer frames than QAudioDecoder controls, so successful
starvation recovery alone does not establish full playback parity. Public
[playback options](https://doc.qt.io/qt-6/qplaybackoptions.html) are hints and
explicitly allow lost frames in low-latency mode.

R4. These measurements establish a working blocking-input adaptation for the
tested player backend, not a production decoder selection. MP3 exceeds the
proposed latency budget with LowLatencyStreaming. Backend-internal queue sizes remain unmeasured through
public APIs. Current provider Opus framing remains unknown. Full parity,
cross-platform support, bounded combined lead and production cleanup still
require separate evidence. The frozen PCM implementation remains untouched.

D8. A narrow follow-up removed LowLatencyStreaming, retaining default Playback
intent and 4096-byte probe size. The bounded blocking player then delivers
first PCM in 2–4 ms while surviving starvation. Its delivered
totals match complete sequential decoder controls, 192431 MP3 frames and
192000 Ogg Opus frames, and it consumes all resumed input. The heartbeat remains
at most 11 ms in those streaming runs. Prefer this public-Qt candidate for the
next capability comparison over introducing codec dependencies now. It is not
accepted for production. Its backend-internal queue bounds, platform coverage
and provider framing still need evidence.
The low-latency hint's name alone is not a reason to select it.

F9. Final default-intent confirmation receives finite, nonzero float samples
throughout both streams and consumes the complete encoded input. Separate
cancel-prefix checks wake pending IO before Stop and observe no later PCM over
250 ms. All four processes exit zero under external timeouts. Exit zero records
completed measurements, not full parity acceptance. The cache report preserves
exact commands, frame totals, timing, sample RMS and measurement limits.

F10. Final-default delayed headers, warm restart and cancellation also complete
under external timeouts. Warm first PCM is 1 ms for both formats. Delayed-input
timings include header/page accumulation and the deliberate 900 ms input gap.
The 20-second realtime and four-times-realtime load cases complete their
measurement processes with responsive GUI heartbeats and no post-Stop samples.
An application mailbox caps unread PCM at 4800 mono frames. Its direct output
callback runs on a renderer worker, so data and counters require synchronized
access. No per-buffer queued application task is needed. ThreadSanitizer was
not run.

F11. A four-second consumer stall does not itself slow QAudioBufferOutput.
Without public pause, the bounded mailbox discards about 188000 decoded frames.
With high/low-watermark pause and resume, it retains at most 4512 frames in the
measured cases, discards none and stops further encoded reads while paused.
Source queues peak below 270000 bytes, and process RSS rises about 4.5–7 MiB.
These observed maxima are not public backend guarantees.

R5. Before controlled pause at about two seconds of MP3 delivery, Qt has already
read about 6.6 seconds of that constant-bitrate fixture. The difference includes
IO, demux and decoder state, not a measured PCM backlog. It still exceeds the
initial two-second compressed proposal. That number was a tunable design
proposal, not a user requirement. Public player buffering does not enforce
that cap. Production selection still needs an explicit buffering contract,
rather than rejection based solely on the proposed number.

A5. Compare a worker-owned QAudioDecoder next. Construct, configure, read, stop
and destroy the decoder and source on one QThread. Feed the source through a
mutex/condition adapter, wake cancellation before queued Stop, and reserve
bounded output credits before read. Initial synchronous reads then block that
worker rather than GUI. General [Qt thread ownership rules](https://doc.qt.io/qt-6/threads-qobject.html)
support this ownership pattern, but the specific decoder adaptation still
needs measured thread IDs, heartbeat, cancellation and queue bounds. Prepared
cache-only source must be measured before selection. Coordinate each test
window with the visual owner. No production integration is authorized.

F12. The short worker-owned decoder probe now completes six shipping-backend
processes with exit zero. Decoder/source construction, initial read, buffer
callback and Stop run on the dedicated worker. Later IO also uses an internal
backend worker. GUI heartbeat remains at most 13 ms. Both formats produce PCM
before done and recover from input starvation with exact complete-control
totals. Header-wait cancellation wakes the initial blocking read before queued
Stop, then the thread finishes in the same logged millisecond.

F13. Worker output read/ack limits the application handoff to 4800 mono frames
and leaves the next available decoder block unread when credits run out. At
most one acknowledgement event is queued. MP3's complete control starts in
3 ms, but its starvation case waits 334 ms while default probing needs more
than the initial complete-frame prefix. Opus starts in 2 ms in that case.
These are distinct startup conditions.

R6. The worker decoder still reads the entire four-second MP3 fixture before
done, while bounded PCM delivery started about 1.4 seconds earlier. Exact
timestamped source/output snapshots are still needed to quantify backend
read-ahead. Worker ownership and bounded application output do not establish
the compressed two-second or combined lead caps. Keep this adaptation
unaccepted for production pending that narrow comparison.

## Buffering contract and interface decision

F14. Public QAudioDecoder exposes availability and a nonblocking read, but no
total backend byte, duration or frame limit. Tagged Qt 6.12.0 source explains
the observed behavior. Its [demux thresholds](https://github.com/qt/qtmultimedia/blob/v6.12.0/src/plugins/multimedia/ffmpeg/playbackengine/qffmpegdemuxer.cpp#L15)
are four seconds or 32 MiB. The [limit check](https://github.com/qt/qtmultimedia/blob/v6.12.0/src/plugins/multimedia/ffmpeg/playbackengine/qffmpegdemuxer.cpp#L313)
runs after packet accounting. Its [audio decoder scheduling threshold](https://github.com/qt/qtmultimedia/blob/v6.12.0/src/plugins/multimedia/ffmpeg/playbackengine/qffmpegstreamdecoder.cpp#L99)
is nine pending frames, with a packet potentially yielding multiple frames.
The [QAudioDecoder wrapper](https://github.com/qt/qtmultimedia/blob/v6.12.0/src/plugins/multimedia/ffmpeg/qffmpegaudiodecoder.cpp#L197)
holds one available buffer and advances on read. These are implementation
evidence for that tag, not public guarantees or hard total-process limits.
Probing, IO buffers, codec state and allocation overshoot remain separate.
Production must not call these private classes or change their constants.

D9. Record three different budgets. Transport storage is the application-owned
compressed byte queue. Prefetch is compressed/container data already read by
the backend. Playback lead is decoded audio admitted to the PCM converter and
hardware. Several seconds of compressed prefetch do not by themselves add that
many seconds of audible delay or prove unbounded RAM. Conversely, a 512 KiB
source queue does not cap the backend, and a 100 ms PCM handoff does not prove a
100 ms total decoder pipeline. Report each observed quantity separately.

O1. Prefer the worker-owned public decoder for the next narrow comparison. It
adds no packaging dependency and permits output reads to follow application
credits rather than a player clock. Use fixed byte/block caps for queues the
application owns, and label backend prefetch as implementation-dependent.
The next stalled-credit snapshots and longer pressure case must establish
actual maxima, cancellation and recovery before choosing initial budgets.
Revising the tentative two-second prefetch target is a valid decision if live
latency, retained replay and measured memory remain acceptable.

O2. A stricter source read-credit ledger is possible for a deliberately narrow
MP3 format after validating actual frame headers. Count released frame
durations and acknowledge decoded source frames. Do not derive duration from
the requested provider bitrate or an average byte rate. A bounded startup
allowance must permit probing. A decoder that needs more initial input than
that allowance must fail visibly rather than wait forever for impossible
output credits. This adds MPEG framing, metadata limits and new failure cases.
It is not the smallest default implementation and does not extend to unknown
Opus framing by assumption.

O3. Direct public FFmpeg APIs give explicit packet and output ownership if Qt
cannot meet the chosen bounds. A narrow MP3 parser/decoder path can avoid
libavformat's general-purpose prefetch. Opus still needs verified packet or
container framing. This option adds cross-platform headers, runtime libraries,
codec configuration, redistribution review and ownership code. It does not
magically cap codec allocations. Validate packet sizes, formats and decoder
state, and bound application queues and probing explicitly.

D10. Keep one backend-neutral session boundary: begin with scope/generation and
codec, push owned compressed bytes, finish input, cancel, and take a bounded
decoded block. Taking a block returns output credits. Carry generation, actual
format and source-frame position with each block. Coalesce availability into
at most one pending control notification. Do not transport every PCM block as
a queued Qt signal. The controller validates generation again before PCM
commit and keeps the existing sink, converter and FIFO as the sole playback
owners. Cancel closes/wakes input before owner-thread Stop and keeps worker
state alive until cleanup completes.

D11. Replay may stop reading when retained PCM or handoff credits are full,
within the existing explicit retention policy. Live mode must instead decode
sequentially and discard stale whole decoded frames under its bounded lead
policy. Holding live decoder credits for seconds would preserve old audio and
defeat catch-up. Never drop arbitrary compressed bytes. Bound decode work per
dispatch, reject input overflow visibly, and preserve explicit Stop intent
while bounded decode continues. The next live catch-up probe must demonstrate
that the worker can drain a burst without a player-clock delay.

R7. Aggregate memory and decoder admission also need a finite policy. A bounded
queue per stream does not establish acceptable memory across every retained
controller. Choose the permitted concurrent decoder count from measurements
and preserve visible capacity feedback. No strict backend RAM guarantee,
cross-platform parity or production implementation is claimed here.
