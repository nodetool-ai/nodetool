// Ported from RipplerX (https://github.com/tiagolr/ripplerx) at commit 11683a6.
// Copyright (C) 2025 tiagolr (tilr) — GNU General Public License v3.0 (GPL-3.0).
// Compatible with NodeTool's AGPL-3.0; see native/timeline/licenses/GPL-3.0.txt.
#pragma once

#include "audio/FadeCurves.h"
#include "audio/Mixer.h"
#include "audio/ParameterSmoother.h"
#include "midi/modal/ModalDsp.h"
#include "model/TimelineTypes.h"

#include <QJsonObject>

#include <array>
#include <atomic>
#include <condition_variable>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <memory>
#include <mutex>
#include <span>
#include <string_view>
#include <thread>
#include <vector>

namespace nt::midi {

struct ModalResonatorParams {
    bool on = true;
    modal::ModalModel model = modal::ModalModel::String;
    int partials = 32;            // 1, 2, 4, 8, 16, 32, 64
    float decay = 1.0f;           // 0.01 .. 100.0 s
    float damp = 0.0f;            // -1 .. +1 (material)
    float tone = 0.0f;            // -1 .. +1
    float hit = 0.26f;            // 0.02 .. 0.50 strike position
    float release = 1.0f;         // 0.001 .. 1.0 decay multiplier on note-off
    float inharm = 0.0001f;       // 0.0 .. 1.0 (clamped internally to >= 0.0001 in partial log)
    float ratio = 0.78f;          // 0.1 .. 10.0 aspect ratio (Beam/Membrane/Plate/Djembe)
    float cut = 0.0f;             // -1 .. +1 (<0 LP, 0 off, >0 HP)
    float radius = 0.5f;          // 0 .. 1 tube waveguide damping radius
    float coarse = 0.0f;          // -48 .. +48 semitones
    float fine = 0.0f;            // -99 .. +99 cents
    float velDecay = 0.0f;        // -1 .. +1
    float velHit = 0.0f;          // -1 .. +1
    float velInharm = 0.0f;       // -1 .. +1
    float velDamp = 0.0f;         // -1 .. +1
    float velTone = 0.0f;         // -1 .. +1
};

// Complete parameter snapshot for the physically modeled percussion/mallet synthesizer.
struct ModalSynthParams {
    // Mallet exciter
    float malletMix = 0.0f;         // 0 .. 1 direct mallet level
    float malletRes = 0.8f;         // 0 .. 1 mallet resonator feed
    float malletStiff = 600.0f;     // 100 .. 5000 Hz stiffness bandpass frequency
    float velMalletMix = 0.0f;      // -1 .. +1
    float velMalletRes = 0.0f;      // -1 .. +1
    float velMalletStiff = 0.0f;    // -1 .. +1

    // Noise / oscillator exciter
    float noiseOsc = 0.0f;          // 0 .. 1 partial-oscillator blend
    float noiseMix = 0.0f;          // 0 .. 1 direct noise level
    float noiseRes = 0.0f;          // 0 .. 1 noise resonator feed
    modal::NoiseFilterMode noiseFilterMode = modal::NoiseFilterMode::HighPass;
    float noiseFilterFreq = 20.0f;  // 20 .. 20000 Hz
    float noiseFilterQ = 0.707f;    // 0.707 .. 4.0
    float noiseAttackMs = 1.0f;     // 1 .. 20000 ms
    float noiseDecayMs = 500.0f;    // 1 .. 20000 ms
    float noiseSustain = 0.0f;      // 0 .. 1
    float noiseReleaseMs = 500.0f;  // 1 .. 20000 ms
    float noiseAttackTension = 0.4f;
    float noiseDecayTension = 0.4f;
    float noiseReleaseTension = 0.4f;
    float velNoiseMix = 0.0f;
    float velNoiseRes = 0.0f;
    float velNoiseFreq = 0.0f;
    float velNoiseQ = 0.0f;
    float velNoiseAttack = 0.0f;
    float velNoiseDecay = 0.0f;
    float velNoiseSustain = 0.0f;
    float velNoiseRelease = 0.0f;

    // Dual resonators A and B
    ModalResonatorParams a{};
    ModalResonatorParams b{false};

