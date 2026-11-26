// Ported from RipplerX (https://github.com/tiagolr/ripplerx) at commit 11683a6.
// Copyright (C) 2025 tiagolr (tilr) — GNU General Public License v3.0 (GPL-3.0).
// Compatible with NodeTool's AGPL-3.0; see native/timeline/licenses/GPL-3.0.txt.
//
// OutputLimiter additionally incorporates the FairlyChildish limiter port:
// Copyright 2006, Thomas Scott Stillwell (BSD 3-Clause license; full notice below).
#pragma once

#include "audio/FadeCurves.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <numbers>
#include <optional>
#include <string_view>
#include <tuple>
#include <vector>

namespace nt::midi::modal {

inline constexpr int kMaxPolyphony = 16;
inline constexpr int kMaxPartials = 64;
inline constexpr int kModelCount = 12;
inline constexpr std::size_t kLutSize = 4096;
inline constexpr std::size_t kRatioTableKnots = 129;
inline constexpr std::size_t kSerialSplitKnots = 5;
inline constexpr std::array<double, kSerialSplitKnots> kSerialSplitValues = {1.0, 25.0, 50.0, 75.0, 100.0};
inline constexpr int kWaveguideMaxLen = 20000;
inline constexpr double kBendGlideMs = 2.0;
inline constexpr double kRepeatNoteFadeMs = 1.0;
inline constexpr double kDenormalFloor = 1.0e-24;

struct ModalSynthTestPeer;

[[nodiscard]] inline double flushDenormal(double v) noexcept {
    return (std::abs(v) < kDenormalFloor || !std::isfinite(v)) ? 0.0 : v;
}

// Modal resonator model indices matching RipplerX `ModalModels`.
enum class ModalModel : int {
    String = 0,
    Beam = 1,
    Squared = 2,
    Membrane = 3,
    Plate = 4,
    Drumhead = 5,
    Marimba = 6,
    OpenTube = 7,
    ClosedTube = 8,
    Marimba2 = 9,
    Bell = 10,
    Djembe = 11,
};

enum class NoiseFilterMode : int {
    LowPass = 0,
    BandPass = 1,
    HighPass = 2,
};

enum class ModalCoupling : int {
    Parallel = 0,  // A + B
    Serial = 1,    // A -> B with eigenvalue frequency splitting
};

[[nodiscard]] std::string_view modalModelName(ModalModel model) noexcept;
[[nodiscard]] std::optional<ModalModel> tryModalModelFromName(std::string_view name) noexcept;
[[nodiscard]] ModalModel modalModelFromName(std::string_view name) noexcept;
[[nodiscard]] std::string_view modalModelLabel(ModalModel model) noexcept;
[[nodiscard]] bool isWaveguideModel(ModalModel model) noexcept;
[[nodiscard]] inline bool modelUsesRatio(ModalModel model) noexcept {
    return model == ModalModel::Beam || model == ModalModel::Membrane ||
           model == ModalModel::Plate || model == ModalModel::Djembe;
}
[[nodiscard]] double defaultRatioForModel(ModalModel model) noexcept;

[[nodiscard]] std::string_view noiseFilterModeName(NoiseFilterMode mode) noexcept;
[[nodiscard]] std::optional<NoiseFilterMode> tryNoiseFilterModeFromName(std::string_view name) noexcept;
[[nodiscard]] NoiseFilterMode noiseFilterModeFromName(std::string_view name) noexcept;

[[nodiscard]] std::string_view modalCouplingName(ModalCoupling coupling) noexcept;
[[nodiscard]] std::optional<ModalCoupling> tryModalCouplingFromName(std::string_view name) noexcept;
[[nodiscard]] ModalCoupling modalCouplingFromName(std::string_view name) noexcept;

[[nodiscard]] int sanitizePartialCount(int count) noexcept;

// RipplerX JUCE NormalisableRange(0, 1, 0.0001, 0.3) skew helpers for noise mix/res.
[[nodiscard]] inline double skewToNorm(double value, double skew = 0.3) noexcept {
    const double clamped = std::clamp(value, 0.0, 1.0);
    return clamped <= 0.0 ? 0.0 : std::pow(clamped, skew);
}

[[nodiscard]] inline double normToSkew(double norm, double skew = 0.3) noexcept {
    const double clamped = std::clamp(norm, 0.0, 1.0);
    return clamped <= 0.0 ? 0.0 : std::pow(clamped, 1.0 / skew);
}

// Fixed-capacity inline lookup table with linear and cubic interpolation.
// Ownership: owned by value inside ModalSynth (zero heap allocations, zero global state).
// Thread affinity: initialized on the control thread in prepare(), read-only on render thread.
class ModalLookupTable {
public:
    ModalLookupTable() = default;

