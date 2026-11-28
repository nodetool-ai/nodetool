// Derived from georgi/fablesynth (https://github.com/georgi/fablesynth) at
// commit ae9fca7 (juce/source/drum/dsp/{DrumEngine,DrumKits,OneShotSamples.gen.*,KitLevels.gen.h,DrumParams}).
// FableSynth is published under PolyForm Noncommercial 1.0.0. Its author, who
// also maintains NodeTool, contributes this code to NodeTool under NodeTool's
// licence (AGPL-3.0).
#pragma once

#include "audio/FadeCurves.h"
#include "audio/Mixer.h"
#include "audio/ParameterSmoother.h"
#include "midi/DrumSamplerSamples.h"
#include "model/TimelineTypes.h"

#include <QJsonObject>

#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <span>
#include <string_view>
#include <vector>

namespace nt::midi {

// Minimal real-time one-shot drum sampler for the timeline, derived from
// FableSynth DR-1 (one-shot sample playback, per-pad level/pan/tune/AHD
// envelope, choke groups, click-free voice stealing, sample-accurate triggers).
//
// Ownership: owned by value inside DrumSamplerProcessor (or a test caller).
// Resampled per-pad float buffers and octave mipmaps are owned by value in
// `pads_` and allocated exclusively in `prepare()` / `setCustomSample()` off
// the audio thread. Active voices live in a fixed inline `std::array` (zero
// heap allocation).
//
// Thread affinity: `loadKit()`, `setCustomSample()`, `prepare()`, and
// `setNoteMap*()` / `clearNoteMap()` run on the control / plan-build thread
// before audio publication. After publication, `reset()`, `trigger*()`,
// `renderBlock()`, `renderFrames()`, and `setPadParams()` / `setMasterGain()` /
// `setVoiceLimit()` run on the audio render thread (serialized by
// MixRenderLease) with zero allocations, zero locks, and zero syscalls.
// `activeVoiceCountAtomic()` is safe to read from any thread for metering.
class DrumSampler {
public:
    static constexpr int kNumPads = kDrumPadCount;
    static constexpr int kMaxVoices = 64;
    static constexpr int kMipLevels = 5;  // 1x, 2x, 4x, 8x, 16x (+0..+48 st)
    static constexpr int kPlaySincZeroCrossings = 8;
    static constexpr int kPlaySincLutSize = 1024;  // exact multiple of kPlaySincZeroCrossings
    // FableSynth DR-1 choke fade constants: 0.3 ms time constant with 0.3 ms
    // declick slew (~3.7 ms to -80 dB at any sample rate).
    static constexpr double kChokeTauSec = 0.0003;
    static constexpr double kChokeSlewSec = 0.0003;
    // Numeric safety ceilings for audio gain, envelopes, and sample rates.
    static constexpr float kMaxLinearGain = 256.0f;     // ~+48.16 dB ceiling
    static constexpr double kMaxGainDb = 48.0;
    static constexpr float kMaxAttackHoldSec = 30.0f;
    static constexpr float kMinDecaySec = 0.001f;
    static constexpr float kMaxDecaySec = 60.0f;
    static constexpr double kMinSampleRate = 1000.0;
    static constexpr double kMaxSampleRate = 768000.0;
    static constexpr std::size_t kMaxResampledFrames = 16U * 1024U * 1024U;

    struct PadParams {
        float level = 0.8f;           // 0..1.2 pad mix level (squared taper)
        float sampleLevel = 0.9f;     // 0..1.2 sample gain trim (squared taper)
        float zoneGain = 1.0f;        // 0..256 linear zone gain trim
        float pan = 0.0f;             // -1 (left) .. +1 (right)
        float tuneSemitones = 0.0f;   // -48 .. +48 semitones
        float attackSec = 0.0f;       // 0..30 s (0 preserves exact frame-0 transient)
        float holdSec = 0.01f;        // 0..30 s
        float decaySec = 0.5f;        // 0.001..60 s
        float decayCurve = 0.35f;     // 0 = linear, 1 = normalized exponential
        float velocityToLevel = 1.0f; // 0 = fixed, 1 = full linear velocity scaling
        int chokeGroup = 0;           // 0 = none, 1..4 = choke group
    };