    // Coupling & master
    modal::ModalCoupling coupling = modal::ModalCoupling::Parallel;
    float abMix = 0.5f;             // 0 .. 1 parallel mix (0 = A, 1 = B)
    float abSplit = 0.01f;          // 0.01 .. 1.0 serial frequency split
    float gainDb = 0.0f;            // -24 .. +24 dB resonator output gain
    int pitchBendRange = 2;         // 1 .. 24 semitones
    bool stereoizer = true;         // 20 ms comb stereoizer
    int polyphony = 16;             // 1 .. 16 voices
    bool reuseVoices = false;       // reuse voice on repeated pitch
    bool fadeoutRepeats = false;    // 1 ms fadeout on repeated notes
};

// Polyphonic physically modeled modal + waveguide synthesizer (ported from RipplerX).
//
// Ownership: owned by value inside `ModalSynthProcessor` (or a test caller).
// Owns three pre-allocated `ModalTableSnapshot` instances via `std::unique_ptr`
// in an ownership-exchanging triple buffer, a three-slot lock-free `TableRequest`
// triple buffer, one immutable `ModalRatioTables` instance, two pre-allocated
// `VoiceBank` instances (active + swap-out crossfade bank), and a control-thread
// table-preparation worker (`workerThread_`) started in `prepare()` and joined
// in `~ModalSynth()`. All audio buffers are allocated once in constructor so
// `renderBlock()`, `renderFrames()`, `noteOn()`, `noteOff()`, `setParameter()`,
// `setSustainPedal()`, `setPitchBend()`, `panic()`, and `reset()` perform zero
// heap allocations, zero locks, and zero syscalls.
//
// Thread affinity: `prepare()`, `publishTablesOffThread()`, `waitForPublishedTables()`,
// and `~ModalSynth()` run on the control / plan-build thread; `workerThread_` builds
// updated `ModalTableSnapshot` instances off the audio thread in response to lock-free
// requests from `setParameter()` and publishes them via `publishMutex_` + atomic slot
// exchange on `sharedSnapshotSlot_`. After publication, `MixRenderLease` serializes
// `renderBlock()`, `renderFrames()`, `setParams()`, `setParameter()`, `noteOn()`,
// `noteOff()`, `setSustainPedal()`, `setPitchBend()`, `panic()`, and `reset()` on
// the render thread. The render thread exclusively owns `renderSnapshotIdx_` and
// passes one pinned `const ModalTableSnapshot&` through every render operation.
class ModalSynth {
public:
    friend struct modal::ModalSynthTestPeer;

    enum class EventKind : std::uint8_t {
        NoteOff = 0,
        NoteOn = 1,
        SustainPedal = 2,
        PitchBend = 3,
    };

    struct NoteEvent {
        int frameOffset = 0;
        EventKind kind = EventKind::NoteOn;
        int midiNote = 60;
        float velocity = 0.8f;      // 0..1 for NoteOn, >=0.5 for SustainPedal on, [-1..1] for PitchBend
        float clipGain = 1.0f;
        std::uint64_t noteId = 0;   // 0 = wildcard pitch match; non-zero = specific note instance
    };

    ModalSynth();
    ~ModalSynth();
    ModalSynth(const ModalSynth&) = delete;
    ModalSynth& operator=(const ModalSynth&) = delete;
    ModalSynth(ModalSynth&&) = delete;
    ModalSynth& operator=(ModalSynth&&) = delete;

    // Control thread: initializes LUTs, ratio tables, stereoizer, limiter, smoothers,
    // initial table snapshot, and the off-thread table-preparation worker.
    void prepare(double sampleRate) noexcept;
    [[nodiscard]] double sampleRate() const noexcept { return sampleRate_; }

    // Off-thread table precomputation into the publisher's exclusively owned snapshot slot,
    // published atomically via ownership exchange.
    void publishTablesOffThread(const ModalSynthParams& params) noexcept;

    // Control-thread / test helper: waits until all live table requests submitted before
    // this call have been built and published by the off-thread worker.
    bool waitForPublishedTables(int timeoutMs = 500) noexcept;

    // Parameter control (zero allocation, zero lock).
    void setParams(const ModalSynthParams& params) noexcept;
    void snapParams() noexcept;
    [[nodiscard]] const ModalSynthParams& params() const noexcept { return params_; }
    bool setParameter(std::string_view name, double value) noexcept;

    void setRngSeed(std::uint64_t seed) noexcept {
        rngState_ = seed != 0 ? seed : 0x9E3779B97F4A7C15ULL;
    }