    template <typename Func>
    void init(Func fn, double minVal, double maxVal) noexcept {
        min_ = minVal;
        max_ = maxVal > minVal ? maxVal : (minVal + 1.0);
        scaler_ = static_cast<double>(kLutSize - 1) / (max_ - min_);
        offset_ = -min_ * scaler_;
        for (std::size_t i = 0; i < kLutSize; ++i) {
            const double t = static_cast<double>(i) / static_cast<double>(kLutSize - 1);
            const double x = std::clamp(min_ + t * (max_ - min_), min_, max_);
            values_[i] = fn(x);
        }
        initialized_ = true;
    }

    [[nodiscard]] double operator()(double input) const noexcept {
        if (!initialized_) return 0.0;
        const double x = std::clamp(input, min_, max_);
        const double normIdx = x * scaler_ + offset_;
        const std::size_t idx = static_cast<std::size_t>(std::max(0.0, std::floor(normIdx)));
        if (idx >= kLutSize - 1) return values_[kLutSize - 1];
        const double frac = normIdx - static_cast<double>(idx);
        return values_[idx] + frac * (values_[idx + 1] - values_[idx]);
    }

    [[nodiscard]] bool initialized() const noexcept { return initialized_; }

private:
    std::array<double, kLutSize> values_{};
    double min_ = 0.0;
    double max_ = 1.0;
    double scaler_ = 0.0;
    double offset_ = 0.0;
    bool initialized_ = false;
};

// Direct-form-1 RBJ biquad filter (port of RipplerX Filter.{h,cpp}).
// Ownership: owned by value inside ImpulseMallet, NoiseExciter, and ModalResonator.
// Thread affinity: audio render thread (serialized by MixRenderLease) or control thread before publication.
class BiquadFilter {
public:
    void lp(double srate, double freq, double q) noexcept;
    void bp(double srate, double freq, double q) noexcept;
    void hp(double srate, double freq, double q) noexcept;
    void clear(double input = 0.0) noexcept;
    [[nodiscard]] double df1(double sample) noexcept;
    void copyCoeffs(const BiquadFilter& src) noexcept;
    void resetDiagnostics() noexcept {
        nonFiniteCount = 0;
        maxRawAbs = 0.0;
    }

    std::uint64_t nonFiniteCount = 0;
    double maxRawAbs = 0.0;

private:
    double a1_ = 0.0;
    double a2_ = 0.0;
    double b0_ = 1.0;
    double b1_ = 0.0;
    double b2_ = 0.0;
    double x0_ = 0.0;
    double x1_ = 0.0;
    double y0_ = 0.0;
    double y1_ = 0.0;
};

// ADSR envelope with per-stage tension/shape controls (port of RipplerX Envelope.{h,cpp}).
// Ownership: owned by value inside NoiseExciter.
// Thread affinity: audio render thread (serialized by MixRenderLease) or control thread before publication.
class TensionEnvelope {
public:
    static constexpr int kStateOff = 0;
    static constexpr int kStateAttack = 1;
    static constexpr int kStateDecay = 2;
    static constexpr int kStateSustain = 4;
    static constexpr int kStateRelease = 8;

    void init(double srate, double attackMs, double decayMs, double sustainDb,
              double releaseMs, double tensionA, double tensionD, double tensionR) noexcept;
    void reset() noexcept;
    void attack(double scale) noexcept;
    void decay() noexcept;
    void sustain() noexcept;
    void release() noexcept;
    int process() noexcept;

