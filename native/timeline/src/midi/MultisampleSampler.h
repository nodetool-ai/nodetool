#pragma once

// Real-time multisample sampler instrument for the NodeTool timeline.
// Reuses the voice/stealing/declick architecture of DrumSampler with full
// key+velocity zone mapping, pre-bandlimited octave mipmaps + continuous
// Kaiser-windowed sinc pitch tracking, one-shot and crossfaded sustain loops,
// optional release samples, amp ADSR (double precision), velocity curve, glide,
// smoothed pitch bend & master gain, off-thread FFmpeg decoding/resampling,
// and lock-free atomic sample-set + parameter swaps.

#include "audio/FadeCurves.h"
#include "audio/Mixer.h"
#include "audio/ParameterSmoother.h"
#include "model/TimelineTypes.h"

#include <QJsonObject>

#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <limits>
#include <memory>
#include <optional>
#include <span>
#include <string>
#include <string_view>
#include <vector>

namespace nt::midi {

enum class SamplerLoopMode : std::uint8_t {
    OneShot = 0,
    Sustain = 1,
};

[[nodiscard]] std::string_view samplerLoopModeName(SamplerLoopMode mode) noexcept;
[[nodiscard]] std::optional<SamplerLoopMode> samplerLoopModeFromName(std::string_view name) noexcept;

// Serializable multisample zone definition. Matches `SamplerZone` in
// packages/timeline/src/types.ts and `samplerZone` in
// packages/protocol/src/api-schemas/timeline.ts.
struct SamplerZoneSpec {
    std::string id;
    std::string name;
    std::string assetId;            // 32-hex asset id, or empty when using mediaPath
    std::string mediaPath;          // project-relative or local audio file path
    int rootNote = 60;              // 0..127 (C3 = 60 per NodeTool octave convention)
    int lowNote = 0;                // 0..127
    int highNote = 127;             // 0..127
    int lowVelocity = 0;            // 0..127
    int highVelocity = 127;         // 0..127
    float gainDb = 0.0f;            // -60..+12 dB
    float pan = 0.0f;               // -1..+1
    float tuneCents = 0.0f;         // -100..+100 cents
    std::optional<SamplerLoopMode> loopMode;  // overrides instrument oneShot when set
    double loopStart = 0.0;         // normalized [0, 1] start of sustain loop
    double loopEnd = 1.0;           // normalized [0, 1] end of sustain loop
    float loopCrossfadeMs = 10.0f;  // 0..500 ms crossfade across loop seam
    std::string releaseAssetId;     // optional release sample asset id
    std::string releaseMediaPath;   // optional release sample project-relative/local path
    float releaseGainDb = 0.0f;     // -60..+12 dB
};

// Serializable instrument-level sampler parameters. Matches
// `SamplerMidiInstrument` in packages/timeline/src/types.ts.
struct SamplerParams {
    bool oneShot = false;
    float attackMs = 2.0f;          // 0..10000 ms
    float decayMs = 100.0f;         // 0..10000 ms
    float sustain = 1.0f;           // 0..1
    float releaseMs = 120.0f;       // 0..30000 ms
    float velocityCurve = 0.0f;     // -1..+1 (0 = linear, >0 = soft/exp, <0 = hard/log)
    float glideMs = 0.0f;           // 0..2000 ms pitch portamento
    int voiceLimit = 32;            // 1..64
    float pitchBendRange = 2.0f;    // 1..24 semitones
    float gainDb = -6.0f;           // -60..+12 dB
};

struct SamplerInstrumentSpec {
    SamplerParams params{};
    std::vector<SamplerZoneSpec> zones;
};

// Document JSON round-trip (matches packages/timeline & packages/protocol).
[[nodiscard]] SamplerInstrumentSpec samplerSpecFromJson(const QJsonObject& instrument);
[[nodiscard]] QJsonObject samplerSpecToJson(const SamplerInstrumentSpec& spec);

// Decoded interleaved stereo float32 PCM buffer produced off the audio thread.
struct DecodedAudioBuffer {
    std::vector<float> interleavedStereo;  // length == frames * 2
    double sampleRate = 48000.0;