    // Real-time safe voice and performance controls.
    void noteOn(int midiNote, float velocity, float clipGain = 1.0f, std::uint64_t noteId = 0) noexcept;
    void noteOn(int midiNote, float velocity, const modal::VoiceClipEnvelope& clipEnv, std::uint64_t noteId = 0) noexcept;
    void noteOff(int midiNote, std::uint64_t noteId = 0) noexcept;
    void setSustainPedal(bool down) noexcept;
    void setPitchBend(double normalizedMinus1To1) noexcept;
    void panic() noexcept;
    void reset() noexcept;

    // Sample-accurate stereo rendering (additive into interleaved `stereo`).
    void renderBlock(std::span<float> stereo, std::span<const NoteEvent> events = {}) noexcept;
    void renderFrames(std::span<float> stereo, std::size_t startFrame, std::size_t frameCount,
                      double startTimeMs = -1.0, double msPerFrame = 0.0) noexcept;

    [[nodiscard]] bool hasActiveSound() const noexcept;
    [[nodiscard]] int activeVoiceCount() const noexcept;
    [[nodiscard]] const modal::ModalModels& models() const noexcept {
        return snapshots_[static_cast<std::size_t>(renderSnapshotIdx_)]->models;
    }

    // Raw internal, pre-limiter, and pre-clamp diagnostics (for verification tests).
    [[nodiscard]] std::uint64_t nonFiniteCount() const noexcept { return nonFiniteCount_; }
    [[nodiscard]] std::uint64_t waveguideClampCount() const noexcept { return waveguideClampCount_; }
    [[nodiscard]] double maxRawResonatorAbs() const noexcept { return maxRawResonatorAbs_; }
    [[nodiscard]] double maxPreLimiterAbs() const noexcept { return maxPreLimiterAbs_; }
    [[nodiscard]] double maxPreClampAbs() const noexcept { return maxPreClampAbs_; }
    void resetDiagnostics() noexcept;

private:
    using VoiceBank = std::array<modal::ModalVoice, modal::kMaxPolyphony>;

    static constexpr std::uint32_t kTripleSlotMask = 0x3u;
    static constexpr std::uint32_t kTripleDirtyBit = 0x4u;

    struct TableRequest {
        modal::ModalModel aModel = modal::ModalModel::String;
        modal::ModalModel bModel = modal::ModalModel::String;
        int aPartials = 32;
        int bPartials = 32;
        bool aOn = true;
        bool bOn = false;
        modal::ModalCoupling coupling = modal::ModalCoupling::Parallel;
        float aRatio = 0.78f;
        float bRatio = 0.78f;
        float aCoarse = 0.0f;
        float aFine = 0.0f;
        float bCoarse = 0.0f;
        float bFine = 0.0f;
        float abSplit = 0.01f;
        std::uint64_t seq = 0;
    };

    static void buildTableSnapshot(const ModalSynthParams& p, modal::ModalTableSnapshot& out,
                                   bool computeSerialAllNotes,
                                   const modal::ModalLookupTable* sinLut) noexcept;

    void publishSnapshotLocked(const ModalSynthParams& params, bool fromLiveRequest,
                               std::uint64_t requestSeq) noexcept;
    [[nodiscard]] const modal::ModalTableSnapshot& acquireRenderSnapshot() noexcept;
    void enqueueTableRequest() noexcept;
    void startTableWorker() noexcept;
    void stopTableWorker() noexcept;
    void tableWorkerLoop() noexcept;

    [[nodiscard]] bool hasSoundingVoices() const noexcept;
    [[nodiscard]] bool hasNonFadeInSoundingVoice() const noexcept;

    void applyNoiseParamsToBank(VoiceBank& bank) noexcept;
    void applyResonatorParamsToBank(VoiceBank& bank, bool clearVoices, bool recomputeRatios,
                                    modal::ModalModel aModel, modal::ModalModel bModel,
                                    int aPartials, int bPartials,
                                    const modal::ModalTableSnapshot& snap) noexcept;
    void applyAllParamsToVoices(bool allowCrossfadeOnStructuralChange,
                                const modal::ModalTableSnapshot& snap) noexcept;
    void populateIncomingSwapVoices(const modal::ModalTableSnapshot& snap) noexcept;
    void beginStructuralSwap(bool snapARatio, bool snapBRatio,
                             const modal::ModalTableSnapshot& snap) noexcept;
    void startDeferredStructuralSwapIfPending(const modal::ModalTableSnapshot& snap) noexcept;
    void finishStructuralSwap() noexcept;
    void updateSmoothingTargets() noexcept;
    void syncResonatorSmoothersToVoices(bool recomputeRatios,
                                        const modal::ModalTableSnapshot& snap) noexcept;
    void advanceBlockRateSmoothers(std::size_t steps,
                                   const modal::ModalTableSnapshot& snap) noexcept;
    void renderSubBlock(std::span<float> stereo, std::size_t startFrame, std::size_t frames,
                        double startTimeMs, double msPerFrame) noexcept;
    void harvestVoiceDiagnostics() noexcept;
    [[nodiscard]] int pickVoice(int midiNote) const noexcept;
    void releaseNoteImmediate(int midiNote, std::uint64_t noteId,
                              const modal::ModalTableSnapshot& snap) noexcept;