    [[nodiscard]] double level() const noexcept { return env_; }
    [[nodiscard]] int state() const noexcept { return state_; }

private:
    [[nodiscard]] static double normalizeTension(double t) noexcept;
    [[nodiscard]] static std::pair<double, double> calcCoefs(
        double targetB1, double targetB2, double targetC,
        double rate, double tension, double mult) noexcept;
    void recalcCoefs() noexcept;

    double att_ = 48.0;
    double dec_ = 24000.0;
    double sus_ = 0.001;
    double rel_ = 24000.0;
    double scale_ = 1.0;
    double env_ = 0.0;
    int state_ = kStateOff;

    double ab_ = 0.0;
    double ac_ = 0.0;
    double db_ = 0.0;
    double dc_ = 0.0;
    double rb_ = 0.0;
    double rc_ = 0.0;
    double ta_ = 100.0;
    double td_ = 100.0;
    double tr_ = 100.0;
};

// Impulse mallet exciter (port of RipplerX Mallet.{h,cpp}, impulse mode).
// Ownership: owned by value inside ModalVoice.
// Thread affinity: audio render thread (serialized by MixRenderLease) or control thread before publication.
class ImpulseMallet {
public:
    void trigger(double srate, double freqHz) noexcept;
    void clear() noexcept;
    [[nodiscard]] double process() noexcept;
    [[nodiscard]] bool active() const noexcept { return countdown_ > 0; }

private:
    double impulse_ = 0.0;
    int countdown_ = 0;
    double env_ = 0.0;
    BiquadFilter filter_{};
};

// Filtered noise exciter with tension ADSR envelope and oscillator filter path
// (port of RipplerX Noise.{h,cpp} with deterministic xorshift64* PRNG).
// Ownership: owned by value inside ModalVoice.
// Thread affinity: audio render thread (serialized by MixRenderLease) or control thread before publication.
class NoiseExciter {
public:
    void init(double srate, NoiseFilterMode filterMode, double freqHz, double q,
              double attMs, double decMs, double sus, double relMs,
              double velFreq, double velQ,
              double attTen, double decTen, double relTen,
              double velAtt, double velDec, double velSus, double velRel) noexcept;
    void attack(double vel) noexcept;
    void release() noexcept;
    void clear() noexcept;
    [[nodiscard]] double process(std::uint64_t& rngState) noexcept;
    [[nodiscard]] double processOsc(double input) noexcept;
    [[nodiscard]] bool active() const noexcept { return env_.state() != TensionEnvelope::kStateOff; }

private:
    void initFilter() noexcept;
    void initEnvelope() noexcept;

    double srate_ = 48000.0;
    NoiseFilterMode fmode_ = NoiseFilterMode::HighPass;
    double freq_ = 20.0;
    double q_ = 0.707;
    double vel_ = 0.0;
    double velFreq_ = 0.0;
    double velQ_ = 0.0;

    double att_ = 1.0;
    double dec_ = 500.0;
    double sus_ = 0.0;
    double rel_ = 500.0;
    double attTen_ = 0.4;
    double decTen_ = 0.4;
    double relTen_ = 0.4;
    double velAtt_ = 0.0;
    double velDec_ = 0.0;
    double velSus_ = 0.0;
    double velRel_ = 0.0;

    bool filterActive_ = false;
    TensionEnvelope env_{};
    BiquadFilter filter_{};
    BiquadFilter oscFilter_{};
};

// Precomputed 64-partial ratio and gain tables for all 12 RipplerX models
// (port of RipplerX Models.{h,cpp}).
// Ownership: owned by value inside ModalSynth (zero heap allocations).
// Thread affinity: recalculated off the audio thread on structural changes or in-place
// on the render thread when ratio changes via setParameter().
class ModalModels {
public:
    ModalModels() noexcept;

    [[nodiscard]] const std::array<double, kMaxPartials>& ratios(bool isA, ModalModel model) const noexcept;
    [[nodiscard]] const std::array<double, kMaxPartials>& gains(ModalModel model) const noexcept;

    void recalcBeam(bool isA, double ratio) noexcept;
    void recalcMembrane(bool isA, double ratio) noexcept;
    void recalcPlate(bool isA, double ratio) noexcept;
    void calcDjembe(double freqHz, double ratio, std::array<double, kMaxPartials>& out) const noexcept;

