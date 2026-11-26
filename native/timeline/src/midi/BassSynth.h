// Derived from georgi/fablesynth (https://github.com/georgi/fablesynth) at
// commit af55d51 / ae9fca7 (juce/source/bass/dsp/{BassEngine,BassParams,BassPatches}).
// FableSynth is published under PolyForm Noncommercial 1.0.0. Its author, who
// also maintains NodeTool, contributes this code to NodeTool under NodeTool's
// licence (AGPL-3.0).
#pragma once

#include "audio/FadeCurves.h"
#include "audio/Mixer.h"
#include "audio/ParameterSmoother.h"
#include "model/TimelineTypes.h"

#include <array>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <optional>
#include <span>
#include <string_view>
#include <vector>

namespace nt::midi {

enum class BassWaveform : int {
    Saw = 0,
    Square = 1,
    Triangle = 2,
};

enum class BassSubShape : int {
    Sine = 0,
    Square = 1,
};

[[nodiscard]] std::string_view bassWaveformName(BassWaveform waveform) noexcept;
[[nodiscard]] std::optional<BassWaveform> tryParseBassWaveform(std::string_view name) noexcept;
[[nodiscard]] BassWaveform bassWaveformFromName(std::string_view name) noexcept;
[[nodiscard]] std::string_view bassSubShapeName(BassSubShape shape) noexcept;
[[nodiscard]] std::optional<BassSubShape> tryParseBassSubShape(std::string_view name) noexcept;
[[nodiscard]] BassSubShape bassSubShapeFromName(std::string_view name) noexcept;

// Complete parameter snapshot for the monophonic virtual-analog bass synth.
// No wavetables, no sequencer, no built-in FX.
struct BassSynthParams {
    // Oscillator
    BassWaveform waveform = BassWaveform::Saw;
    float pulseWidth = 0.5f;         // 0.05 .. 0.95 (Square PWM)
    int semitones = 0;               // -24 .. +24
    float fine = 0.0f;               // -100 .. +100 cents
    float oscLevel = 0.8f;           // 0 .. 1.2
    bool hardSync = false;           // master-to-slave hard sync
    float syncSemitones = 12.0f;     // 0 .. 36 semitones slave offset above master
    float analogDrift = 0.15f;       // 0 .. 1 subtle per-note pitch drift & phase randomness

    // Sub oscillator (1 octave down by default; -2 also supported for web preset parity)
    BassSubShape subShape = BassSubShape::Sine;
    int subOctave = -1;              // -2 .. -1
    float subLevel = 0.55f;          // 0 .. 1

    // 4-pole ZDF nonlinear ladder filter (2x oversampled, bass-compensated)
    float cutoffHz = 340.0f;         // 20 .. 18000 Hz
    float resonance = 0.62f;         // 0 .. 1 (self-oscillates near top of travel)
    float drive = 0.45f;             // 0 .. 1 pre-ladder analog saturation drive
    float filterEnvAmount = 2.8f;    // -5 .. +5 octaves
    float keyTrack = 0.30f;          // 0 .. 1 (reference MIDI 60)

    // Filter envelope (exponential analog curves)
    float filterAttackMs = 1.0f;     // 0.5 .. 500 ms
    float filterDecayMs = 180.0f;    // 5 .. 4000 ms
    float filterSustain = 0.0f;      // 0 .. 1
    float filterReleaseMs = 80.0f;   // 5 .. 2000 ms

    // Amp envelope (exponential analog curves)
    float attackMs = 1.0f;           // 0.5 .. 500 ms
    float decayMs = 300.0f;          // 5 .. 4000 ms
    float sustain = 0.5f;            // 0 .. 1
    float releaseMs = 80.0f;         // 5 .. 2000 ms