    ModalSynthParams params_{};
    double sampleRate_ = 48000.0;
    bool prepared_ = false;

    // Ownership-exchanging triple buffer for immutable model ratio & serial-shift snapshots.
    // Invariant: {publishWriteIdx_, renderSnapshotIdx_, sharedSnapshotSlot_ & kTripleSlotMask}
    // is always a permutation of {0, 1, 2}. `publishMutex_` guards only off-audio publishers
    // and is never touched on the render thread.
    std::array<std::unique_ptr<modal::ModalTableSnapshot>, 3> snapshots_{};
    std::mutex publishMutex_{};
    int publishWriteIdx_ = 1;
    std::uint64_t publishNextGen_ = 0;
    std::atomic<std::uint32_t> sharedSnapshotSlot_{2u};
    int renderSnapshotIdx_ = 0;
    std::uint64_t appliedSnapshotGen_ = 0;

    // Lock-free SPSC ownership-exchanging triple buffer for live table requests
    // (render thread produces in `reqWriteIdx_`; control worker consumes in `reqReadIdx_`).
    std::array<TableRequest, 3> reqSlots_{};
    int reqWriteIdx_ = 1;
    std::uint64_t reqNextSeq_ = 0;
    std::atomic<std::uint32_t> reqSharedSlot_{2u};
    int reqReadIdx_ = 0;
    std::atomic<std::uint64_t> submittedRequestSeq_{0};
    std::atomic<std::uint64_t> publishedRequestSeq_{0};

    // Control-thread worker for live table preparation (never locked on audio thread).
    std::thread workerThread_{};
    std::mutex shutdownMutex_{};
    std::condition_variable shutdownCv_{};
    std::atomic<bool> stopWorker_{false};
    std::mutex workerNotifyMutex_{};
    std::condition_variable workerDoneCv_{};

    // Immutable ratio lookup tables prepared once on the control thread in prepare().
    std::unique_ptr<modal::ModalRatioTables> ratioTables_{};

    modal::ModalLookupTable a1Lut_{};
    modal::ModalLookupTable sinLut_{};
    std::unique_ptr<VoiceBank> voices_{};
    std::unique_ptr<VoiceBank> swapOutVoices_{};
    modal::CombStereoizer comb_{};
    modal::OutputLimiter limiter_{};
    int combTailRemaining_ = 0;

    bool sustainPedal_ = false;

    // Voice ordering timestamps & pitch bend glide.
    std::uint64_t notePressCount_ = 0;
    std::uint64_t noteReleaseCount_ = 0;
    int totalSamplesBend_ = 96;
    int remainingSamplesBend_ = -1;
    double curBend_ = 1.0;
    double targetBend_ = 1.0;
    double bendStep_ = 0.0;

    // Structural change tracking and true dual-bank crossfade swap.
    modal::ModalModel lastAModel_ = modal::ModalModel::String;
    modal::ModalModel lastBModel_ = modal::ModalModel::String;
    int lastAPartials_ = 32;
    int lastBPartials_ = 32;
    bool lastAOn_ = true;
    bool lastBOn_ = false;
    bool lastSerial_ = false;
    bool structSwapFading_ = false;
    int structSwapTotalSamples_ = 240;
    int structSwapSamples_ = 0;
    double swapOutStartGain_ = 1.0;
    bool swapOutAOn_ = true;
    bool swapOutBOn_ = false;
    bool swapOutSerial_ = false;
    bool pendingStructuralSwap_ = false;
    bool pendingSnapARatio_ = false;
    bool pendingSnapBRatio_ = false;
    bool pendingResonatorSync_ = false;
    bool pendingRatioSync_ = false;

    // Per-sample continuous parameter smoothers.
    audio::ParameterSmoother gainLinSm_{};
    audio::ParameterSmoother abMixSm_{};
    audio::ParameterSmoother malletMixSm_{};
    audio::ParameterSmoother malletResSm_{};
    audio::ParameterSmoother noiseMixNormSm_{};
    audio::ParameterSmoother noiseResNormSm_{};
    audio::ParameterSmoother noiseOscSm_{};