    [[nodiscard]] std::size_t frameCount() const noexcept { return interleavedStereo.size() / 2; }
    [[nodiscard]] bool empty() const noexcept { return interleavedStereo.size() < 2; }
};

// Off-audio-thread resolver mapping `(assetId, mediaPath, targetRate)` to decoded stereo PCM.
using SampleResolver =
    std::function<std::optional<DecodedAudioBuffer>(const std::string& assetId, const std::string& mediaPath,
                                                    double targetSampleRate)>;

// Optional lookup mapping a persistent asset id to a local audio file path.
using AssetPathResolver = std::function<std::string(const std::string& assetId)>;

// Decodes a local audio file (WAV/AIFF/FLAC/MP3 via nt::audio::AudioSource / FFmpeg)
// to interleaved stereo float32 at `targetSampleRate`. Control/worker thread only.
// When `maxFrames > 0`, stops decoding after `maxFrames` frames (otherwise caps at
// 16M frames). If `totalDurationFramesOut` is non-null, writes the container's
// estimated total frames at `targetSampleRate` (at least the decoded frame count).
[[nodiscard]] std::optional<DecodedAudioBuffer> decodeAudioFileToStereo(
    const std::string& path, double targetSampleRate, std::string* error = nullptr,
    std::size_t maxFrames = 0, std::function<bool()> cancelled = {},
    std::size_t* totalDurationFramesOut = nullptr);

// Estimates a pitched sample's MIDI root note using YIN CMNDF autocorrelation.
// Returns an integer MIDI note in [24, 96] when confidently pitched, else `fallbackNote` (60 = C3).
// Control/worker thread only.
[[nodiscard]] int detectRootMidiNote(std::span<const float> interleavedStereo, double sampleRate,
                                     int fallbackNote = 60);

// Builds a single-zone spec spanning all keys (0..127) and velocities (0..127)
// for a dropped file or asset, with pitch detection (fallback C3 = 60).
[[nodiscard]] SamplerZoneSpec createSingleFileZone(std::string id, std::string name, std::string assetId,
                                                   std::string mediaPath,
                                                   std::span<const float> previewStereo, double sampleRate);

// Immutable prepared zone ready for lock-free real-time rendering on the audio thread.
struct PreparedSamplerZone {
    static constexpr int kMipLevels = 6;  // 1x, 2x, 4x, 8x, 16x, 32x (+0..+60 st)

    struct MipLevel {
        std::size_t frames = 0;
        std::vector<float> stereo;   // interleaved stereo (`frames * 2`)
        std::size_t loopStart = 0;   // loop wrap start in this mip's frame coordinates
        std::size_t loopEnd = 0;     // exclusive loop end in this mip's frame coordinates
        double preScale = 1.0;       // mip frames per base frame before loopStart (or unlooped)
        double loopScale = 1.0;      // mip frames per base frame inside [loopStart, loopEnd)
        bool valid = false;
    };