    struct ClipFade {
        bool active = false;
        double startMsIntoClip = 0.0;
        double clipDurationMs = 0.0;
        audio::ResolvedFades fades{};
    };

    struct NoteEvent {
        int frameOffset = 0;          // 0-based frame inside the current block
        int midiNote = 36;            // 0..127 MIDI note number
        float velocity = 1.0f;        // 0..1 normalized velocity
        float clipGain = 1.0f;        // linear clip gain multiplier
    };

    DrumSampler();
    ~DrumSampler() = default;
    DrumSampler(const DrumSampler&) = delete;
    DrumSampler& operator=(const DrumSampler&) = delete;

    // Control thread: loads one of the two stock kits (808 CLASSIC or UZU) and
    // resets pad parameters to the kit defaults. Call `prepare(sampleRate)`
    // before rendering.
    void loadKit(DrumKitId kit);
    [[nodiscard]] DrumKitId kitId() const noexcept { return kit_; }

    // Control thread: replaces a pad's raw sample buffer (mono float PCM at
    // `sourceRate`) for custom zones or deterministic tests. Non-finite samples
    // are sanitized to 0; out-of-range sample rates are rejected. Resampled on
    // the next `prepare()` (and immediately if already prepared).
    void setCustomSample(int pad, std::span<const float> monoSamples, double sourceRate);

    // Control thread: clears all MIDI note -> pad mappings.
    void clearNoteMap() noexcept;

    // Control thread: resets MIDI note -> pad mapping to GM drum notes
    // (36 kick, 38 snare, 42/44 closed/pedal hat, 46 open hat, etc.).
    void setGmNoteMap() noexcept;

    // Control thread: maps `baseNote .. baseNote + 15` sequentially to pads `0..15`.
    void setSequentialNoteMap(int baseNote = 36) noexcept;

    // Control thread: maps one MIDI note (0..127) to a pad index (0..15, or -1 for unmapped).
    void setNotePad(int midiNote, int padIndex) noexcept;
    [[nodiscard]] int padForMidiNote(int midiNote) const noexcept;

    // Control thread: converts and resamples all 16 pad buffers (plus octave
    // mipmaps) once to `sampleRate` (44.1 / 48 / 96 kHz, etc.) using a
    // Kaiser-windowed sinc resampler. Idempotent at the same sample rate:
    // preserves active voices and performs zero allocations.
    void prepare(double sampleRate);
    [[nodiscard]] double sampleRate() const noexcept { return sampleRate_; }
    [[nodiscard]] std::size_t preparedSampleFrames(int pad) const noexcept;

    // Real-time safe parameter accessors (no allocation, no lock).
    void setPadParams(int pad, const PadParams& params) noexcept;
    [[nodiscard]] const PadParams& padParams(int pad) const noexcept;
    void setMasterGain(float linearGain) noexcept;
    [[nodiscard]] float masterGain() const noexcept { return masterGain_; }
    void setVoiceLimit(int limit) noexcept;
    [[nodiscard]] int voiceLimit() const noexcept { return voiceLimit_; }

    // Real-time safe voice queries and playback (no allocation, no lock, no syscall).
    void reset() noexcept;
    [[nodiscard]] int activeVoiceCount() const noexcept;
    [[nodiscard]] int activeVoiceCountAtomic() const noexcept {
        return activeVoicesAtomic_.load(std::memory_order_relaxed);
    }
    [[nodiscard]] bool hasActiveVoices() const noexcept {
        return activeCount_ > 0 || declickL_ != 0.0f || declickR_ != 0.0f;
    }
    [[nodiscard]] int activeVoiceCountForPad(int pad) const noexcept;

