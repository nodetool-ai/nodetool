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

#include <atomic>
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

// Real-time dry-path PDC ring buffer for parallel VST effects and latency-aligned
// disconnect/timeout passthrough.
// Thread affinity: prepare() and serviceOverflow() run on the control/worker thread;
// reset() and process() run on the audio render thread with zero allocations and zero locks.
class VstDryDelayLine final {
public:
    static constexpr int kCrossfadeFrames = 64;
    // Headroom for runtime plug-in latency jumps from initial 0 (e.g. 65536-262144 sample
    // linear-phase / convolution plug-ins) without allocating on the real-time audio thread.
    static constexpr std::size_t kMinRuntimeDelayFrames = 262144;

    VstDryDelayLine() = default;
    ~VstDryDelayLine();
    VstDryDelayLine(const VstDryDelayLine&) = delete;
    VstDryDelayLine& operator=(const VstDryDelayLine&) = delete;

    // Control thread: sizes ring buffer to at least
    // max(kMinRuntimeDelayFrames, ceil(2 s at sampleRate), initialLatency) + kMixBlockFrames + 1.
    void prepare(double sampleRate, int initialLatency);

    // Control/worker thread: reclaims any retired ring and, if `overflowDelay()` exceeds the
    // prepared capacity, allocates a larger ring off the audio thread and publishes it for O(1)
    // lock-free adoption on the next audio block. Returns true if a new ring was published.
    bool serviceOverflow();

    // Audio thread (O(1), no buffer fill): invalidates buffered frames on discontinuity/idle.
    void reset() noexcept;

    // Audio thread (O(frames), no allocation, no locks): adopts any pending grown ring in O(1),
    // records `inStereo` into the ring buffer even at zero latency, and writes latency-compensated
    // dry audio to `outStereo`, crossfading smoothly if `targetDelay` changes continuously.
    // If `targetDelay` exceeds `maxDelay()`, does NOT clamp to a misaligned delay: records
    // `overflowDelay()`, zeroes `outStereo`, and returns false.
    bool process(std::span<const float> inStereo, std::span<float> outStereo,
                 int targetDelay, bool discontinuous) noexcept;

    [[nodiscard]] std::size_t capacity() const noexcept { return m_activeCap.load(std::memory_order_acquire); }
    [[nodiscard]] std::size_t maxDelay() const noexcept {
        const std::size_t cap = m_activeCap.load(std::memory_order_acquire);
        return cap > 0 ? cap - 1 : 0;
    }
    [[nodiscard]] std::size_t validFrames() const noexcept { return m_validFrames; }
    [[nodiscard]] std::size_t overflowDelay() const noexcept {
        return m_overflowDelay.load(std::memory_order_acquire);
    }

private:
    struct Ring {
        std::vector<float> buffer;
        std::size_t cap = 0;
    };

    void adoptPendingRing(std::size_t requested) noexcept;
    void readDelayed(std::size_t delayFrames, float& outL, float& outR) const noexcept;

    // Owned by VstDryDelayLine. Active ring is touched on audio thread during process();
    // on swap, its pointer moves to m_retiredRing (never freed on the audio thread).
    std::unique_ptr<Ring> m_ring;
    // Lock-free handoff slots owned by VstDryDelayLine, freed only on control/worker thread
    // or in ~VstDryDelayLine().
    std::atomic<Ring*> m_pendingRing{nullptr};
    std::atomic<Ring*> m_retiredRing{nullptr};
    std::size_t m_cap = 0;
    std::atomic<std::size_t> m_activeCap{0};
    std::size_t m_preparedMaxDelay = 0;  // control/worker thread only
    std::size_t m_writePos = 0;
    std::size_t m_validFrames = 0;
    std::size_t m_activeDelay = 0;
    std::size_t m_fadeFromDelay = 0;
    int m_fadePos = 0;
    int m_fadeLen = 0;
    std::atomic<std::size_t> m_overflowDelay{0};
};

// Attaches live shared-memory VST3 instrument BlockProcessors to MIDI tracks.
void runVstInstrumentsStage(const Timeline& timeline, MixPlan& plan, VstHostClient& client, VstLivePool& pool);

// Interleaves live shared-memory VST3 audio effect BlockProcessors into track and master chains.
void runVstEffectsStage(const Timeline& timeline, MixPlan& plan, VstHostClient& client, VstLivePool& pool);

// Registers both VST stages once using `client` (or sharedVstHostClient()).
void registerVstAudioStages(std::shared_ptr<VstHostClient> client = {});

}  // namespace nt::audio::vst