    int rootNote = 60;
    int lowNote = 0;
    int highNote = 127;
    int lowVelocity = 0;
    int highVelocity = 127;
    float linearGain = 1.0f;
    float panL = 0.70710678f;
    float panR = 0.70710678f;
    float tuneSemitones = 0.0f;  // tuneCents / 100
    std::optional<SamplerLoopMode> loopModeOverride;  // nullopt inherits live params_.oneShot
    std::size_t mainFrames = 0;
    std::size_t loopWrapStart = 0;  // base-mip frame wrapped back to when reaching loopEnd
    std::size_t loopEnd = 0;        // exclusive base-mip loop end frame (0 = no loop)
    bool hasLoop = false;
    std::array<MipLevel, kMipLevels> mainMips{};  // unmodified one-shot PCM + non-looped mipmaps
    std::array<MipLevel, kMipLevels> loopMips{};  // crossfaded sustain-loop PCM + periodic mipmaps
    std::size_t releaseFrames = 0;
    std::array<MipLevel, kMipLevels> releaseMips{};
    float releaseLinearGain = 1.0f;
};

// Immutable sample bank built off the audio thread and handed to MultisampleSampler
// via atomic pointer swap.
// Ownership: exclusively owned by MultisampleSampler's `ownedSets_` vector on the
// control thread; audio thread holds only non-owning borrowed pointers until retired.
// Thread affinity: constructed on control/worker thread, read-only on audio thread,
// destroyed on control thread after retirement.
struct PreparedSampleSet {
    std::uint64_t generation = 0;
    double sampleRate = 48000.0;
    std::optional<SamplerParams> params;  // when set, adopted atomically on the audio thread
    std::vector<PreparedSamplerZone> zones;
};

// Builds a PreparedSampleSet off the audio thread by decoding and sinc-resampling
// all zones (and optional release samples) to `sampleRate`, pre-crossfading loops,
// and building band-limited octave mipmaps.
[[nodiscard]] std::unique_ptr<PreparedSampleSet> prepareSampleSet(const SamplerInstrumentSpec& spec,
                                                                  double sampleRate,
                                                                  const SampleResolver& resolver);

// Default file resolver that resolves relative `mediaPath` against `projectDir`
// and resolves `assetId` via `assetPathResolver`, project `assets/`, or the
// timeline asset cache directory, decoding via FFmpeg (`decodeAudioFileToStereo`).
[[nodiscard]] SampleResolver makeProjectFileSampleResolver(const std::string& projectDir,
                                                           AssetPathResolver assetPathResolver = {},
                                                           const std::string& assetCacheDir = {});

// Real-time polyphonic multisample sampler engine.
//
// Ownership: owned by value inside MultisampleSamplerProcessor (or a test caller).
// All `PreparedSampleSet` instances are owned exclusively by `ownedSets_` via
// `std::unique_ptr` on the control thread; active and declicking voices live in
// fixed inline `std::array`s (zero heap allocation).
//
// Thread affinity:
// - Control/worker thread: `prepare()`, `publishPreparedSet()`, `reclaimRetired()`.
// - Audio render thread (serialized by MixRenderLease): `reset()`, `setParams()`,
//   `setParameter()`, `noteOn()`, `noteOff()`, `setPitchBend()`, `allNotesOff()`,
//   `renderBlock()`, `renderFrames()`. Zero allocations, zero frees, zero locks,
//   zero syscalls.
class MultisampleSampler {
public:
    static constexpr int kMaxVoices = 64;
    static constexpr std::size_t kRetiredRingSize = 64;
    // Declick fade constants matching DrumSampler (0.3 ms tau + 0.3 ms slew -> ~3.7 ms to -80 dB).
    static constexpr double kDeclickTauSec = 0.0003;
    static constexpr double kDeclickSlewSec = 0.0003;
    // Minimum release ramp floor to prevent 1-sample clicks when releaseMs == 0.
    static constexpr double kMinReleaseMs = 2.0;
    // One-pole pitch bend smoothing time constant (2.5 ms).
    static constexpr double kPitchBendSmoothTauSec = 0.0025;

    enum class EventKind : std::uint8_t {
        NoteOff = 0,
        NoteOn = 1,
        PitchBend = 2,
        AllNotesOff = 3,
    };

    struct ClipFade {
        bool active = false;
        double startMsIntoClip = 0.0;
        double clipDurationMs = 0.0;
        audio::ResolvedFades fades{};
    };

    struct MidiEvent {
        int frameOffset = 0;         // 0-based frame within current block
        EventKind kind = EventKind::NoteOn;
        int midiNote = 60;           // 0..127 (NoteOn / NoteOff)
        int midiVelocity = 100;      // 0..127 (NoteOn)
        float clipGain = 1.0f;       // linear clip gain (NoteOn)
        float pitchBendNorm = 0.0f;  // -1..+1 normalized pitch bend (PitchBend)
    };

    MultisampleSampler();
    ~MultisampleSampler();
    MultisampleSampler(const MultisampleSampler&) = delete;
    MultisampleSampler& operator=(const MultisampleSampler&) = delete;

    // Control thread: prepares rate-dependent constants.
    void prepare(double sampleRate);
    [[nodiscard]] double sampleRate() const noexcept { return sampleRate_; }

    // Control thread: atomically publishes a newly prepared sample set (and optional
    // bundled SamplerParams) for O(1) lock-free adoption on the next audio block.
    void publishPreparedSet(std::unique_ptr<PreparedSampleSet> nextSet);

    // Control thread: destroys sample sets retired by the audio thread.
    std::size_t reclaimRetired();

    // Control/audio thread: current active sample set generation (0 if none adopted yet).
    [[nodiscard]] std::uint64_t activeGeneration() const noexcept {
        return activeGeneration_.load(std::memory_order_acquire);
    }

    // Real-time safe parameter accessors (audio thread; no allocation, no lock).
    void setParams(const SamplerParams& params) noexcept;
    [[nodiscard]] const SamplerParams& params() const noexcept { return params_; }
    bool setParameter(std::string_view name, double value) noexcept;