    // Triggers a pad immediately (velocity in [0, 1]; <= 0 is ignored).
    // Returns the allocated voice slot index, or -1 if ignored/unprepared.
    int triggerPad(int pad, float velocity, float clipGain = 1.0f) noexcept {
        return triggerPad(pad, velocity, clipGain, ClipFade{});
    }
    int triggerPad(int pad, float velocity, float clipGain, const ClipFade& clipFade) noexcept;
    int triggerMidiNote(int midiNote, float velocity, float clipGain = 1.0f) noexcept {
        return triggerMidiNote(midiNote, velocity, clipGain, ClipFade{});
    }
    int triggerMidiNote(int midiNote, float velocity, float clipGain, const ClipFade& clipFade) noexcept;

    // Adds interleaved stereo output (`stereo.size() == frames * 2`) into `stereo`,
    // splitting the block at each event's `frameOffset` for sample-accurate starts.
    // `events` must be sorted in non-decreasing `frameOffset` order.
    void renderBlock(std::span<float> stereo, std::span<const NoteEvent> events = {}) noexcept;

    // Renders `frameCount` frames starting at `startFrame` into `stereo` (additive)
    // without scanning any event list.
    void renderFrames(std::span<float> stereo, std::size_t startFrame, std::size_t frameCount) noexcept;

private:
    struct MipBuffer {
        // Mono float samples with 1 trailing 0.0f guard sample for branch-free
        // linear interpolation.
        std::vector<float> samples;
        std::size_t frames = 0;
    };

    struct PadData {
        PadParams params{};
        int stockSampleIndex = 0;
        bool useCustom = false;
        double customSourceRate = 44100.0;
        std::vector<float> customSource;
        // Mip level 0 is the sample at `sampleRate_`; levels 1..4 are 2x..16x
        // band-limited decimated mipmaps for alias-free upward pitch shifting.
        std::array<MipBuffer, kMipLevels> mips{};
    };

    struct Voice {
        bool active = false;
        bool choking = false;
        bool hasClipFade = false;
        int pad = -1;
        int mipLevel = 0;
        int chokeGroup = 0;
        std::uint64_t ageOrder = 0;
        double pos = 0.0;
        double step = 1.0;
        double sincHalfWidth = 8.0;
        double sincLutScale = 128.0;
        float sincGain = 1.0f;
        std::uint64_t elapsedFrames = 0;
        std::uint64_t attFrames = 0;
        std::uint64_t holdFrames = 0;
        std::uint64_t decFrames = 1;
        double invAttFrames = 0.0;
        double invDecFrames = 1.0;
        double expMul = 1.0;
        double expState = 1.0;
        double linState = 1.0;
        float curve = 0.35f;
        float gainL = 0.0f;
        float gainR = 0.0f;
        float ampLevel = 1.0f;
        float chokeGain = 1.0f;
        float chokeSm = 1.0f;
        float lastOutL = 0.0f;
        float lastOutR = 0.0f;
        double msIntoClip = 0.0;
        double clipDurationMs = 0.0;
        audio::ResolvedFades clipFades{};
    };

    static PadParams sanitizePadParams(const PadParams& params) noexcept;
    void resamplePad(int pad);
    void buildMipmaps(PadData& dst);
    void deactivateVoice(Voice& v) noexcept;
    void stealVoiceDeclick(Voice& v) noexcept;
    void chokeGroupVoices(int chokeGroup) noexcept;
    int allocateVoiceSlot() noexcept;