    [[nodiscard]] static const std::array<double, kMaxPartials>& bFreeRoots() noexcept;

private:
    std::array<std::array<double, kMaxPartials>, kModelCount> aModels_{};
    std::array<std::array<double, kMaxPartials>, kModelCount> bModels_{};
    std::array<std::array<double, kMaxPartials>, 3> modelGains_{};
};

// Precomputed immutable ratio lookup tables for ratio-dependent modal models
// (Beam, Membrane, Plate) across r in [0.1, 10.0].
// Ownership: owned via `std::unique_ptr` inside `ModalSynth` (allocated once in ctor).
// Thread affinity: initialized once on the control thread in `ModalSynth::prepare()`,
// strictly read-only on the audio render thread with zero allocations.
class ModalRatioTables {
public:
    ModalRatioTables() = default;

    void init() noexcept;
    void lookup(ModalModel model, double ratio, std::array<double, kMaxPartials>& out) const noexcept;
    [[nodiscard]] bool initialized() const noexcept { return initialized_; }

private:
    std::array<std::array<double, kMaxPartials>, kRatioTableKnots> beam_{};
    std::array<std::array<double, kMaxPartials>, kRatioTableKnots> membrane_{};
    std::array<std::array<double, kMaxPartials>, kRatioTableKnots> plate_{};
    bool initialized_ = false;
};

// Precomputed immutable table snapshot exchanged via triple-buffering between
// control-thread preparation and the audio render thread (zero allocations on audio thread).
// Ownership: owned via `std::unique_ptr` inside `ModalSynth`'s 3-slot snapshot pool.
// Thread affinity: written only in an inactive slot on the control thread, strictly
// read-only from the published active slot on the audio render thread.
struct ModalTableSnapshot {
    ModalModels models{};
    std::uint64_t generation = 0;
    std::uint64_t requestSeq = 0;
    bool fromLiveRequest = false;
    ModalModel aModel = ModalModel::String;
    ModalModel bModel = ModalModel::String;
    int aPartials = 32;
    int bPartials = 32;
    ModalCoupling coupling = ModalCoupling::Parallel;
    bool aOn = true;
    bool bOn = false;
    double aRatio = 0.78;
    double bRatio = 0.78;
    double aPitchFactor = 1.0;
    double bPitchFactor = 1.0;
    double split = 1.0;
    bool serialShiftsValid = false;
    bool serialDeltasValid = false;
    std::array<std::array<double, kMaxPartials>, 128> serialA{};
    std::array<std::array<double, kMaxPartials>, 128> serialB{};
    std::array<std::array<std::array<float, kMaxPartials>, 128>, kSerialSplitKnots> serialDeltaA{};
    std::array<std::array<std::array<float, kMaxPartials>, 128>, kSerialSplitKnots> serialDeltaB{};
};

// Second-order resonant modal partial filter (port of RipplerX Partial.{h,cpp}).
// Ownership: owned by value inside ModalResonator.
// Thread affinity: audio render thread (serialized by MixRenderLease) or control thread before publication.
class ModalPartial {
public:
    friend struct ModalSynthTestPeer;

    void setIndex(int oneBasedK) noexcept { k = oneBasedK; }
    void update(double f0, double ratio, double ratioMax, double vel,
                double pitchBend, bool isRelease,
                const ModalLookupTable* a1Lut = nullptr) noexcept;
    void applyGain(double gain) noexcept;
    void applyPitchBend(double pitchBend, const ModalLookupTable& a1Lut) noexcept;
    [[nodiscard]] inline double process(double input) noexcept {
        if (outOfRange) return 0.0;
        const double output = (b0Norm * input + b2Norm * x2) - (a1Norm * y1 + a2Norm * y2);
        x2 = x1;
        x1 = input;
        y2 = y1;
        if (!std::isfinite(output)) [[unlikely]] {
            ++nonFiniteCount;
            y1 = 0.0;
            return 0.0;
        }
        const double absOut = std::abs(output);
        if (absOut > maxRawAbs) maxRawAbs = absOut;
        y1 = (absOut < kDenormalFloor) ? 0.0 : output;
        return y1;
    }
    void clear() noexcept;
    void resetDiagnostics() noexcept {
        nonFiniteCount = 0;
        maxRawAbs = 0.0;
    }