    // Block-rate continuous resonator smoothers.
    audio::ParameterSmoother aDecaySm_{};
    audio::ParameterSmoother aDampSm_{};
    audio::ParameterSmoother aToneSm_{};
    audio::ParameterSmoother aHitSm_{};
    audio::ParameterSmoother aInharmSm_{};
    audio::ParameterSmoother aRatioSm_{};
    audio::ParameterSmoother aCutSm_{};
    audio::ParameterSmoother aRadiusSm_{};
    audio::ParameterSmoother aCoarseSm_{};
    audio::ParameterSmoother aFineSm_{};

    audio::ParameterSmoother bDecaySm_{};
    audio::ParameterSmoother bDampSm_{};
    audio::ParameterSmoother bToneSm_{};
    audio::ParameterSmoother bHitSm_{};
    audio::ParameterSmoother bInharmSm_{};
    audio::ParameterSmoother bRatioSm_{};
    audio::ParameterSmoother bCutSm_{};
    audio::ParameterSmoother bRadiusSm_{};
    audio::ParameterSmoother bCoarseSm_{};
    audio::ParameterSmoother bFineSm_{};

    audio::ParameterSmoother abSplitSm_{};

    std::uint64_t rngState_ = 0xD1B54A32D192ED03ULL;
    std::uint64_t nonFiniteCount_ = 0;
    std::uint64_t waveguideClampCount_ = 0;
    double maxRawResonatorAbs_ = 0.0;
    double maxPreLimiterAbs_ = 0.0;
    double maxPreClampAbs_ = 0.0;
};

// Timeline BlockProcessor wrapping ModalSynth for MIDI tracks with
// `instrument.type == "modal"`, matching SubtractiveInstrumentProcessor's contract.
//
// Ownership: owned by MixPlan's TrackPlan::processors vector (`std::shared_ptr`
// matching the BlockProcessor registry interface). Owns `synth_`, `clipSources_`,
// `events_`, and `intervals_` by value.
// Thread affinity: constructed and prepared on the control / plan-build thread and
// destroyed there after renderer retirement. After publication, MixRenderLease
// serializes `process()`, `reset()`, and `setParameter()` on the render thread with
// zero allocations, zero locks, and zero syscalls.
class ModalSynthProcessor final : public audio::BlockProcessor {
public:
    ModalSynthProcessor(const Timeline& timeline, const Track& track);
    ~ModalSynthProcessor() override = default;
    ModalSynthProcessor(const ModalSynthProcessor&) = delete;
    ModalSynthProcessor& operator=(const ModalSynthProcessor&) = delete;

    void prepare(double rate) override;
    void reset() noexcept override;
    bool hasPendingOutput(int) const noexcept override;
    bool setParameter(std::string_view name, double value) noexcept override;
    void process(std::span<float> stereo, const audio::BlockContext& context) noexcept override;

    [[nodiscard]] const ModalSynth& synth() const noexcept { return synth_; }

private:
    struct MidiClipSource {
        QJsonObject raw;
        double startMs = 0.0;
        double inPointMs = 0.0;
        double durationMs = 0.0;
        modal::VoiceClipEnvelope clipEnv{};
    };

    struct ScheduledEvent {
        double timeMs = 0.0;
        ModalSynth::EventKind kind = ModalSynth::EventKind::NoteOn;
        int midiNote = 60;
        float velocity = 0.8f;
        modal::VoiceClipEnvelope clipEnv{};
        std::uint64_t noteId = 0;
    };

    struct NoteInterval {
        double startMs = 0.0;
        double offMs = 0.0;
        int midiNote = 60;
        float velocity = 0.8f;
        modal::VoiceClipEnvelope clipEnv{};
        std::uint64_t noteId = 0;
    };

    void rebuildEvents(double sampleRate);
    void chaseAt(double timeMs) noexcept;

    ModalSynth synth_;
    double bpm_ = 120.0;
    QJsonObject timelineRaw_{};
    std::vector<MidiClipSource> clipSources_;
    double eventsBuiltRate_ = 0.0;
    std::vector<ScheduledEvent> events_;
    std::vector<NoteInterval> intervals_;
    std::size_t next_ = 0;
    double expectedMs_ = std::numeric_limits<double>::quiet_NaN();
};

}  // namespace nt::midi