    // Real-time safe voice control (audio thread; no allocation, no lock, no syscall).
    void reset() noexcept;
    void noteOn(int midiNote, int midiVelocity, float clipGain = 1.0f) noexcept {
        noteOn(midiNote, midiVelocity, clipGain, ClipFade{});
    }
    void noteOn(int midiNote, int midiVelocity, float clipGain, const ClipFade& clipFade) noexcept;
    void noteOff(int midiNote) noexcept;
    void setPitchBend(float normalizedBend) noexcept;
    void allNotesOff() noexcept;

    [[nodiscard]] int activeVoiceCount() const noexcept;
    [[nodiscard]] bool hasActiveVoices() const noexcept;
    [[nodiscard]] int activeReleaseVoiceCount() const noexcept;

    // Adds interleaved stereo output (`stereo.size() == frames * 2`) into `stereo`,
    // adopting any pending sample set atomically and splitting at each event's frameOffset.
    // `events` must be sorted in non-decreasing `frameOffset` order.
    void renderBlock(std::span<float> stereo, std::span<const MidiEvent> events = {}) noexcept;

    // Renders `frameCount` frames starting at `startFrame` into `stereo` (additive).
    void renderFrames(std::span<float> stereo, std::size_t startFrame, std::size_t frameCount) noexcept;

private:
    enum class EnvStage : std::uint8_t {
        Attack = 0,
        Decay = 1,
        Sustain = 2,
        Release = 3,
        Done = 4,
    };

    struct Voice {
        bool active = false;
        bool declicking = false;
        bool isReleaseSample = false;
        bool hasLooped = false;
        bool gateOn = false;
        bool hasClipFade = false;
        const PreparedSampleSet* sampleSet = nullptr;  // non-owning; activeSet_ or one of drainingSets_
        int zoneIndex = -1;
        int midiNote = 60;
        int midiVelocity = 100;
        std::uint64_t ageOrder = 0;
        std::uint64_t elapsedFrames = 0;

        double pos = 0.0;  // base-mip (level 0) fractional frame position
        double currentMidiPitch = 60.0;
        double targetMidiPitch = 60.0;
        double glideCoef = 1.0;

        EnvStage stage = EnvStage::Done;
        double envLevel = 0.0;
        double releaseStartLevel = 0.0;
        double attackInc = 1.0;
        double decayInc = 1.0;
        double sustainLevel = 1.0;
        double releaseInc = 1.0;

        float gainL = 0.0f;
        float gainR = 0.0f;
        float clipGain = 1.0f;
        float lastOutL = 0.0f;
        float lastOutR = 0.0f;
        double declickGain = 1.0;
        double declickSm = 1.0;
        double msIntoClip = 0.0;
        double clipDurationMs = 0.0;
        audio::ResolvedFades clipFades{};
    };

    [[nodiscard]] SamplerLoopMode effectiveLoopMode(const PreparedSamplerZone& z) const noexcept;
    void adoptPendingSet() noexcept;
    void checkDrainingRetirement() noexcept;
    void pushRetiredGeneration(std::uint64_t gen) noexcept;
    void moveVoiceToDeclick(Voice& v) noexcept;
    int allocateVoiceSlot() noexcept;
    void startZoneVoice(const PreparedSampleSet* set, int zoneIdx, int midiNote, int midiVelocity,
                        float clipGain, const ClipFade& clipFade, bool releaseSample) noexcept;
    void renderVoiceChunk(Voice& v, float* mixBuf, std::size_t chunk, double endRampFrames,
                          const double* bendSemisBuf, bool bendVarying, double constBendSemis) noexcept;

    // Control-thread-only exclusive ownership of all live/pending/draining PreparedSampleSets.
    std::vector<std::unique_ptr<PreparedSampleSet>> ownedSets_;
    std::uint64_t nextGen_ = 0;

    // Lock-free control -> audio handoff (non-owning pointer into `ownedSets_`).
    std::atomic<const PreparedSampleSet*> pendingSet_{nullptr};
    std::atomic<std::uint64_t> activeGeneration_{0};

    // Lock-free audio -> control SPSC ring of retired generations.
    std::array<std::atomic<std::uint64_t>, kRetiredRingSize> retiredRing_{};
    std::atomic<std::size_t> retiredWrite_{0};
    std::atomic<std::size_t> retiredRead_{0};