    double srate = 48000.0;
    int k = 1;
    double decay = 1.0;
    double damp = 0.0;
    double tone = 0.0;
    double hit = 0.26;
    double rel = 1.0;
    double inharm = 0.0001;
    double velDecay = 0.0;
    double velHit = 0.0;
    double velInharm = 0.0;
    double velDamp = 0.0;
    double velTone = 0.0;

    double f_k = 1000.0;
    bool outOfRange = false;
    std::uint64_t nonFiniteCount = 0;
    double maxRawAbs = 0.0;

private:
    double baseFk_ = 1000.0;
    double poleRadius_ = 0.0;
    double b0Norm = 0.0;
    double b2Norm = 0.0;
    double a1Norm = 0.0;
    double a2Norm = 0.0;

    double lastF0_ = 440.0;
    double lastRatio_ = 1.0;
    double lastRatioMax_ = 1.0;
    double lastVel_ = 0.0;
    double lastGain_ = 1.0;
    bool lastIsRelease_ = false;
    bool coeffsValid_ = false;

    double x1 = 0.0;
    double x2 = 0.0;
    double y1 = 0.0;
    double y2 = 0.0;
};

// Digital waveguide resonator for OpenTube and ClosedTube models (port of RipplerX Waveguide.{h,cpp}).
// Ownership: owns its pre-allocated delay line buffer (`std::vector<double>`) allocated once in constructor.
// Thread affinity: constructed on control thread; `process()`, `update()`, `applyPitchBend()`, `clear()`
// run on the audio render thread with zero allocations.
class ModalWaveguide {
public:
    friend struct ModalSynthTestPeer;

    ModalWaveguide();

    void update(double f0, double vel, double pitchBend, bool isRelease) noexcept;
    void applyPitchBend(double pitchBend) noexcept;
    [[nodiscard]] double process(double input) noexcept;
    void clear() noexcept;
    void resetDiagnostics() noexcept {
        nonFiniteCount = 0;
        clampCount = 0;
        maxRawAbs = 0.0;
    }

    double baseFreq = 440.0;
    bool isClosed = false;
    double srate = 48000.0;
    double decay = 1.0;
    double radius = 0.5;
    double rel = 1.0;
    double velDecay = 0.0;
    double f_k = 440.0;
    std::uint64_t nonFiniteCount = 0;
    std::uint64_t clampCount = 0;
    double maxRawAbs = 0.0;

private:
    void updateDelayAndFilter() noexcept;

    double readPtrFrac_ = 0.0;
    int writePtr_ = 0;
    double tubeDecay_ = 0.0;
    double rEff_ = 0.5;
    double lastDecayK_ = 1.0;
    double y_ = 0.0;
    double y1_ = 0.0;
    std::vector<double> tube_;
};

// Resonator bank holding 64 ModalPartials, one ModalWaveguide, and a post-LP/HP cut filter
// (port of RipplerX Resonator.{h,cpp}).
// Ownership: owned by value inside ModalVoice.
// Thread affinity: audio render thread (serialized by MixRenderLease) or control thread before publication.
class ModalResonator {
public:
    ModalResonator();

    void setParams(double srate, bool on, ModalModel model, int partials, double decay,
                   double damp, double tone, double hit, double rel, double inharm,
                   double cut, double radius, double velDecay, double velHit,
                   double velInharm, double velDamp, double velTone) noexcept;
    void activate() noexcept;
    void update(double frequency, double vel, bool isRelease, double pitchBend,
                const std::array<double, kMaxPartials>& model,
                const std::array<double, kMaxPartials>& modelGain,
                const ModalLookupTable* a1Lut = nullptr) noexcept;
    void applyPitchBend(double bend, const ModalLookupTable& a1Lut) noexcept;
    [[nodiscard]] double process(double x) noexcept;
    void clear() noexcept;