    DrumKitId kit_ = DrumKitId::Classic808;
    double sampleRate_ = 48000.0;
    double msPerFrame_ = 1000.0 / 48000.0;
    bool prepared_ = false;
    float masterGain_ = 1.0f;
    audio::ParameterSmoother masterGainSmoother_;
    int voiceLimit_ = kMaxVoices;
    int activeCount_ = 0;
    std::atomic<int> activeVoicesAtomic_{0};
    double oneMinusChokeCoef_ = 0.93;
    double chokeSlew_ = 0.07;
    float declickL_ = 0.0f;
    float declickR_ = 0.0f;
    std::uint64_t triggerSeq_ = 0;
    std::array<std::int8_t, 128> noteToPad_{};
    std::array<PadData, kNumPads> pads_{};
    std::array<Voice, kMaxVoices> voices_{};
    // Immutable Kaiser-windowed sinc LUT initialized once in the constructor for
    // rate-dependent band-limited playback across arbitrary fractional pitch ratios.
    std::array<float, kPlaySincLutSize + 1> playSincLut_{};
};

// Timeline BlockProcessor wrapping DrumSampler for tracks with instrument type
// "drum" (and one-shot drum-kit "sampler" tracks without multisample zones),
// matching SubtractiveInstrumentProcessor's contract.
//
// Ownership: owned by MixPlan's TrackPlan::processors vector (shared_ptr per
// the BlockProcessor registry interface). Owns `sampler_` and `notes_` by value.
// Thread affinity: constructed and prepared on the control / plan-build thread
// and destroyed there after renderer retirement. After publication,
// MixRenderLease serializes `process()`, `reset()`, and `setParameter()` on the
// render thread with zero allocations, zero locks, and zero syscalls.
class DrumSamplerProcessor final : public audio::BlockProcessor {
public:
    // Routing predicate for PatternAudioStage and runDrumInstrumentStage:
    // returns true for type "drum" and one-shot kit-backed "sampler" instruments
    // without multisample zones. Zone-based "sampler" tracks route to SMP1.
    [[nodiscard]] static bool handlesInstrument(const QJsonObject& instrument) noexcept;
    [[nodiscard]] static bool supportsParameter(std::string_view name) noexcept;

    DrumSamplerProcessor(const Timeline& timeline, const Track& track);
    ~DrumSamplerProcessor() override = default;
    DrumSamplerProcessor(const DrumSamplerProcessor&) = delete;
    DrumSamplerProcessor& operator=(const DrumSamplerProcessor&) = delete;

    void prepare(double rate) override;
    void reset() noexcept override;
    bool hasPendingOutput(int) const noexcept override;
    bool setParameter(std::string_view name, double value) noexcept override;
    void process(std::span<float> stereo, const audio::BlockContext& context) noexcept override;

    // Thread-safe active voice count for UI metering from any thread.
    [[nodiscard]] int activeVoiceCountAtomic() const noexcept { return sampler_.activeVoiceCountAtomic(); }

    // Test-only / pre-publication (or MixRenderLease-serialized render-thread)
    // accessor. Do not call concurrently from the control/UI thread after
    // MixPlan publication; use `activeVoiceCountAtomic()` for metering.
    [[nodiscard]] const DrumSampler& sampler() const noexcept { return sampler_; }

private:
    struct ScheduledNote {
        double startMs = 0.0;
        int midiNote = 36;
        float velocity = 1.0f;
        double clipStartMs = 0.0;
        double clipDurationMs = 0.0;
        float clipGain = 1.0f;
        audio::ResolvedFades fades{};
    };

    DrumSampler sampler_;
    std::vector<ScheduledNote> notes_;
    std::size_t next_ = 0;
    double expectedMs_ = std::numeric_limits<double>::quiet_NaN();
};

// Plan-building thread only: attaches DrumSamplerProcessor for MIDI tracks
// matching DrumSamplerProcessor::handlesInstrument(), skipping tracks that
// already have an "instrument" processor.
void runDrumInstrumentStage(const Timeline& timeline, audio::MixPlan& plan);

// Startup/control-thread registration (idempotent via unique=true) into
// MixPlan's stage registry at priority -1 (before audioEffects and automation).
[[nodiscard]] audio::MixPlanStageToken registerDrumSamplerStage();

}  // namespace nt::midi