    // Accent, legato slide, mono voice mode, gentle output saturation
    float accentAmount = 0.70f;      // 0 .. 1
    int accentVelocity = 100;        // 1 .. 127 velocity threshold for accent
    float slideMs = 60.0f;           // 0 .. 500 ms constant-time legato glide
    bool retrigger = false;          // false = true legato (no env retrigger on overlap)
    float saturation = 0.25f;        // 0 .. 1 gentle output saturation stage
    float gainDb = -6.0f;            // -60 .. +12 dB output trim
};

// Monophonic virtual-analog bass synthesizer.
//
// DSP highlights:
// - Band-limited PolyBLEP/PolyBLAMP oscillators (Saw, PWM Square, Triangle),
//   hard sync with fractional subsample reset correction, sub oscillator (-1/-2 oct),
//   per-note pitch drift and free-running phase randomness on cold starts.
// - 2x oversampled 4-pole zero-delay-feedback (ZDF) nonlinear tanh transistor ladder
//   filter with self-oscillation pitch tracking and high-resonance bass compensation.
// - Exponential analog filter & amp envelopes, constant-time accent-aware 303 slide,
//   last-note-priority note stack, declicked retriggers, denormal protection,
//   and gentle output saturation.
//
// Ownership: owned by value inside `BassSynthProcessor` (or a test caller).
// All state lives inline (fixed-capacity note stack, zero heap allocations).
// Thread affinity: `prepare()` runs on the control / plan-build thread before audio
// publication. After publication, `reset()`, `setParams()`, `setParameter()`,
// `noteOn()`, `noteOff()`, `panic()`, and `renderBlock()` run on the audio render
// thread (serialized by MixRenderLease) with zero allocations, zero locks, and
// zero syscalls.
class BassSynth {
public:
    static constexpr int kMaxHeldNotes = 64;
    static constexpr double kKeyTrackRefNote = 60.0;

    enum class EventKind : std::uint8_t {
        NoteOff = 0,
        NoteOn = 1,
    };

    struct NoteEvent {
        int frameOffset = 0;          // 0-based frame within the current block
        EventKind kind = EventKind::NoteOn;
        int midiNote = 36;            // 0 .. 127
        float velocity = 0.78f;       // 0 .. 1 (used for NoteOn)
        float clipGain = 1.0f;        // linear clip gain multiplier
        std::uint64_t noteId = 0;     // 0 = match by midiNote; non-zero = per-note-instance ownership
    };

    BassSynth();

    // Control thread: prepares rate-dependent smoothers, filter/envelope constants,
    // and resets DSP state cleanly for `sampleRate` (44.1 / 48 / 96 kHz, etc.).
    void prepare(double sampleRate) noexcept;
    [[nodiscard]] double sampleRate() const noexcept { return sampleRate_; }

    // Real-time safe parameter control (no allocation, no lock).
    void setParams(const BassSynthParams& params) noexcept;
    void snapParams() noexcept;
    [[nodiscard]] const BassSynthParams& params() const noexcept { return params_; }
    bool setParameter(std::string_view name, double value) noexcept;

    // Deterministic PRNG seed for per-note analog drift & phase randomness.
    void setRngSeed(std::uint64_t seed) noexcept { rngState_ = seed != 0 ? seed : 0x9E3779B97F4A7C15ULL; }

    // Real-time safe voice control (sample-accurate when called via `renderBlock`).
    void noteOn(int midiNote, float velocity, float clipGain = 1.0f, std::uint64_t noteId = 0) noexcept;
    void noteOff(int midiNote, std::uint64_t noteId = 0) noexcept;
    void panic() noexcept;
    void reset() noexcept;

    // Adds interleaved stereo output (`stereo.size() == frames * 2`) into `stereo`,
    // splitting the block at each event's `frameOffset` for sample-accurate timing.
    // `events` must be sorted in non-decreasing `frameOffset` order.
    void renderBlock(std::span<float> stereo, std::span<const NoteEvent> events = {}) noexcept;

    // Renders `frameCount` frames starting at `startFrame` into `stereo` (additive).
    void renderFrames(std::span<float> stereo, std::size_t startFrame, std::size_t frameCount) noexcept;

