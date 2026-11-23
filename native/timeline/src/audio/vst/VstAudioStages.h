#pragma once

// Real-time MixPlan stages for out-of-process VST3 instruments (priority -10)
// and VST3 audio effects (priority 50) over lock-free shared memory
// (VstLiveChannel / VstLivePool).
//
// Each VST instrument or effect becomes a BlockProcessor in the track or master
// chain, streaming live audio/MIDI blocks to NodeToolVstHost over shared memory
// with zero heap allocations and zero locks on the real-time audio callback.
//
// Thread affinity: stage callbacks run on the decode worker or offline render
// thread when building a MixPlan; the attached BlockProcessors run on the
// real-time audio callback (or offline render) thread.

#include "audio/Mixer.h"
#include "audio/vst/VstHostClient.h"
#include "audio/vst/VstLiveChannel.h"

#include <QJsonObject>
#include <QString>

#include <cstdint>
#include <limits>

#include <memory>
#include <span>
#include <vector>

namespace nt::audio::vst {

inline constexpr int kVstRenderSampleRate = 48000;

// Writes interleaved stereo float32 PCM as a standard 32-bit IEEE float WAV atomically (utility/tests).
[[nodiscard]] bool writeStereoFloatWav(const QString& path, int sampleRate, std::span<const float> interleavedStereo);

// One timed MIDI event of a track's playback stream. `status` is a MIDI status
// byte (note-off 0x8n, note-on 0x9n, poly pressure 0xAn, control change 0xBn,
// channel pressure 0xDn, pitch bend 0xEn) or vsthost::kShmStatusNoteExpression.
// `noteId` and `value` are set on notes and expression events only.
struct MidiStreamEvent {
    double timeMs = 0.0;
    std::uint8_t status = 0;
    std::uint8_t data1 = 0;
    std::uint8_t data2 = 0;
    std::int32_t noteId = vsthost::kShmNoNoteId;
    float value = 0.0f;
    bool clipEndReset = false;  // pitch bend or sustain reset at a clip end
};

// A controller lane of one clip, kept for the chase on a mid-clip start.
// Thread affinity: built on the plan-build thread, then read-only; chase reads
// it on the audio thread.
struct MidiChaseLane {
    struct Point {
        double timeMs = 0.0;
        int value = 0;
    };
    double clipStartMs = 0.0;
    double clipEndMs = 0.0;
    bool step = false;
    std::uint8_t statusKind = 0;  // 0xA0, 0xB0, 0xD0 or 0xE0
    std::uint8_t channel = 0;
    std::uint8_t data1 = 0;       // cc number or poly pressure pitch
    std::vector<Point> points;    // timeline ms, non-decreasing
};

// Everything one track plays: events sorted by time (at one time: note-offs,
// then controllers, then note-ons, then note expression) plus the lanes to chase.
struct MidiTrackStream {
    std::vector<MidiStreamEvent> events;
    std::vector<MidiChaseLane> chase;
};

// The playback stream of the midi clips of `trackId`. Rules: muted notes make no
// events; controller lanes emit each point and, for linear lanes, a ramp sample
// every 10 ms when the integer value changes; only events inside a clip's
// window are emitted; each pitch bend lane and each cc 64 lane resets to 0 at
// the window end; note expression is sampled the same way per note, with the
// noteId on the note-on.
[[nodiscard]] MidiTrackStream buildTrackMidiStream(const Timeline& timeline, const std::string& trackId, double bpm);

// Tracks where the next live block must start. A block that did not reach the
// plug-in (busy, timed out, disconnected) calls invalidate(), so the next block
// runs the reset and the controller chase again. Audio thread only, no allocation.
struct LiveBlockClock {
    double expectedNextMs = std::numeric_limits<double>::quiet_NaN();
    [[nodiscard]] bool isDiscontinuous(double blockStartMs) const noexcept;
    void advance(double blockEndMs) noexcept { expectedNextMs = blockEndMs; }
    void invalidate() noexcept { expectedNextMs = std::numeric_limits<double>::quiet_NaN(); }
};

struct LiveBlockMidi {
    std::size_t count = 0;  // events written to `out`
    int noteOns = 0;
    int noteOffs = 0;
};

// Collects the stream events of one live block into `out`. `cursor` is the index of the
// next unplayed event and is repositioned on a discontinuous block. On a discontinuous
// block the order is: note-offs and clip-end resets at the block start, the controller
// chase, then everything else. Real-time safe: no allocation.
[[nodiscard]] LiveBlockMidi assembleLiveBlockMidi(const MidiTrackStream& stream, std::size_t& cursor,
                                                  bool discontinuous, double blockStartMs, double blockEndMs,
                                                  double msPerFrame, int frames,
                                                  std::span<vsthost::ShmMidiEvent> out) noexcept;

// Writes the current value of every lane that `timeMs` is inside and after the
// first point of, as controller events at time `timeMs`. Returns the count
// written (at most `out.size()`). Real-time safe: no allocation.
[[nodiscard]] std::size_t chaseMidiEvents(const MidiTrackStream& stream, double timeMs,
                                          std::span<MidiStreamEvent> out) noexcept;

// Extracts MIDI note events falling inside [inPointMs, inPointMs + durationMs)
// matching packages/timeline/src/midi/{ticks,notes,events}.ts (MIDI_PPQ = 960).
// For patterns, document supplies tracks, key, chords and the tempo offset.
[[nodiscard]] std::vector<VstNoteEvent> extractMidiNoteEvents(const QJsonObject& clipRaw, double bpm,
                                                              double sampleRate, double inPointMs, double durationMs,
                                                              const QJsonObject& document = {});

// Attaches live shared-memory VST3 instrument BlockProcessors to MIDI tracks.
void runVstInstrumentsStage(const Timeline& timeline, MixPlan& plan, VstHostClient& client, VstLivePool& pool);

// Interleaves live shared-memory VST3 audio effect BlockProcessors into track and master chains.
void runVstEffectsStage(const Timeline& timeline, MixPlan& plan, VstHostClient& client, VstLivePool& pool);

// Registers both VST stages once using `client` (or sharedVstHostClient()).
void registerVstAudioStages(std::shared_ptr<VstHostClient> client = {});

}  // namespace nt::audio::vst