    int silence = 0;
    bool active = false;
    double srate = 48000.0;
    bool on = false;
    ModalModel model = ModalModel::String;
    int npartials = 32;
    double decay = 1.0;
    double radius = 0.5;
    double cut = 0.0;

    std::array<ModalPartial, kMaxPartials> partials{};
    ModalWaveguide waveguide{};
    BiquadFilter filter{};
};

// Per-voice clip gain and fade envelope (allows overlapping clips on one MIDI track
// to keep independent fade-in/fade-out envelopes without muting each other).
struct VoiceClipEnvelope {
    float clipGain = 1.0f;
    double clipStartMs = 0.0;
    double clipDurationMs = 0.0;
    audio::ResolvedFades fades{};
    bool hasFades = false;
};

// Single polyphonic voice holding mallet, noise exciter, resonators A and B, and serial coupling
// frequency-split logic (port of RipplerX Voice.{h,cpp}).
// Ownership: owned by value inside ModalSynth's fixed voice array.
// Thread affinity: audio render thread (serialized by MixRenderLease) or control thread before publication.
class ModalVoice {
public:
    ModalVoice() = default;

    [[nodiscard]] static double noteToFreq(int midiNote) noexcept;
    static void computeSerialShifts(double freqHz, double splitVal,
                                    const std::array<double, kMaxPartials>& aIn,
                                    const std::array<double, kMaxPartials>& bIn,
                                    std::array<double, kMaxPartials>& aOut,
                                    std::array<double, kMaxPartials>& bOut,
                                    const ModalLookupTable* sinLut = nullptr) noexcept;
    static void computeSerialShiftsMultiSplit(
        double freqHz, double exactSplitVal,
        const std::array<double, kMaxPartials>& aIn,
        const std::array<double, kMaxPartials>& bIn,
        std::array<double, kMaxPartials>& aExactOut,
        std::array<double, kMaxPartials>& bExactOut,
        std::array<std::array<float, kMaxPartials>, kSerialSplitKnots>& aDeltaOut,
        std::array<std::array<float, kMaxPartials>, kSerialSplitKnots>& bDeltaOut,
        const ModalLookupTable* sinLut = nullptr) noexcept;

    void trigger(std::uint64_t timestamp, double srate, int midiNote, double velocity,
                 double malletFreq, bool skipFadeout, const VoiceClipEnvelope& clipEnvelope,
                 std::uint64_t instanceId, const ModalTableSnapshot& snapshot,
                 const ModalRatioTables* ratioTables = nullptr) noexcept;
    void triggerStart(bool resetResonators, const ModalTableSnapshot& snapshot,
                      const ModalRatioTables* ratioTables = nullptr) noexcept;
    [[nodiscard]] double fadeOut(const ModalTableSnapshot& snapshot,
                                 const ModalRatioTables* ratioTables = nullptr) noexcept;
    void release(std::uint64_t timestamp, const ModalTableSnapshot& snapshot,
                 const ModalRatioTables* ratioTables = nullptr) noexcept;
    void clear() noexcept;

    void setPitch(double aCoarse, double bCoarse, double aFine, double bFine, double pitchBend) noexcept;
    void setRatio(double aRatio, double bRatio) noexcept;
    void setCoupling(ModalCoupling coupling, double split) noexcept;
    void markRatiosDirty() noexcept { ratiosDirty_ = true; }
    void applyPitchBend(double bend, const ModalLookupTable& a1Lut) noexcept;
    void updateResonators(const ModalTableSnapshot& snapshot, bool recomputeRatios = true,
                          const ModalLookupTable* a1Lut = nullptr,
                          const ModalRatioTables* ratioTables = nullptr) noexcept;
    [[nodiscard]] double processOscillators(bool isA, const ModalLookupTable& sinLut) noexcept;

    [[nodiscard]] bool isSounding() const noexcept {
        return isPressed || isFading || mallet.active() || noise.active() ||
               (resA.on && resA.active) || (resB.on && resB.active);
    }