    struct StageTelemetry {
        double maxSrc = 0.0;
        double maxLadderInput = 0.0;
        double maxLadderUOverVt = 0.0;
        double maxLadderState = 0.0;
        double maxLadderOut = 0.0;
        double maxVcaOut = 0.0;
        double maxSatInput = 0.0;
        double maxOutput = 0.0;
        std::uint64_t fastTanhClampHits = 0;
        std::uint64_t ladderClampHits = 0;
        std::uint64_t outputClampHits = 0;
        std::uint64_t satHardKneeHits = 0;
    };

    // Inspection helpers (audio thread or offline tests, read-only).
    [[nodiscard]] int activeMidiNote() const noexcept { return heldCount_ > 0 ? held_[static_cast<std::size_t>(heldCount_ - 1)].midiNote : -1; }
    [[nodiscard]] std::uint64_t activeNoteId() const noexcept { return heldCount_ > 0 ? held_[static_cast<std::size_t>(heldCount_ - 1)].noteId : 0; }
    [[nodiscard]] int heldNoteCount() const noexcept { return heldCount_; }
    [[nodiscard]] double currentPitchNote() const noexcept { return currentNote_; }
    [[nodiscard]] bool isGateOpen() const noexcept { return gate_; }
    [[nodiscard]] bool isAccented() const noexcept { return accented_; }
    [[nodiscard]] double ampEnvelopeLevel() const noexcept { return ampLevel_; }
    [[nodiscard]] double filterEnvelopeLevel() const noexcept { return fltEnvLevel_; }
    [[nodiscard]] bool hasActiveSound() const noexcept;
    void setTelemetryEnabled(bool enabled) noexcept { telemetryEnabled_ = enabled; }
    void resetTelemetry() noexcept { telemetry_ = {}; }
    [[nodiscard]] const StageTelemetry& telemetry() const noexcept { return telemetry_; }

private:
    struct HeldNote {
        int midiNote = 36;
        float velocity = 0.78f;
        bool accented = false;
        float clipGain = 1.0f;
        std::uint64_t noteId = 0;
    };

    enum class EnvStage : std::uint8_t { Idle = 0, Attack = 1, Decay = 2, Sustain = 3, Release = 4 };

    // 4-pole zero-delay-feedback nonlinear transistor ladder filter (runs at 2x rate).
    struct LadderState {
        std::array<double, 4> s{};
        std::array<double, 4> y{};
        void reset() noexcept {
            s.fill(0.0);
            y.fill(0.0);
        }
    };

    // 15-tap linear-phase Kaiser-windowed (beta = 7.5) half-band FIR downsampler (4x -> 2x).
    // 4 symmetric odd tap pairs + center tap 0.5 -> >85 dB stopband attenuation in the
    // 4x->2x alias band (0.375..0.50 of 4x rate), zero allocation.
    struct FastHalfBandDownsampler {
        static constexpr int kNumOddPairs = 4;
        static constexpr int kTaps = 15;
        static constexpr int kRingSize = 32;
        static constexpr int kRingMask = kRingSize - 1;

        std::array<double, kNumOddPairs> coeffs{};
        double centerCoeff = 0.5;
        std::array<double, kRingSize> ring{};
        int writePos = 0;

        void init() noexcept;
        void reset() noexcept {
            ring.fill(0.0);
            writePos = 0;
        }
        [[nodiscard]] double processPair(double x0, double x1) noexcept;
    };

    // 47-tap linear-phase Kaiser-windowed (beta = 7.5) half-band FIR downsampler (2x -> 1x).
    // 12 symmetric odd tap pairs + center tap 0.5 -> ~78 dB stopband attenuation,
    // flat passband to ~19 kHz @ 48 kHz, unconditionally stable, zero allocation.
    struct HalfBandDownsampler {
        static constexpr int kNumOddPairs = 12;
        static constexpr int kTaps = 47;
        static constexpr int kRingSize = 64;  // power of 2 for bitmask indexing
        static constexpr int kRingMask = kRingSize - 1;

        std::array<double, kNumOddPairs> coeffs{};
        double centerCoeff = 0.5;
        std::array<double, kRingSize> ring{};
        int writePos = 0;

        void init() noexcept;
        void reset() noexcept {
            ring.fill(0.0);
            writePos = 0;
        }
        [[nodiscard]] double processPair(double x0, double x1) noexcept;
    };