    static constexpr std::size_t kMaxDrainingSets = 4;

    // Audio-thread-only pointers (borrowed from `ownedSets_` until retired).
    const PreparedSampleSet* activeSet_ = nullptr;
    std::array<const PreparedSampleSet*, kMaxDrainingSets> drainingSets_{};

    SamplerParams params_{};
    double sampleRate_ = 48000.0;
    double msPerFrame_ = 1000.0 / 48000.0;
    bool prepared_ = false;
    float masterGain_ = 0.50118723f;  // -6 dB
    audio::ParameterSmoother masterGainSmoother_;
    double oneMinusDeclickCoef_ = 0.93;
    double declickSlew_ = 0.07;
    double pitchBendTarget_ = 0.0;
    double pitchBendSmoothed_ = 0.0;
    double pitchBendCoef_ = 1.0;
    double declickResL_ = 0.0;
    double declickResR_ = 0.0;
    double lastTriggeredMidi_ = -1.0;
    std::uint64_t triggerSeq_ = 0;
    std::array<Voice, kMaxVoices> voices_{};
    std::array<Voice, kMaxVoices> declickVoices_{};
};

// Timeline BlockProcessor wrapping MultisampleSampler for tracks with instrument
// type "sampler", matching SubtractiveInstrumentProcessor's contract.
//
// Ownership: owned by MixPlan's TrackPlan::processors vector (shared_ptr per the
// BlockProcessor registry interface). Owns `sampler_`, `spec_`, `events_`, and
// `resolver_` by value.
// Thread affinity: constructed, prepared, and `serviceControlThread()` /
// `publishSpec()` run on the control / plan-build thread. After publication,
// MixRenderLease serializes `process()`, `reset()`, `setParameter()`, and
// `hasPendingOutput()` on the audio render thread with zero allocations, zero
// locks, and zero syscalls.
class MultisampleSamplerProcessor final : public audio::BlockProcessor {
public:
    MultisampleSamplerProcessor(const Timeline& timeline, const Track& track,
                                SampleResolver resolver = {});
    ~MultisampleSamplerProcessor() override = default;
    MultisampleSamplerProcessor(const MultisampleSamplerProcessor&) = delete;
    MultisampleSamplerProcessor& operator=(const MultisampleSamplerProcessor&) = delete;

    void prepare(double rate) override;
    void reset() noexcept override;
    bool hasPendingOutput(int) const noexcept override;
    bool setParameter(std::string_view name, double value) noexcept override;
    void process(std::span<float> stereo, const audio::BlockContext& context) noexcept override;
    void serviceControlThread() override;

    // Control thread: prepares a new zone set + params off the audio thread and swaps atomically.
    void publishSpec(const SamplerInstrumentSpec& spec);
    void publishPreparedSet(std::unique_ptr<PreparedSampleSet> nextSet);

    [[nodiscard]] const MultisampleSampler& sampler() const noexcept { return sampler_; }
    [[nodiscard]] const SamplerInstrumentSpec& spec() const noexcept { return spec_; }

private:
    struct MidiClipSnapshot {
        QJsonObject raw;
        double startMs = 0.0;
        double durationMs = 0.0;
        double inPointMs = 0.0;
        float clipGain = 1.0f;
        audio::ResolvedFades fades{};
    };

    struct ScheduledEvent {
        double timeMs = 0.0;
        MultisampleSampler::EventKind kind = MultisampleSampler::EventKind::NoteOn;
        int midiNote = 60;
        int midiVelocity = 100;
        double clipStartMs = 0.0;
        double clipDurationMs = 0.0;
        float clipGain = 1.0f;
        audio::ResolvedFades fades{};
        float pitchBendNorm = 0.0f;
    };

    void rebuildEventsForRate(double rate);

    SamplerInstrumentSpec spec_;
    SampleResolver resolver_;
    MultisampleSampler sampler_;
    QJsonObject timelineRaw_;
    double bpm_ = 120.0;
    std::vector<MidiClipSnapshot> clips_;
    std::vector<ScheduledEvent> pitchBendEvents_;
    std::vector<ScheduledEvent> events_;
    double extractedRate_ = 0.0;
    std::size_t next_ = 0;
    double expectedMs_ = std::numeric_limits<double>::quiet_NaN();
    double preparedRate_ = 48000.0;
};

}  // namespace nt::midi