    int note = -1;
    std::uint64_t noteId = 0;
    double freq = 440.0;
    double vel = 0.0;
    VoiceClipEnvelope clipEnv{};
    bool isRelease = true;
    bool isPressed = false;
    bool sustainedReleasePending = false;
    bool fadeInWithSwap = false;
    ModalCoupling coupling = ModalCoupling::Parallel;
    double split = 1.0;
    double srate = 48000.0;
    double aRatio = 0.78;
    double bRatio = 0.78;
    std::uint64_t pressedTs = 0;
    std::uint64_t releaseTs = 0;

    bool isFading = false;
    int fadeTotalSamples = 0;
    int fadeSamples = 0;
    double malletFreq = 600.0;
    double newFreq = 440.0;
    double newVel = 0.0;
    int newNote = -1;
    std::uint64_t newNoteId = 0;
    VoiceClipEnvelope newClipEnv{};
    bool pendingRelease = false;
    std::uint64_t pendingReleaseTs = 0;

    double aPitchFactor = 1.0;
    double bPitchFactor = 1.0;
    double pitchBend = 1.0;

    ImpulseMallet mallet{};
    NoiseExciter noise{};
    ModalResonator resA{};
    ModalResonator resB{};

private:
    static void applyPitch(std::array<double, kMaxPartials>& model, double factor) noexcept;
    [[nodiscard]] static double freqShift(double fa, double fb, double splitVal,
                                          const ModalLookupTable* sinLut) noexcept;

    std::array<double, kMaxPartials> cachedAModel_{};
    std::array<double, kMaxPartials> cachedBModel_{};
    bool ratiosDirty_ = true;

    std::array<double, kMaxPartials> aPhases_{};
    std::array<double, kMaxPartials> bPhases_{};
};

// 20 ms comb stereoizer (port of RipplerX Comb.h).
// Ownership: owns its pre-allocated delay line buffer resized only in init() on the control thread.
// Thread affinity: init() on control thread; process()/clear() on render thread with zero allocations.
class CombStereoizer {
public:
    CombStereoizer();

    void init(double srate) noexcept;
    void clear() noexcept;
    [[nodiscard]] int delayLen() const noexcept { return delayLen_; }
    [[nodiscard]] std::pair<double, double> process(double input) noexcept;

private:
    static constexpr int kMaxDelaySamples = 8192;  // Covers 20 ms up to > 400 kHz
    int pos_ = 0;
    int delayLen_ = 960;
    std::vector<double> buf_;
};

// Port of RipplerX Limiter.h (FairlyChildish limiter for Reaper).
//
// Copyright 2006, Thomas Scott Stillwell
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without modification, are permitted
// provided that the following conditions are met:
//
// Redistributions of source code must retain the above copyright notice, this list of conditions
// and the following disclaimer.
//
// Redistributions in binary form must reproduce the above copyright notice, this list of conditions
// and the following disclaimer in the documentation and/or other materials provided with the distribution.
//
// The name of Thomas Scott Stillwell may not be used to endorse or
// promote products derived from this software without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR
// IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
// FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS
// BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
// (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
// PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT,
// STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
// THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
//
// Ownership: owned by value inside ModalSynth.
// Thread affinity: init() on control thread; process()/clear() on render thread with zero allocations.
class OutputLimiter {
public:
    void init(double srate, double threshDb = 0.0, double biasPct = 70.0,
              double rmsWinUs = 100.0, double makeupDb = 0.0) noexcept;
    void clear() noexcept;
    void advanceSilence(std::size_t frames) noexcept;
    [[nodiscard]] bool active() const noexcept { return runave_ > 0.0 || rundb_ > 0.0; }
    [[nodiscard]] double gainReductionDb() const noexcept { return rundb_; }
    [[nodiscard]] std::pair<double, double> process(double spl0, double spl1) noexcept;

private:
    static constexpr double kLog2Db = 8.6858896380650365530225783783321;  // 20 / ln(10)
    static constexpr double kDb2Log = 0.11512925464970228420089957273422;

    double rundb_ = 0.0;
    double runave_ = 0.0;
    double threshv_ = 1.0;
    double ratio_ = 20.0;
    double bias_ = 56.0;
    double makeupv_ = 1.0;
    double atcoef_ = 0.0;
    double relcoef_ = 0.0;
    double rmscoef_ = 0.0;
};

}  // namespace nt::midi::modal