    void triggerFreshNote(const HeldNote& note, bool wasSilent) noexcept;
    void glideToNote(const HeldNote& note, bool retriggerEnvs) noexcept;
    void releaseGate() noexcept;
    void updateRateDependentConstants() noexcept;
    void updateEnvelopeCoefs() noexcept;
    void updateSmoothingTargets() noexcept;
    [[nodiscard]] double nextRandomUniform() noexcept;
    [[nodiscard]] double nextRandomBipolar() noexcept;
    [[nodiscard]] double processLadderSample(double x, double g, double k, double drive, double driveGain, double driveComp) noexcept;
    [[nodiscard]] double renderOscSample(double masterDt, double slaveDt, double pw, BassWaveform wave, bool hardSync) noexcept;
    [[nodiscard]] double renderSubSample(double subDt, BassSubShape shape) noexcept;
    void stepEnvelopes(double fltSustain) noexcept;

    BassSynthParams params_{};
    double sampleRate_ = 48000.0;
    double osSampleRate_ = 96000.0;
    bool prepared_ = false;

    // Parameter smoothers (log2 domain for cutoff, linear for others).
    audio::ParameterSmoother cutoffLog2Sm_;
    audio::ParameterSmoother resSm_;
    audio::ParameterSmoother driveSm_;
    audio::ParameterSmoother envAmtSm_;
    audio::ParameterSmoother subLevelSm_;
    audio::ParameterSmoother oscLevelSm_;
    audio::ParameterSmoother pwSm_;
    audio::ParameterSmoother syncSemiSm_;
    audio::ParameterSmoother satSm_;
    audio::ParameterSmoother gainLinSm_;
    audio::ParameterSmoother fltSustainSm_;
    audio::ParameterSmoother keyTrackSm_;
    audio::ParameterSmoother fineSm_;
    audio::ParameterSmoother accentAmtSm_;

    // Voice / note stack state (inline fixed array: zero allocations).
    std::array<HeldNote, kMaxHeldNotes> held_{};
    int heldCount_ = 0;
    bool gate_ = false;
    bool accented_ = false;
    double targetNote_ = 36.0;
    double currentNote_ = 36.0;
    bool pitchDeclickActive_ = false;
    double noteDriftCents_ = 0.0;
    double targetDriftCents_ = 0.0;
    double wanderPhase_ = 0.0;
    double velocity_ = 0.78;
    double clipGain_ = 1.0;

    // Envelopes & declick smoothers.
    EnvStage ampStage_ = EnvStage::Idle;
    double ampLevel_ = 0.0;
    double ampSm_ = 0.0;
    EnvStage fltStage_ = EnvStage::Idle;
    double fltEnvLevel_ = 0.0;
    double effCutLog2Sm_ = 8.409;
    bool effCutInitialized_ = false;
    double accentLevelSm_ = 0.0;
    double gainModSm_ = 1.0;
    double clipGainSm_ = 1.0;
    double prevVcaGain_ = 0.0;
    bool gainInitialized_ = false;

    // Rate-derived smoothing and cached envelope/slide coefficients.
    double ampSlewCoef_ = 0.1;
    double gainSlewCoef_ = 0.01;
    double accentSlewCoef_ = 0.01;
    double cutoffSlewCoef_ = 0.01;
    double pitchDeclickCoef_ = 0.01;
    double driftSlewCoef_ = 0.01;
    double dcR_ = 0.9995;
    double ampAttCoef_ = 0.05;
    double ampDecCoef_ = 0.001;
    double ampRelCoef_ = 0.001;
    double fltAttCoef_ = 0.05;
    double fltDecBaseCoef_ = 0.001;
    double fltRelCoef_ = 0.001;
    double slideCoef_ = 0.001;

    // Cached steady-state transcendental ratios to avoid per-sample pow/exp2.
    double lastDrive_ = -1.0;
    double lastDriveComp_ = 1.0;
    double lastTuneOffset_ = 0.0;
    double lastInvTuneRatio_ = 1.0;
    double lastSyncSemi_ = 0.0;
    double lastSyncRatio_ = 1.0;

    // Oscillator phases & 1-sample lookahead for band-limited hard sync.
    double masterPhase_ = 0.0;
    double slavePhase_ = 0.0;
    double subPhase_ = 0.0;
    double oscPendingSample_ = 0.0;
    bool oscPendingValid_ = false;

    // Ladder filter, 4x->2x->1x half-band downsamplers, DC blocker.
    LadderState ladder_{};
    FastHalfBandDownsampler downsampler4x_{};
    HalfBandDownsampler downsampler_{};
    int downsamplerTailFrames_ = 0;
    double dcX_ = 0.0;
    double dcY_ = 0.0;

    // Deterministic xorshift64* PRNG state.
    std::uint64_t rngState_ = 0xD1B54A32D192ED03ULL;

    // Optional inline stage telemetry for offline/test diagnostics (zero allocations).
    bool telemetryEnabled_ = false;
    StageTelemetry telemetry_{};
};

// Timeline BlockProcessor wrapping BassSynth for MIDI tracks with
// `instrument.type == "bass"`, matching SubtractiveInstrumentProcessor's contract.
//
// Ownership: owned by MixPlan's TrackPlan::processors vector (`std::shared_ptr`
// matching the BlockProcessor registry interface). Owns `synth_` and `events_`
// by value.
// Thread affinity: constructed and prepared on the control / plan-build thread
// and destroyed there after renderer retirement. After publication,
// MixRenderLease serializes `process()`, `reset()`, and `setParameter()` on the
// render thread with zero allocations, zero locks, and zero syscalls.
class BassSynthProcessor final : public audio::BlockProcessor {
public:
    BassSynthProcessor(const Timeline& timeline, const Track& track);
    ~BassSynthProcessor() override = default;
    BassSynthProcessor(const BassSynthProcessor&) = delete;
    BassSynthProcessor& operator=(const BassSynthProcessor&) = delete;

    void prepare(double rate) override;
    void reset() noexcept override;
    bool hasPendingOutput(int) const noexcept override;
    bool setParameter(std::string_view name, double value) noexcept override;
    void process(std::span<float> stereo, const audio::BlockContext& context) noexcept override;

    [[nodiscard]] const BassSynth& synth() const noexcept { return synth_; }

private:
    struct ScheduledEvent {
        double timeMs = 0.0;
        BassSynth::EventKind kind = BassSynth::EventKind::NoteOn;
        int midiNote = 36;
        float velocity = 0.78f;
        double clipStartMs = 0.0;
        double clipDurationMs = 0.0;
        float clipGain = 1.0f;
        audio::ResolvedFades fades{};
        std::uint64_t noteId = 0;
    };

    struct NoteInterval {
        double startMs = 0.0;
        double offMs = 0.0;
        int midiNote = 36;
        float velocity = 0.78f;
        double clipStartMs = 0.0;
        double clipDurationMs = 0.0;
        float clipGain = 1.0f;
        audio::ResolvedFades fades{};
        std::uint64_t noteId = 0;
    };

    struct HeldClipMeta {
        std::uint64_t noteId = 0;
        double clipStartMs = 0.0;
        double clipDurationMs = 0.0;
        audio::ResolvedFades fades{};
    };

    void pushHeldClip(std::uint64_t noteId, double clipStartMs, double clipDurationMs,
                      const audio::ResolvedFades& fades) noexcept;
    void popHeldClip(std::uint64_t noteId) noexcept;
    void chaseAt(double timeMs) noexcept;

    BassSynth synth_;
    std::vector<ScheduledEvent> events_;
    std::vector<NoteInterval> intervals_;
    std::size_t next_ = 0;
    double expectedMs_ = std::numeric_limits<double>::quiet_NaN();
    std::array<HeldClipMeta, BassSynth::kMaxHeldNotes> heldClips_{};
    int heldClipCount_ = 0;
    double activeClipStartMs_ = 0.0;
    double activeClipDurationMs_ = 0.0;
    audio::ResolvedFades activeFades_{};
    bool hasActiveClipFades_ = false;
};

}  // namespace nt::midi
