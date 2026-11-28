// Derived from georgi/fablesynth (https://github.com/georgi/fablesynth) at
// commit af55d51 / ae9fca7 (juce/source/bass/dsp/{BassEngine,BassParams,BassPatches}).
// FableSynth is published under PolyForm Noncommercial 1.0.0. Its author, who
// also maintains NodeTool, contributes this code to NodeTool under NodeTool's
// licence (AGPL-3.0).
#include "midi/BassSynth.h"
#include "midi/BassSynthPresets.h"

#include "audio/vst/VstAudioStages.h"

#include <QJsonObject>
#include <QString>

#include <algorithm>
#include <cmath>
#include <limits>
#include <numbers>

namespace nt::midi {
namespace {

constexpr double kPi = std::numbers::pi;
constexpr double kTwoPi = 2.0 * std::numbers::pi;
constexpr double kLn6 = 1.791759469228055;     // ln(1.2 / 0.2) for convex RC attack
constexpr double kLn100 = 4.605170185988091;   // -40 dB decay/release time constant
constexpr double kDenormalFloor = 1.0e-20;
constexpr double kLadderVt = 1.8;              // transistor ladder thermal voltage scaling
constexpr double kInvLadderVt = 1.0 / kLadderVt;
constexpr double kFbVt = 1.25;                 // nonlinear resonance feedback saturation scale
constexpr double kInvFbVt = 1.0 / kFbVt;
constexpr double kPreDriveCeiling = 1.35;      // smooth pre-ladder analog overdrive ceiling
constexpr double kPreBassComp = 0.40;          // gentle pre-ladder bass comp (avoids input overload)
constexpr double kTargetBassComp = 0.78;       // net passband bass compensation at high resonance
constexpr double kLadderSafetyBound = 12.0;    // catastrophic numerical guard only (never hit in audio)
constexpr double kAccentGainBoost = 0.55;      // VCA accent boost multiplier
constexpr double kAccentDecayShorten = 0.35;   // 303-style shorter filter decay on accent
constexpr double kAccentEnvScale = 0.45;       // bounded accent boost on filter envelope depth
constexpr double kAccentSlideOct = 0.45;       // smooth accent filter swell during settled slides
constexpr double kAmpSlewSec = 0.0012;         // 1.2 ms smooth declick amp slew
constexpr double kGainSlewSec = 0.005;         // 5.0 ms accent/velocity gain slew
constexpr double kAccentSlewSec = 0.006;       // 6.0 ms smooth 303 accent capacitor charge/discharge
constexpr double kCutoffSlewSec = 0.0020;      // 2.0 ms analog filter cutoff capacitor slew
constexpr double kPitchDeclickSec = 0.0015;    // 1.5 ms micro-slew for non-legato pitch jumps over tails
constexpr double kDriftSlewSec = 0.008;        // 8.0 ms smooth slew for per-note pitch drift

inline double flushDenormal(double v) noexcept {
    return (std::abs(v) < kDenormalFloor || !std::isfinite(v)) ? 0.0 : v;
}

inline double wrapPhase(double p) noexcept {
    p -= std::floor(p);
    return p < 0.0 ? p + 1.0 : p;
}

// 4-point 4th-order B-spline PolyBLEP residual for a +2 step discontinuity at phase 0.
// Falls back cleanly to 2-point PolyBLEP if dt >= 0.25 (near Nyquist).
inline double polyBlep(double t, double dt) noexcept {
    if (dt <= 0.0) return 0.0;
    if (dt < 0.25) {
        if (t < dt) {
            const double x = 1.0 - t / dt;
            return -(1.0 / 12.0 + x * (1.0 / 3.0 + x * (0.5 + x * (1.0 / 3.0 - 0.25 * x))));
        }
        if (t < 2.0 * dt) {
            const double x = 2.0 - t / dt;
            const double x2 = x * x;
            return -(x2 * x2) * (1.0 / 12.0);
        }
        if (t > 1.0 - dt) {
            const double x = (t - 1.0) / dt + 1.0;
            return 1.0 / 12.0 + x * (1.0 / 3.0 + x * (0.5 + x * (1.0 / 3.0 - 0.25 * x)));
        }
        if (t > 1.0 - 2.0 * dt) {
            const double x = (t - 1.0) / dt + 2.0;
            const double x2 = x * x;
            return (x2 * x2) * (1.0 / 12.0);
        }
        return 0.0;
    }
    if (t < dt) {
        const double u = t / dt;
        return u + u - u * u - 1.0;
    }
    if (t > 1.0 - dt) {
        const double u = (t - 1.0) / dt;
        return u * u + u + u + 1.0;
    }
    return 0.0;
}

// 2-point cubic PolyBLAMP residual (integral of polyBlep) for slope corners on triangle.
inline double polyBlamp(double t, double dt) noexcept {
    if (dt <= 0.0) return 0.0;
    if (t < dt) {
        const double x = 1.0 - t / dt;
        return (1.0 / 3.0) * x * x * x;
    }
    if (t > 1.0 - dt) {
        const double x = (t - 1.0) / dt + 1.0;
        return (1.0 / 3.0) * x * x * x;
    }
    return 0.0;
}

// Evaluates naive (non-BLEP) waveform value at phase `p` in [0, 1) for hard-sync step calculation.
inline double naiveWaveAt(double p, double pw, BassWaveform wave) noexcept {
    switch (wave) {
    case BassWaveform::Saw:
        return 2.0 * p - 1.0;
    case BassWaveform::Square:
        return (p < pw ? 1.0 : -1.0) - (2.0 * pw - 1.0);
    case BassWaveform::Triangle:
        return p < 0.5 ? (4.0 * p - 1.0) : (3.0 - 4.0 * p);
    }
    return 0.0;
}

// Evaluates band-limited PolyBLEP/PolyBLAMP waveform at phase `p` in [0, 1).
inline double bandlimitedWaveAt(double p, double dt, double pw, BassWaveform wave) noexcept {
    switch (wave) {
    case BassWaveform::Saw:
        return (2.0 * p - 1.0) - polyBlep(p, dt);
    case BassWaveform::Square: {
        const double dcComp = 2.0 * pw - 1.0;
        double v = (p < pw ? 1.0 : -1.0) - dcComp;
        v += polyBlep(p, dt);
        const double p2 = p >= pw ? (p - pw) : (p + 1.0 - pw);
        v -= polyBlep(p2, dt);
        return v;
    }
    case BassWaveform::Triangle: {
        double v = p < 0.5 ? (4.0 * p - 1.0) : (3.0 - 4.0 * p);
        v += 4.0 * dt * polyBlamp(p, dt);
        const double p2 = p >= 0.5 ? (p - 0.5) : (p + 0.5);
        v -= 4.0 * dt * polyBlamp(p2, dt);
        return v;
    }
    }
    return 0.0;
}

inline double dbToLinear(double db) noexcept {
    return std::pow(10.0, std::clamp(db, -60.0, 24.0) / 20.0);
}

// Maps user resonance [0, 1] -> 4-pole ladder feedback k [0, 4.25].
// Below 0.90: smooth musical resonance up to just shy of self-oscillation.
// Above 0.92: clean, stable, pitch-accurate self-oscillation.
inline double resonanceToK(double res) noexcept {
    res = std::clamp(res, 0.0, 1.0);
    if (res <= 0.90) {
        return (res / 0.90) * 3.85;
    }
    return 3.85 + ((res - 0.90) / 0.10) * 0.40;
}

inline float sanitizeFloat(float v, float lo, float hi, float fallback) noexcept {
    return std::isfinite(v) ? std::clamp(v, lo, hi) : fallback;
}

inline double sanitizeDt(double dt) noexcept {
    return (std::isfinite(dt) && dt > 0.0) ? std::min(dt, 0.45) : 0.0;
}

inline double onePoleCoef(double timeSec, double sr) noexcept {
    const double samples = std::max(1.0, timeSec * sr);
    return 1.0 - std::exp(-1.0 / samples);
}

// 2-point PolyBLEP residual for an arbitrary step `delta = yAfter - yBefore`
// occurring at `t_d = n - frac` (frac in [0, 1]).
inline void applySyncBlep(double frac, double delta, double& prevSample, double& curSample) noexcept {
    if (delta == 0.0) return;
    prevSample += 0.5 * delta * frac * frac;
    const double omf = 1.0 - frac;
    curSample -= 0.5 * delta * omf * omf;
}

// 2-point PolyBLAMP residual for a slope change `dSlope` (per sample) at `t_d = n - frac`.
inline void applySyncBlamp(double frac, double dSlope, double& prevSample, double& curSample) noexcept {
    if (dSlope == 0.0) return;
    const double c = (1.0 / 6.0) * dSlope;
    prevSample += c * frac * frac * frac;
    const double omf = 1.0 - frac;
    curSample += c * omf * omf * omf;
}

// Accumulates 2-point PolyBLEP/PolyBLAMP residuals for all natural waveform
// transitions as slave phase advances monotonically from `sStart` to `sEnd`
// starting at sample-interval offset `tStart` (with `slaveDt > 0`).
inline void addSyncNaturalTransitions(double sStart, double sEnd, double tStart, double slaveDt,
                                      double pw, BassWaveform wave,
                                      double& prevSample, double& curSample) noexcept {
    if (sEnd <= sStart || slaveDt <= 1.0e-12) return;
    const double invDt = 1.0 / slaveDt;
    auto fracAt = [&](double pCross) noexcept {
        const double tCross = tStart + (pCross - sStart) * invDt;
        return std::clamp(1.0 - tCross, 0.0, 1.0);
    };

    switch (wave) {
    case BassWaveform::Saw:
        if (sStart < 1.0 && sEnd >= 1.0) {
            applySyncBlep(fracAt(1.0), -2.0, prevSample, curSample);
        }
        break;
    case BassWaveform::Square:
        if (sStart < pw && sEnd >= pw) {
            applySyncBlep(fracAt(pw), -2.0, prevSample, curSample);
        }
        if (sStart < 1.0 && sEnd >= 1.0) {
            applySyncBlep(fracAt(1.0), 2.0, prevSample, curSample);
        }
        if (sEnd >= 1.0 + pw) {
            applySyncBlep(fracAt(1.0 + pw), -2.0, prevSample, curSample);
        }
        break;
    case BassWaveform::Triangle:
        if (sStart < 0.5 && sEnd >= 0.5) {
            applySyncBlamp(fracAt(0.5), -8.0 * slaveDt, prevSample, curSample);
        }
        if (sStart < 1.0 && sEnd >= 1.0) {
            applySyncBlamp(fracAt(1.0), 8.0 * slaveDt, prevSample, curSample);
        }
        if (sEnd >= 1.5) {
            applySyncBlamp(fracAt(1.5), -8.0 * slaveDt, prevSample, curSample);
        }
        break;
    }
}

// Smooth C^inf asymmetric analog diode/tube saturation stage (run at 4x oversampling).
// Zero DC offset at x = 0, unity small-signal slope at x = 0 before makeup, no hard clamp.
inline double analogOutputSaturate(double x, double sat, double& satInOut) noexcept {
    if (sat <= 1.0e-4) {
        satInOut = 0.0;
        return x;
    }
    constexpr double kHeadroom = 1.25;
    const double satDrive = 1.0 + sat * 1.10;
    const double asym = 0.09 * sat;
    const double bias = std::tanh(asym);
    const double invSlope = 1.0 / (1.0 - bias * bias);
    const double satIn = (x * satDrive) / kHeadroom;
    satInOut = satIn;
    const double shaped = (std::tanh(satIn + asym) - bias) * invSlope * kHeadroom;
    const double comp = 1.0 / (1.0 + 0.30 * sat);
    return shaped * comp;
}

}  // namespace

std::string_view bassWaveformName(BassWaveform waveform) noexcept {
    switch (waveform) {
    case BassWaveform::Saw: return "saw";
    case BassWaveform::Square: return "square";
    case BassWaveform::Triangle: return "triangle";
    }
    return "saw";
}

std::optional<BassWaveform> tryParseBassWaveform(std::string_view name) noexcept {
    if (name == "saw") return BassWaveform::Saw;
    if (name == "square" || name == "pulse" || name == "sqr") return BassWaveform::Square;
    if (name == "triangle" || name == "tri") return BassWaveform::Triangle;
    return std::nullopt;
}

BassWaveform bassWaveformFromName(std::string_view name) noexcept {
    return tryParseBassWaveform(name).value_or(BassWaveform::Saw);
}

std::string_view bassSubShapeName(BassSubShape shape) noexcept {
    switch (shape) {
    case BassSubShape::Sine: return "sine";
    case BassSubShape::Square: return "square";
    }
    return "sine";
}

std::optional<BassSubShape> tryParseBassSubShape(std::string_view name) noexcept {
    if (name == "sine" || name == "sin") return BassSubShape::Sine;
    if (name == "square" || name == "sqr") return BassSubShape::Square;
    return std::nullopt;
}

BassSubShape bassSubShapeFromName(std::string_view name) noexcept {
    return tryParseBassSubShape(name).value_or(BassSubShape::Sine);
}

// ---------- 47-tap Kaiser-windowed half-band FIR downsampler ----------

namespace {
double besselI0(double x) noexcept {
    double sum = 1.0;
    double term = 1.0;
    const double halfX2 = 0.25 * x * x;
    for (int k = 1; k <= 20; ++k) {
        term *= halfX2 / (static_cast<double>(k) * static_cast<double>(k));
        sum += term;
        if (term < 1.0e-15 * sum) break;
    }
    return sum;
}
}  // namespace

void BassSynth::FastHalfBandDownsampler::init() noexcept {
    constexpr int M = (kTaps - 1) / 2;  // 7
    constexpr double kBeta = 7.5;
    const double invI0Beta = 1.0 / besselI0(kBeta);
    double sum = 0.5;
    for (int p = 0; p < kNumOddPairs; ++p) {
        const int k = 2 * p + 1;  // 1, 3, 5, 7
        const double sign = (p % 2 == 0) ? 1.0 : -1.0;
        const double sinc = sign / (kPi * static_cast<double>(k));
        const double r = static_cast<double>(k) / static_cast<double>(M);
        const double win = besselI0(kBeta * std::sqrt(std::max(0.0, 1.0 - r * r))) * invI0Beta;
        coeffs[static_cast<std::size_t>(p)] = sinc * win;
        sum += 2.0 * coeffs[static_cast<std::size_t>(p)];
    }
    const double invSum = (sum > 0.0) ? (1.0 / sum) : 1.0;
    centerCoeff = 0.5 * invSum;
    for (double& c : coeffs) c *= invSum;
    reset();
}

double BassSynth::FastHalfBandDownsampler::processPair(double x0, double x1) noexcept {
    ring[static_cast<std::size_t>(writePos)] = x0;
    writePos = (writePos + 1) & kRingMask;
    ring[static_cast<std::size_t>(writePos)] = x1;
    writePos = (writePos + 1) & kRingMask;

    constexpr int M = (kTaps - 1) / 2;
    const int center = (writePos - 1 - M) & kRingMask;
    double acc = centerCoeff * ring[static_cast<std::size_t>(center)];
    for (int p = 0; p < kNumOddPairs; ++p) {
        const int k = 2 * p + 1;
        const double sL = ring[static_cast<std::size_t>((center - k) & kRingMask)];
        const double sR = ring[static_cast<std::size_t>((center + k) & kRingMask)];
        acc += coeffs[static_cast<std::size_t>(p)] * (sL + sR);
    }
    return acc;
}

void BassSynth::HalfBandDownsampler::init() noexcept {
    // Symmetric half-band FIR of length 47 (center index M = 23).
    // Even offsets != 0 are identically zero; odd offsets k = 1, 3, ..., 23.
    constexpr int M = (kTaps - 1) / 2;  // 23
    constexpr double kBeta = 7.5;       // ~78 dB stopband attenuation
    const double invI0Beta = 1.0 / besselI0(kBeta);
    double sum = 0.5;
    for (int p = 0; p < kNumOddPairs; ++p) {
        const int k = 2 * p + 1;  // 1, 3, ..., 23
        const double sign = (p % 2 == 0) ? 1.0 : -1.0;
        const double sinc = sign / (kPi * static_cast<double>(k));
        const double r = static_cast<double>(k) / static_cast<double>(M);
        const double win = besselI0(kBeta * std::sqrt(std::max(0.0, 1.0 - r * r))) * invI0Beta;
        coeffs[static_cast<std::size_t>(p)] = sinc * win;
        sum += 2.0 * coeffs[static_cast<std::size_t>(p)];
    }
    const double invSum = (sum > 0.0) ? (1.0 / sum) : 1.0;
    centerCoeff = 0.5 * invSum;
    for (double& c : coeffs) c *= invSum;
    reset();
}

double BassSynth::HalfBandDownsampler::processPair(double x0, double x1) noexcept {
    ring[static_cast<std::size_t>(writePos)] = x0;
    writePos = (writePos + 1) & kRingMask;
    ring[static_cast<std::size_t>(writePos)] = x1;
    writePos = (writePos + 1) & kRingMask;

    // Newest sample is at writePos - 1; center tap (delay M = 23) is at writePos - 24.
    constexpr int M = (kTaps - 1) / 2;
    const int center = (writePos - 1 - M) & kRingMask;
    double acc = centerCoeff * ring[static_cast<std::size_t>(center)];
    for (int p = 0; p < kNumOddPairs; ++p) {
        const int k = 2 * p + 1;
        const double sL = ring[static_cast<std::size_t>((center - k) & kRingMask)];
        const double sR = ring[static_cast<std::size_t>((center + k) & kRingMask)];
        acc += coeffs[static_cast<std::size_t>(p)] * (sL + sR);
    }
    return acc;
}

// ---------- BassSynth ----------

BassSynth::BassSynth() {
    downsampler4x_.init();
    downsampler_.init();
    prepare(48000.0);
}

void BassSynth::updateRateDependentConstants() noexcept {
    osSampleRate_ = sampleRate_ * 4.0;
    ampSlewCoef_ = onePoleCoef(kAmpSlewSec, sampleRate_);
    gainSlewCoef_ = onePoleCoef(kGainSlewSec, sampleRate_);
    accentSlewCoef_ = onePoleCoef(kAccentSlewSec, sampleRate_);
    cutoffSlewCoef_ = onePoleCoef(kCutoffSlewSec, sampleRate_);
    pitchDeclickCoef_ = onePoleCoef(kPitchDeclickSec, sampleRate_);
    driftSlewCoef_ = onePoleCoef(kDriftSlewSec, sampleRate_);
    dcR_ = std::pow(0.9990, 48000.0 / sampleRate_);
    updateEnvelopeCoefs();
}

void BassSynth::updateEnvelopeCoefs() noexcept {
    const double attSec = std::max(0.0005, static_cast<double>(params_.attackMs) * 0.001);
    const double decSec = std::max(0.005, static_cast<double>(params_.decayMs) * 0.001);
    const double relSec = std::max(0.005, static_cast<double>(params_.releaseMs) * 0.001);
    ampAttCoef_ = 1.0 - std::exp(-kLn6 / (attSec * sampleRate_));
    ampDecCoef_ = 1.0 - std::exp(-kLn100 / (decSec * sampleRate_));
    ampRelCoef_ = 1.0 - std::exp(-kLn100 / (relSec * sampleRate_));

    const double fAttSec = std::max(0.0005, static_cast<double>(params_.filterAttackMs) * 0.001);
    const double fDecSec = std::max(0.005, static_cast<double>(params_.filterDecayMs) * 0.001);
    const double fRelSec = std::max(0.005, static_cast<double>(params_.filterReleaseMs) * 0.001);
    fltAttCoef_ = 1.0 - std::exp(-kLn6 / (fAttSec * sampleRate_));
    fltDecBaseCoef_ = 1.0 - std::exp(-kLn100 / (fDecSec * sampleRate_));
    fltRelCoef_ = 1.0 - std::exp(-kLn100 / (fRelSec * sampleRate_));

    const double slideMs = static_cast<double>(params_.slideMs);
    slideCoef_ = (slideMs > 0.1)
        ? (1.0 - std::exp(-1.0 / (slideMs * 0.001 * sampleRate_)))
        : 1.0;
}

void BassSynth::prepare(double sampleRate) noexcept {
    sampleRate_ = (std::isfinite(sampleRate) && sampleRate > 1000.0) ? sampleRate : 48000.0;
    updateRateDependentConstants();
    downsampler4x_.init();
    downsampler_.init();

    constexpr double smoothMs = audio::ParameterSmoother::kDefaultTimeMs;
    cutoffLog2Sm_.prepare(sampleRate_, smoothMs);
    resSm_.prepare(sampleRate_, smoothMs);
    driveSm_.prepare(sampleRate_, smoothMs);
    envAmtSm_.prepare(sampleRate_, smoothMs);
    subLevelSm_.prepare(sampleRate_, smoothMs);
    oscLevelSm_.prepare(sampleRate_, smoothMs);
    pwSm_.prepare(sampleRate_, smoothMs);
    syncSemiSm_.prepare(sampleRate_, smoothMs);
    satSm_.prepare(sampleRate_, smoothMs);
    gainLinSm_.prepare(sampleRate_, smoothMs);
    fltSustainSm_.prepare(sampleRate_, smoothMs);
    keyTrackSm_.prepare(sampleRate_, smoothMs);
    fineSm_.prepare(sampleRate_, smoothMs);
    accentAmtSm_.prepare(sampleRate_, smoothMs);

    lastDrive_ = -1.0;
    lastDriveComp_ = 1.0;
    lastTuneOffset_ = 0.0;
    lastInvTuneRatio_ = 1.0;
    lastSyncSemi_ = 0.0;
    lastSyncRatio_ = 1.0;

    prepared_ = true;
    snapParams();
    reset();
}

void BassSynth::setParams(const BassSynthParams& params) noexcept {
    constexpr BassSynthParams defaults{};
    params_ = params;
    const int wfIdx = static_cast<int>(params_.waveform);
    if (wfIdx < 0 || wfIdx > 2) params_.waveform = defaults.waveform;
    const int subIdx = static_cast<int>(params_.subShape);
    if (subIdx < 0 || subIdx > 1) params_.subShape = defaults.subShape;

    params_.pulseWidth = sanitizeFloat(params_.pulseWidth, 0.05f, 0.95f, defaults.pulseWidth);
    params_.semitones = std::clamp(params_.semitones, -24, 24);
    params_.fine = sanitizeFloat(params_.fine, -100.0f, 100.0f, defaults.fine);
    params_.oscLevel = sanitizeFloat(params_.oscLevel, 0.0f, 1.2f, defaults.oscLevel);
    params_.syncSemitones = sanitizeFloat(params_.syncSemitones, 0.0f, 36.0f, defaults.syncSemitones);
    params_.analogDrift = sanitizeFloat(params_.analogDrift, 0.0f, 1.0f, defaults.analogDrift);
    params_.subOctave = std::clamp(params_.subOctave, -2, -1);
    params_.subLevel = sanitizeFloat(params_.subLevel, 0.0f, 1.0f, defaults.subLevel);
    params_.cutoffHz = sanitizeFloat(params_.cutoffHz, 20.0f, 18000.0f, defaults.cutoffHz);
    params_.resonance = sanitizeFloat(params_.resonance, 0.0f, 1.0f, defaults.resonance);
    params_.drive = sanitizeFloat(params_.drive, 0.0f, 1.0f, defaults.drive);
    params_.filterEnvAmount = sanitizeFloat(params_.filterEnvAmount, -5.0f, 5.0f, defaults.filterEnvAmount);
    params_.keyTrack = sanitizeFloat(params_.keyTrack, 0.0f, 1.0f, defaults.keyTrack);
    params_.filterAttackMs = sanitizeFloat(params_.filterAttackMs, 0.5f, 500.0f, defaults.filterAttackMs);
    params_.filterDecayMs = sanitizeFloat(params_.filterDecayMs, 5.0f, 4000.0f, defaults.filterDecayMs);
    params_.filterSustain = sanitizeFloat(params_.filterSustain, 0.0f, 1.0f, defaults.filterSustain);
    params_.filterReleaseMs = sanitizeFloat(params_.filterReleaseMs, 5.0f, 2000.0f, defaults.filterReleaseMs);
    params_.attackMs = sanitizeFloat(params_.attackMs, 0.5f, 500.0f, defaults.attackMs);
    params_.decayMs = sanitizeFloat(params_.decayMs, 5.0f, 4000.0f, defaults.decayMs);
    params_.sustain = sanitizeFloat(params_.sustain, 0.0f, 1.0f, defaults.sustain);
    params_.releaseMs = sanitizeFloat(params_.releaseMs, 5.0f, 2000.0f, defaults.releaseMs);
    params_.accentAmount = sanitizeFloat(params_.accentAmount, 0.0f, 1.0f, defaults.accentAmount);
    params_.accentVelocity = std::clamp(params_.accentVelocity, 1, 127);
    params_.slideMs = sanitizeFloat(params_.slideMs, 0.0f, 500.0f, defaults.slideMs);
    params_.saturation = sanitizeFloat(params_.saturation, 0.0f, 1.0f, defaults.saturation);
    params_.gainDb = sanitizeFloat(params_.gainDb, -60.0f, 12.0f, defaults.gainDb);
    updateEnvelopeCoefs();
    updateSmoothingTargets();
}

void BassSynth::updateSmoothingTargets() noexcept {
    if (!prepared_) return;
    cutoffLog2Sm_.setTarget(std::log2(static_cast<double>(params_.cutoffHz)));
    resSm_.setTarget(static_cast<double>(params_.resonance));
    driveSm_.setTarget(static_cast<double>(params_.drive));
    envAmtSm_.setTarget(static_cast<double>(params_.filterEnvAmount));
    subLevelSm_.setTarget(static_cast<double>(params_.subLevel));
    oscLevelSm_.setTarget(static_cast<double>(params_.oscLevel));
    pwSm_.setTarget(static_cast<double>(params_.pulseWidth));
    syncSemiSm_.setTarget(static_cast<double>(params_.syncSemitones));
    satSm_.setTarget(static_cast<double>(params_.saturation));
    gainLinSm_.setTarget(dbToLinear(static_cast<double>(params_.gainDb)));
    fltSustainSm_.setTarget(static_cast<double>(params_.filterSustain));
    keyTrackSm_.setTarget(static_cast<double>(params_.keyTrack));
    fineSm_.setTarget(static_cast<double>(params_.fine));
    accentAmtSm_.setTarget(static_cast<double>(params_.accentAmount));
}

void BassSynth::snapParams() noexcept {
    if (!prepared_) return;
    cutoffLog2Sm_.snap(std::log2(static_cast<double>(params_.cutoffHz)));
    resSm_.snap(static_cast<double>(params_.resonance));
    driveSm_.snap(static_cast<double>(params_.drive));
    envAmtSm_.snap(static_cast<double>(params_.filterEnvAmount));
    subLevelSm_.snap(static_cast<double>(params_.subLevel));
    oscLevelSm_.snap(static_cast<double>(params_.oscLevel));
    pwSm_.snap(static_cast<double>(params_.pulseWidth));
    syncSemiSm_.snap(static_cast<double>(params_.syncSemitones));
    satSm_.snap(static_cast<double>(params_.saturation));
    gainLinSm_.snap(dbToLinear(static_cast<double>(params_.gainDb)));
    fltSustainSm_.snap(static_cast<double>(params_.filterSustain));
    keyTrackSm_.snap(static_cast<double>(params_.keyTrack));
    fineSm_.snap(static_cast<double>(params_.fine));
    accentAmtSm_.snap(static_cast<double>(params_.accentAmount));
    if (!hasActiveSound()) {
        const double maxCutHz = std::min(20000.0, sampleRate_ * 0.42);
        effCutLog2Sm_ = std::log2(std::clamp(std::exp2(cutoffLog2Sm_.current()), 20.0, maxCutHz));
        effCutInitialized_ = false;
    }
}

bool BassSynth::setParameter(std::string_view name, double value) noexcept {
    if (!std::isfinite(value)) return false;

    if (name == "cutoffHz" || name == "filter.cutoff" || name == "flt.cut") {
        params_.cutoffHz = static_cast<float>(std::clamp(value, 20.0, 18000.0));
        cutoffLog2Sm_.setTarget(std::log2(static_cast<double>(params_.cutoffHz)));
        return true;
    }
    if (name == "resonance" || name == "filter.res" || name == "flt.res") {
        params_.resonance = static_cast<float>(std::clamp(value, 0.0, 1.0));
        resSm_.setTarget(static_cast<double>(params_.resonance));
        return true;
    }
    if (name == "drive" || name == "flt.drive") {
        params_.drive = static_cast<float>(std::clamp(value, 0.0, 1.0));
        driveSm_.setTarget(static_cast<double>(params_.drive));
        return true;
    }
    if (name == "filterEnvAmount" || name == "envAmount" || name == "flt.env") {
        // Accept octaves [-5, 5]; callers using BL-1 normalized [-1, 1] pass via flt.env? No, keep direct octaves.
        params_.filterEnvAmount = static_cast<float>(std::clamp(value, -5.0, 5.0));
        envAmtSm_.setTarget(static_cast<double>(params_.filterEnvAmount));
        return true;
    }
    if (name == "keyTrack" || name == "flt.track") {
        params_.keyTrack = static_cast<float>(std::clamp(value, 0.0, 1.0));
        keyTrackSm_.setTarget(static_cast<double>(params_.keyTrack));
        return true;
    }
    if (name == "subLevel" || name == "sub.level") {
        params_.subLevel = static_cast<float>(std::clamp(value, 0.0, 1.0));
        subLevelSm_.setTarget(static_cast<double>(params_.subLevel));
        return true;
    }
    if (name == "subOctave" || name == "sub.oct") {
        params_.subOctave = std::clamp(static_cast<int>(std::llround(value)), -2, -1);
        return true;
    }
    if (name == "subShape" || name == "sub.shape") {
        params_.subShape = static_cast<int>(std::llround(value)) == 1 ? BassSubShape::Square : BassSubShape::Sine;
        return true;
    }
    if (name == "waveform" || name == "wave") {
        const int idx = std::clamp(static_cast<int>(std::llround(value)), 0, 2);
        params_.waveform = static_cast<BassWaveform>(idx);
        return true;
    }
    if (name == "pulseWidth" || name == "pw") {
        params_.pulseWidth = static_cast<float>(std::clamp(value, 0.05, 0.95));
        pwSm_.setTarget(static_cast<double>(params_.pulseWidth));
        return true;
    }
    if (name == "oscLevel" || name == "osc.level") {
        params_.oscLevel = static_cast<float>(std::clamp(value, 0.0, 1.2));
        oscLevelSm_.setTarget(static_cast<double>(params_.oscLevel));
        return true;
    }
    if (name == "semitones" || name == "osc.tune") {
        params_.semitones = std::clamp(static_cast<int>(std::llround(value)), -24, 24);
        return true;
    }
    if (name == "fine" || name == "osc.fine") {
        params_.fine = static_cast<float>(std::clamp(value, -100.0, 100.0));
        fineSm_.setTarget(static_cast<double>(params_.fine));
        return true;
    }
    if (name == "hardSync") {
        params_.hardSync = value >= 0.5;
        return true;
    }
    if (name == "syncSemitones") {
        params_.syncSemitones = static_cast<float>(std::clamp(value, 0.0, 36.0));
        syncSemiSm_.setTarget(static_cast<double>(params_.syncSemitones));
        return true;
    }
    if (name == "analogDrift") {
        params_.analogDrift = static_cast<float>(std::clamp(value, 0.0, 1.0));
        return true;
    }
    if (name == "filterAttackMs") {
        params_.filterAttackMs = static_cast<float>(std::clamp(value, 0.5, 500.0));
        updateEnvelopeCoefs();
        return true;
    }
    if (name == "filterDecayMs" || name == "decay") {
        params_.filterDecayMs = static_cast<float>(std::clamp(value, 5.0, 4000.0));
        updateEnvelopeCoefs();
        return true;
    }
    if (name == "filterSustain") {
        params_.filterSustain = static_cast<float>(std::clamp(value, 0.0, 1.0));
        fltSustainSm_.setTarget(static_cast<double>(params_.filterSustain));
        return true;
    }
    if (name == "filterReleaseMs") {
        params_.filterReleaseMs = static_cast<float>(std::clamp(value, 5.0, 2000.0));
        updateEnvelopeCoefs();
        return true;
    }
    if (name == "attackMs") {
        params_.attackMs = static_cast<float>(std::clamp(value, 0.5, 500.0));
        updateEnvelopeCoefs();
        return true;
    }
    if (name == "decayMs") {
        params_.decayMs = static_cast<float>(std::clamp(value, 5.0, 4000.0));
        updateEnvelopeCoefs();
        return true;
    }
    if (name == "sustain") {
        params_.sustain = static_cast<float>(std::clamp(value, 0.0, 1.0));
        return true;
    }
    if (name == "releaseMs") {
        params_.releaseMs = static_cast<float>(std::clamp(value, 5.0, 2000.0));
        updateEnvelopeCoefs();
        return true;
    }
    if (name == "accentAmount" || name == "accent" || name == "acc.amt") {
        params_.accentAmount = static_cast<float>(std::clamp(value, 0.0, 1.0));
        accentAmtSm_.setTarget(static_cast<double>(params_.accentAmount));
        return true;
    }
    if (name == "accentVelocity" || name == "acc.vel") {
        params_.accentVelocity = std::clamp(static_cast<int>(std::llround(value)), 1, 127);
        return true;
    }
    if (name == "slideMs" || name == "glide" || name == "slide.time") {
        params_.slideMs = static_cast<float>(std::clamp(value, 0.0, 500.0));
        updateEnvelopeCoefs();
        return true;
    }
    if (name == "retrigger") {
        params_.retrigger = value >= 0.5;
        return true;
    }
    if (name == "saturation") {
        params_.saturation = static_cast<float>(std::clamp(value, 0.0, 1.0));
        satSm_.setTarget(static_cast<double>(params_.saturation));
        return true;
    }
    if (name == "gainDb") {
        params_.gainDb = static_cast<float>(std::clamp(value, -60.0, 12.0));
        gainLinSm_.setTarget(dbToLinear(static_cast<double>(params_.gainDb)));
        return true;
    }
    return false;
}

double BassSynth::nextRandomUniform() noexcept {
    std::uint64_t x = rngState_;
    x ^= x >> 12;
    x ^= x << 25;
    x ^= x >> 27;
    rngState_ = x;
    const std::uint64_t r = x * 0x2545F4914F6CDD1DULL;
    return static_cast<double>(r >> 11) * (1.0 / 9007199254740992.0);
}

double BassSynth::nextRandomBipolar() noexcept {
    return nextRandomUniform() * 2.0 - 1.0;
}

void BassSynth::panic() noexcept {
    heldCount_ = 0;
    gate_ = false;
    accented_ = false;
    pitchDeclickActive_ = false;
    ampStage_ = EnvStage::Idle;
    ampLevel_ = 0.0;
    ampSm_ = 0.0;
    fltStage_ = EnvStage::Idle;
    fltEnvLevel_ = 0.0;
    effCutInitialized_ = false;
    accentLevelSm_ = 0.0;
    gainModSm_ = 1.0;
    clipGainSm_ = 1.0;
    prevVcaGain_ = 0.0;
    gainInitialized_ = false;
    oscPendingSample_ = 0.0;
    oscPendingValid_ = false;
    ladder_.reset();
    downsampler4x_.reset();
    downsampler_.reset();
    downsamplerTailFrames_ = 0;
    dcX_ = 0.0;
    dcY_ = 0.0;
}

void BassSynth::reset() noexcept {
    panic();
    masterPhase_ = 0.0;
    slavePhase_ = 0.0;
    subPhase_ = 0.0;
    noteDriftCents_ = 0.0;
    targetDriftCents_ = 0.0;
    wanderPhase_ = 0.0;
    if (prepared_) {
        snapParams();
    }
}

void BassSynth::triggerFreshNote(const HeldNote& note, bool wasSilent) noexcept {
    gate_ = true;
    accented_ = note.accented;
    velocity_ = static_cast<double>(note.velocity);
    clipGain_ = static_cast<double>(note.clipGain);
    targetNote_ = static_cast<double>(note.midiNote);

    // Subtle analog per-note pitch drift (+/- 8 cents max at analogDrift = 1.0; ~1.2 cents at default 0.15).
    const double drift = static_cast<double>(params_.analogDrift);
    targetDriftCents_ = drift > 0.0 ? nextRandomBipolar() * 8.0 * drift : 0.0;

    // Free-running analog phase randomness ONLY when starting from true silence (never clicks!).
    if (wasSilent) {
        currentNote_ = targetNote_;
        pitchDeclickActive_ = false;
        noteDriftCents_ = targetDriftCents_;
        // Clear stale pre-VCA ladder & half-band FIR rings before seeding a cold start.
        ladder_.reset();
        downsampler4x_.reset();
        downsampler_.reset();
        downsamplerTailFrames_ = 0;
        if (drift > 0.0) {
            masterPhase_ = nextRandomUniform();
            slavePhase_ = masterPhase_;
            subPhase_ = nextRandomUniform();
        } else {
            // Start at zero-crossing phase for Saw/Triangle/Sine to avoid cold-start DC steps.
            const double zeroPhase = (params_.waveform == BassWaveform::Saw) ? 0.5
                : (params_.waveform == BassWaveform::Triangle ? 0.25 : 0.0);
            masterPhase_ = zeroPhase;
            slavePhase_ = zeroPhase;
            subPhase_ = 0.0;
        }
        oscPendingSample_ = 0.0;
        oscPendingValid_ = false;
        // Start cold notes from the same discharged accent/cutoff/gain state as a later note
        // after release: the 303 accent capacitor charges over 6 ms, gainModSm_ follows from
        // unaccented velocity, and effCutLog2Sm_ starts at the resting base cutoff before env attack.
        accentLevelSm_ = 0.0;
        gainModSm_ = velocity_;
        clipGainSm_ = clipGain_;
        prevVcaGain_ = 0.0;
        gainInitialized_ = true;
        const double restOscNote = currentNote_ + static_cast<double>(params_.semitones) + fineSm_.current() * 0.01;
        const double restKeyOct = ((restOscNote - kKeyTrackRefNote) * (1.0 / 12.0)) * keyTrackSm_.current();
        const double maxCutHz = std::min(20000.0, sampleRate_ * 0.42);
        effCutLog2Sm_ = std::log2(std::clamp(std::exp2(cutoffLog2Sm_.current() + restKeyOct), 20.0, maxCutHz));
        effCutInitialized_ = true;
    } else {
        // Voice is still sounding (e.g. release tail): keep oscillator phase continuous
        // and micro-slew pitch over 1.5 ms to avoid frequency/PolyBLEP/keyTrack clicks.
        pitchDeclickActive_ = (currentNote_ != targetNote_);
    }

    // Tiny deterministic thermal seed on high-resonance cold start so self-oscillation engages promptly.
    if (params_.resonance > 0.90f && std::abs(ladder_.s[0]) + std::abs(ladder_.s[3]) < 1.0e-3) {
        ladder_.s[0] += 0.015;
    }

    // Start attack from current envelope level so retriggering over a release tail never clicks.
    ampStage_ = EnvStage::Attack;
    fltStage_ = EnvStage::Attack;
}

void BassSynth::glideToNote(const HeldNote& note, bool retriggerEnvs) noexcept {
    gate_ = true;
    targetNote_ = static_cast<double>(note.midiNote);
    velocity_ = static_cast<double>(note.velocity);
    clipGain_ = static_cast<double>(note.clipGain);
    // 303 accent-aware slide: update accent state smoothly (accentLevelSm_ slews to target).
    accented_ = note.accented;

    const double drift = static_cast<double>(params_.analogDrift);
    targetDriftCents_ = drift > 0.0 ? nextRandomBipolar() * 8.0 * drift : 0.0;

    // When slideMs <= 0.1 ms, micro-slew pitch over 1.5 ms instead of snapping instantaneously.
    pitchDeclickActive_ = (params_.slideMs <= 0.1f) && (currentNote_ != targetNote_);

    if (retriggerEnvs) {
        // Retrigger from current envelope level (free-running VCO phase -> zero click).
        ampStage_ = EnvStage::Attack;
        fltStage_ = EnvStage::Attack;
    }
}

void BassSynth::releaseGate() noexcept {
    gate_ = false;
    // Discharge accent capacitor smoothly on release so stale accent never bleeds into a later plain note.
    accented_ = false;
    if (ampStage_ != EnvStage::Idle) {
        ampStage_ = EnvStage::Release;
    }
    if (fltStage_ != EnvStage::Idle) {
        fltStage_ = EnvStage::Release;
    }
}

void BassSynth::noteOn(int midiNote, float velocity, float clipGain, std::uint64_t noteId) noexcept {
    if (!prepared_) return;
    if (!std::isfinite(velocity) || velocity <= 0.0f) {
        noteOff(midiNote, noteId);
        return;
    }
    midiNote = std::clamp(midiNote, 0, 127);
    const float clampedVel = std::clamp(velocity, 0.0f, 1.0f);
    const float clampedClipGain = (std::isfinite(clipGain) && clipGain >= 0.0f) ? clipGain : 1.0f;
    const float accThreshold = static_cast<float>(params_.accentVelocity) / 127.0f;
    const bool accented = clampedVel >= accThreshold;

    const bool hadHeld = (heldCount_ > 0) && gate_;

    // Deduplicate only when the exact same non-zero note instance ID is already held;
    // distinct overlapping notes of the same pitch retain separate bounded stack entries.
    if (noteId != 0) {
        int writeIdx = 0;
        for (int i = 0; i < heldCount_; ++i) {
            if (held_[static_cast<std::size_t>(i)].noteId != noteId) {
                held_[static_cast<std::size_t>(writeIdx++)] = held_[static_cast<std::size_t>(i)];
            }
        }
        heldCount_ = writeIdx;
    }

    if (heldCount_ >= kMaxHeldNotes) {
        // Drop oldest held note to stay bounded without allocating.
        for (int i = 1; i < kMaxHeldNotes; ++i) {
            held_[static_cast<std::size_t>(i - 1)] = held_[static_cast<std::size_t>(i)];
        }
        heldCount_ = kMaxHeldNotes - 1;
    }
    const HeldNote entry{midiNote, clampedVel, accented, clampedClipGain, noteId};
    held_[static_cast<std::size_t>(heldCount_++)] = entry;

    if (hadHeld) {
        glideToNote(entry, params_.retrigger);
    } else {
        const bool wasSilent = (ampStage_ == EnvStage::Idle && ampSm_ < 1.0e-6 && downsamplerTailFrames_ == 0);
        triggerFreshNote(entry, wasSilent);
    }
}

void BassSynth::noteOff(int midiNote, std::uint64_t noteId) noexcept {
    if (heldCount_ <= 0) return;
    midiNote = std::clamp(midiNote, 0, 127);

    int matchIdx = -1;
    if (noteId != 0) {
        for (int i = 0; i < heldCount_; ++i) {
            if (held_[static_cast<std::size_t>(i)].noteId == noteId) {
                matchIdx = i;
                break;
            }
        }
    } else {
        // Match the oldest held instance of this pitch so overlapping same-pitch notes
        // release one-for-one without prematurely cutting off a newer held note.
        for (int i = 0; i < heldCount_; ++i) {
            if (held_[static_cast<std::size_t>(i)].midiNote == midiNote) {
                matchIdx = i;
                break;
            }
        }
    }
    if (matchIdx < 0) return;

    const bool wasTop = (matchIdx == heldCount_ - 1);
    for (int i = matchIdx + 1; i < heldCount_; ++i) {
        held_[static_cast<std::size_t>(i - 1)] = held_[static_cast<std::size_t>(i)];
    }
    --heldCount_;

    if (heldCount_ == 0) {
        releaseGate();
    } else if (wasTop) {
        // Last-note priority: glide back to the new top of the note stack.
        glideToNote(held_[static_cast<std::size_t>(heldCount_ - 1)], params_.retrigger);
    }
}

bool BassSynth::hasActiveSound() const noexcept {
    if (gate_ || heldCount_ > 0 || ampStage_ != EnvStage::Idle || ampSm_ >= 1.0e-6 || downsamplerTailFrames_ > 0) {
        return true;
    }
    const double dcResid = std::abs(dcX_) + std::abs(dcY_);
    return dcResid >= 1.0e-7;
}

// 4-pole ZDF nonlinear transistor ladder filter solved with 2 Newton-Raphson iterations
// at 4x oversampling on the trapezoidal-discretized 4-stage ODE with a nonlinear
// resonance feedback path (saturates gently like a 303/Moog ladder):
//   fb(y_4) = k * Vfb * tanh(y_4 / Vfb)
//   u       = xIn - fb(y_4),  xIn = (1 + k * kPreBassComp) * xDriven
//   y_1 - s_1 = g * Vt * (tanh(u / Vt) - tanh(y_1 / Vt))
//   y_i - s_i = g * Vt * (tanh(y_{i-1} / Vt) - tanh(y_i / Vt))  for i = 2..4
double BassSynth::processLadderSample(double x, double g, double k, double drive,
                                      double driveGain, double driveComp) noexcept {
    const double s0 = ladder_.s[0];
    const double s1 = ladder_.s[1];
    const double s2 = ladder_.s[2];
    const double s3 = ladder_.s[3];

    double y0 = ladder_.y[0];
    double y1 = ladder_.y[1];
    double y2 = ladder_.y[2];
    double y3 = ladder_.y[3];

    // Smooth pre-ladder analog drive (strictly linear at drive == 0, smooth crossfade into soft tanh knee).
    double xDriven = x;
    if (drive > 1.0e-5) {
        const double drivenSat = kPreDriveCeiling * std::tanh((driveGain * x) / kPreDriveCeiling);
        const double mix = std::min(1.0, drive * 20.0);
        xDriven = x + mix * (drivenSat - x);
    }

    const double preComp = 1.0 + k * kPreBassComp;
    const double postComp = (1.0 + k * kTargetBassComp) / preComp;
    const double xIn = preComp * xDriven;
    if (telemetryEnabled_) {
        telemetry_.maxLadderInput = std::max(telemetry_.maxLadderInput, std::abs(xIn));
    }

    // 2 Newton-Raphson iterations at 4x oversampling converge to < 1e-11 residual across the audio range.
    for (int iter = 0; iter < 2; ++iter) {
        const double tFb = std::tanh(y3 * kInvFbVt);
        const double fb = k * kFbVt * tFb;
        const double dFb = k * (1.0 - tFb * tFb);

        const double u = xIn - fb;
        const double uNorm = u * kInvLadderVt;
        if (telemetryEnabled_) {
            telemetry_.maxLadderUOverVt = std::max(telemetry_.maxLadderUOverVt, std::abs(uNorm));
        }
        const double tu = std::tanh(uNorm);
        const double t0 = std::tanh(y0 * kInvLadderVt);
        const double t1 = std::tanh(y1 * kInvLadderVt);
        const double t2 = std::tanh(y2 * kInvLadderVt);
        const double t3 = std::tanh(y3 * kInvLadderVt);

        const double du = 1.0 - tu * tu;
        const double d0 = 1.0 - t0 * t0;
        const double d1 = 1.0 - t1 * t1;
        const double d2 = 1.0 - t2 * t2;
        const double d3 = 1.0 - t3 * t3;

        const double f0 = y0 - s0 - g * kLadderVt * (tu - t0);
        const double f1 = y1 - s1 - g * kLadderVt * (t0 - t1);
        const double f2 = y2 - s2 - g * kLadderVt * (t1 - t2);
        const double f3 = y3 - s3 - g * kLadderVt * (t2 - t3);

        // Closed-form exact solution of the 4x4 bidiagonal + nonlinear feedback corner Jacobian.
        const double a0 = 1.0 / (1.0 + g * d0);
        const double a1 = 1.0 / (1.0 + g * d1);
        const double a2 = 1.0 / (1.0 + g * d2);

        const double c0 = g * d0;
        const double c1 = g * d1;
        const double c2 = g * d2;

        const double p0 = -a0 * f0;
        const double q0 = a0 * g * du * dFb;

        const double p1 = a1 * (-f1 + c0 * p0);
        const double q1 = a1 * c0 * q0;

        const double p2 = a2 * (-f2 + c1 * p1);
        const double q2 = a2 * c1 * q1;

        const double denom = 1.0 + g * d3 + c2 * q2;
        const double dy3 = (-f3 + c2 * p2) / (denom > 1.0e-12 ? denom : 1.0e-12);
        const double dy0 = p0 - q0 * dy3;
        const double dy1 = p1 - q1 * dy3;
        const double dy2 = p2 - q2 * dy3;

        const double ny0 = y0 + dy0;
        const double ny1 = y1 + dy1;
        const double ny2 = y2 + dy2;
        const double ny3 = y3 + dy3;
        if (telemetryEnabled_ && (std::abs(ny0) > kLadderSafetyBound || std::abs(ny1) > kLadderSafetyBound ||
                                  std::abs(ny2) > kLadderSafetyBound || std::abs(ny3) > kLadderSafetyBound)) {
            ++telemetry_.ladderClampHits;
        }
        y0 = std::clamp(ny0, -kLadderSafetyBound, kLadderSafetyBound);
        y1 = std::clamp(ny1, -kLadderSafetyBound, kLadderSafetyBound);
        y2 = std::clamp(ny2, -kLadderSafetyBound, kLadderSafetyBound);
        y3 = std::clamp(ny3, -kLadderSafetyBound, kLadderSafetyBound);
    }

    // Trapezoidal integrator state update with denormal flush.
    const double ns0 = 2.0 * y0 - s0;
    const double ns1 = 2.0 * y1 - s1;
    const double ns2 = 2.0 * y2 - s2;
    const double ns3 = 2.0 * y3 - s3;
    if (telemetryEnabled_) {
        if (std::abs(ns0) > kLadderSafetyBound || std::abs(ns1) > kLadderSafetyBound ||
            std::abs(ns2) > kLadderSafetyBound || std::abs(ns3) > kLadderSafetyBound) {
            ++telemetry_.ladderClampHits;
        }
        const double stMax = std::max({std::abs(ns0), std::abs(ns1), std::abs(ns2), std::abs(ns3),
                                       std::abs(y0), std::abs(y1), std::abs(y2), std::abs(y3)});
        telemetry_.maxLadderState = std::max(telemetry_.maxLadderState, stMax);
    }
    ladder_.s[0] = flushDenormal(std::clamp(ns0, -kLadderSafetyBound, kLadderSafetyBound));
    ladder_.s[1] = flushDenormal(std::clamp(ns1, -kLadderSafetyBound, kLadderSafetyBound));
    ladder_.s[2] = flushDenormal(std::clamp(ns2, -kLadderSafetyBound, kLadderSafetyBound));
    ladder_.s[3] = flushDenormal(std::clamp(ns3, -kLadderSafetyBound, kLadderSafetyBound));
    ladder_.y[0] = flushDenormal(y0);
    ladder_.y[1] = flushDenormal(y1);
    ladder_.y[2] = flushDenormal(y2);
    ladder_.y[3] = flushDenormal(y3);

    return ladder_.y[3] * postComp * driveComp;
}

double BassSynth::renderOscSample(double masterDt, double slaveDt, double pw,
                                  BassWaveform wave, bool hardSync) noexcept {
    if (!hardSync) {
        const double out = bandlimitedWaveAt(masterPhase_, masterDt, pw, wave);
        masterPhase_ += masterDt;
        if (masterPhase_ >= 1.0) masterPhase_ -= std::floor(masterPhase_);
        slavePhase_ = masterPhase_;
        oscPendingValid_ = false;
        return out;
    }

    // Band-limited master->slave hard sync using 1-sample lookahead on the naive
    // waveform, accumulating 2-point PolyBLEP/PolyBLAMP residuals separately for
    // natural slave transitions (before and after reset) and master-triggered resets.
    double prevSample = oscPendingValid_ ? oscPendingSample_ : naiveWaveAt(slavePhase_, pw, wave);
    double curSample = 0.0;

    const double oldMaster = masterPhase_;
    const double oldSlave = slavePhase_;
    const double nextMaster = oldMaster + masterDt;

    if (nextMaster >= 1.0 && masterDt > 1.0e-12) {
        masterPhase_ = nextMaster - std::floor(nextMaster);
        const double frac = std::clamp(masterPhase_ / masterDt, 0.0, 1.0);
        const double tReset = 1.0 - frac;

        // Sub-interval A: [0, tReset] natural slave transitions before master reset.
        const double sBeforeUnwrapped = oldSlave + tReset * slaveDt;
        addSyncNaturalTransitions(oldSlave, sBeforeUnwrapped, 0.0, slaveDt, pw, wave, prevSample, curSample);

        // Master-triggered reset discontinuity at t = tReset (slave jumps to phase 0).
        const double sBeforeWrapped = wrapPhase(sBeforeUnwrapped);
        const double delta = naiveWaveAt(0.0, pw, wave) - naiveWaveAt(sBeforeWrapped, pw, wave);
        applySyncBlep(frac, delta, prevSample, curSample);
        if (wave == BassWaveform::Triangle) {
            const double slopeBefore = (sBeforeWrapped < 0.5) ? (4.0 * slaveDt) : (-4.0 * slaveDt);
            const double slopeAfter = 4.0 * slaveDt;
            applySyncBlamp(frac, slopeAfter - slopeBefore, prevSample, curSample);
        }

        // Sub-interval B: [tReset, 1] slave runs from phase 0 to frac * slaveDt.
        const double sAfter = frac * slaveDt;
        addSyncNaturalTransitions(0.0, sAfter, tReset, slaveDt, pw, wave, prevSample, curSample);

        slavePhase_ = wrapPhase(sAfter);
    } else {
        masterPhase_ = nextMaster >= 1.0 ? (nextMaster - std::floor(nextMaster)) : nextMaster;
        const double sEnd = oldSlave + slaveDt;
        addSyncNaturalTransitions(oldSlave, sEnd, 0.0, slaveDt, pw, wave, prevSample, curSample);
        slavePhase_ = wrapPhase(sEnd);
    }

    curSample += naiveWaveAt(slavePhase_, pw, wave);
    oscPendingSample_ = curSample;
    oscPendingValid_ = true;
    return prevSample;
}

double BassSynth::renderSubSample(double subDt, BassSubShape shape) noexcept {
    double v = 0.0;
    if (shape == BassSubShape::Square) {
        const double p = subPhase_;
        v = (p < 0.5 ? 1.0 : -1.0) + polyBlep(p, subDt);
        const double p2 = p >= 0.5 ? (p - 0.5) : (p + 0.5);
        v -= polyBlep(p2, subDt);
        v *= 0.85;
    } else {
        v = std::sin(kTwoPi * subPhase_);
    }
    subPhase_ += subDt;
    if (subPhase_ >= 1.0) subPhase_ -= std::floor(subPhase_);
    return v;
}

void BassSynth::stepEnvelopes(double fltSustain) noexcept {
    // Analog exponential amp ADSR using cached rate/param coefficients.
    switch (ampStage_) {
    case EnvStage::Attack:
        ampLevel_ += (1.2 - ampLevel_) * ampAttCoef_;
        if (ampLevel_ >= 1.0) {
            ampLevel_ = 1.0;
            ampStage_ = EnvStage::Decay;
        }
        break;
    case EnvStage::Decay: {
        const double sus = static_cast<double>(params_.sustain);
        ampLevel_ += (sus - ampLevel_) * ampDecCoef_;
        if (std::abs(ampLevel_ - sus) < 1.0e-5) {
            ampLevel_ = sus;
            ampStage_ = EnvStage::Sustain;
        }
        break;
    }
    case EnvStage::Sustain:
        ampLevel_ = static_cast<double>(params_.sustain);
        break;
    case EnvStage::Release:
        ampLevel_ += (0.0 - ampLevel_) * ampRelCoef_;
        if (ampLevel_ < 1.0e-5) {
            ampLevel_ = 0.0;
            ampStage_ = EnvStage::Idle;
        }
        break;
    case EnvStage::Idle:
        ampLevel_ = 0.0;
        break;
    }

    // Analog exponential filter ADSR (accent shortens filter decay like a 303).
    switch (fltStage_) {
    case EnvStage::Attack:
        fltEnvLevel_ += (1.2 - fltEnvLevel_) * fltAttCoef_;
        if (fltEnvLevel_ >= 1.0) {
            fltEnvLevel_ = 1.0;
            fltStage_ = EnvStage::Decay;
        }
        break;
    case EnvStage::Decay: {
        double coef = fltDecBaseCoef_;
        if (accentLevelSm_ > 1.0e-6) {
            const double accDecayScale = 1.0 - kAccentDecayShorten * accentLevelSm_;
            const double decSec = std::max(0.005, static_cast<double>(params_.filterDecayMs) * 0.001 * accDecayScale);
            const double negX = kLn100 / (decSec * sampleRate_);
            // 4-term Horner series for 1 - exp(-negX), accurate to < 2e-7 for negX <= 0.12.
            coef = std::clamp(negX * (1.0 - negX * (0.5 - negX * ((1.0 / 6.0) - negX * (1.0 / 24.0)))), 0.0, 1.0);
        }
        fltEnvLevel_ += (fltSustain - fltEnvLevel_) * coef;
        if (std::abs(fltEnvLevel_ - fltSustain) < 1.0e-5) {
            fltEnvLevel_ = fltSustain;
            fltStage_ = EnvStage::Sustain;
        }
        break;
    }
    case EnvStage::Sustain:
        fltEnvLevel_ = fltSustain;
        break;
    case EnvStage::Release:
        fltEnvLevel_ += (0.0 - fltEnvLevel_) * fltRelCoef_;
        if (fltEnvLevel_ < 1.0e-5) {
            fltEnvLevel_ = 0.0;
            fltStage_ = EnvStage::Idle;
        }
        break;
    case EnvStage::Idle:
        fltEnvLevel_ = 0.0;
        break;
    }

    ampLevel_ = flushDenormal(ampLevel_);
    fltEnvLevel_ = flushDenormal(fltEnvLevel_);
}

void BassSynth::renderFrames(std::span<float> stereo, std::size_t startFrame, std::size_t frameCount) noexcept {
    if (!prepared_ || frameCount == 0) return;
    const std::size_t maxFrames = stereo.size() / 2;
    if (startFrame >= maxFrames) return;
    const std::size_t frames = std::min(frameCount, maxFrames - startFrame);

    // If completely silent and no DC tail, just advance smoothers and exit fast.
    if (!hasActiveSound()) {
        for (std::size_t i = 0; i < frames; ++i) {
            (void)cutoffLog2Sm_.next();
            (void)resSm_.next();
            (void)driveSm_.next();
            (void)envAmtSm_.next();
            (void)subLevelSm_.next();
            (void)oscLevelSm_.next();
            (void)pwSm_.next();
            (void)syncSemiSm_.next();
            (void)satSm_.next();
            (void)gainLinSm_.next();
            (void)fltSustainSm_.next();
            (void)keyTrackSm_.next();
            (void)fineSm_.next();
            (void)accentAmtSm_.next();
        }
        return;
    }

    const double slideCoef = slideCoef_;
    const double semiOffset = static_cast<double>(params_.semitones);
    const double driftAmt = static_cast<double>(params_.analogDrift);
    const double wanderInc = kTwoPi * 0.37 / sampleRate_;  // slow organic ~0.37 Hz analog pitch wander
    const double subOctMul = (params_.subOctave == -2) ? 0.25 : 0.5;
    const double maxCutHz = std::min(20000.0, sampleRate_ * 0.42);
    const double invOsSr = 1.0 / osSampleRate_;
    const BassWaveform wave = params_.waveform;
    const BassSubShape subShape = params_.subShape;
    const bool hardSync = params_.hardSync;

    for (std::size_t i = 0; i < frames; ++i) {
        // 1. Advance parameter smoothers.
        const double cutoffLog2 = cutoffLog2Sm_.next();
        const double res = resSm_.next();
        const double drive = driveSm_.next();
        const double envAmt = envAmtSm_.next();
        const double subLvl = subLevelSm_.next();
        const double oscLvl = oscLevelSm_.next();
        const double pw = pwSm_.next();
        const double syncSemi = syncSemiSm_.next();
        const double sat = satSm_.next();
        const double masterGain = gainLinSm_.next();
        const double fltSus = fltSustainSm_.next();
        const double keyTrack = keyTrackSm_.next();
        const double fineCents = fineSm_.next();
        const double accentAmt = accentAmtSm_.next();

        // 2. Step envelopes & accent/gain smoothers.
        const double accTarget = accented_ ? accentAmt : 0.0;
        accentLevelSm_ += (accTarget - accentLevelSm_) * accentSlewCoef_;
        accentLevelSm_ = flushDenormal(accentLevelSm_);

        stepEnvelopes(fltSus);
        ampSm_ += (ampLevel_ - ampSm_) * ampSlewCoef_;
        ampSm_ = flushDenormal(ampSm_);

        const double gainTarget = velocity_ * (1.0 + accentLevelSm_ * kAccentGainBoost);
        if (!gainInitialized_) {
            gainModSm_ = gainTarget;
            clipGainSm_ = clipGain_;
            gainInitialized_ = true;
        } else {
            gainModSm_ += (gainTarget - gainModSm_) * gainSlewCoef_;
            clipGainSm_ += (clipGain_ - clipGainSm_) * gainSlewCoef_;
        }
        gainModSm_ = flushDenormal(gainModSm_);
        clipGainSm_ = flushDenormal(clipGainSm_);

        // If amp has closed, drain the FIR downsamplers cleanly to zero, then let only the DC blocker ring out.
        if (ampStage_ == EnvStage::Idle && ampSm_ < 1.0e-6) {
            ampSm_ = 0.0;
            prevVcaGain_ = 0.0;
            if (downsamplerTailFrames_ > 0) {
                --downsamplerTailFrames_;
                const double os2_0 = downsampler4x_.processPair(0.0, 0.0);
                const double os2_1 = downsampler4x_.processPair(0.0, 0.0);
                const double sample = downsampler_.processPair(os2_0, os2_1) * masterGain * clipGainSm_;
                const double dcOut = flushDenormal(sample - dcX_ + dcR_ * dcY_);
                dcX_ = flushDenormal(sample);
                dcY_ = dcOut;
                const float out = static_cast<float>(std::clamp(dcOut, -4.0, 4.0));
                const std::size_t idx = (startFrame + i) * 2;
                stereo[idx] += out;
                stereo[idx + 1] += out;
            } else if (std::abs(dcX_) + std::abs(dcY_) >= 1.0e-9) {
                dcY_ = flushDenormal(dcR_ * dcY_ - dcX_);
                dcX_ = 0.0;
                const float out = static_cast<float>(dcY_);
                const std::size_t idx = (startFrame + i) * 2;
                stereo[idx] += out;
                stereo[idx + 1] += out;
            } else {
                dcX_ = 0.0;
                dcY_ = 0.0;
            }
            continue;
        }
        downsamplerTailFrames_ = 28;

        // 3. Constant-time legato pitch slide (or 1.5 ms micro-declick) + smooth analog drift/wander.
        if (currentNote_ != targetNote_) {
            const double pCoef = pitchDeclickActive_ ? pitchDeclickCoef_ : slideCoef;
            currentNote_ += (targetNote_ - currentNote_) * pCoef;
            if (std::abs(targetNote_ - currentNote_) < 1.0e-4) {
                currentNote_ = targetNote_;
                pitchDeclickActive_ = false;
            }
        } else {
            pitchDeclickActive_ = false;
        }
        if (noteDriftCents_ != targetDriftCents_) {
            noteDriftCents_ += (targetDriftCents_ - noteDriftCents_) * driftSlewCoef_;
            if (std::abs(targetDriftCents_ - noteDriftCents_) < 1.0e-4) {
                noteDriftCents_ = targetDriftCents_;
            }
        }
        wanderPhase_ += wanderInc;
        if (wanderPhase_ >= kTwoPi) wanderPhase_ -= kTwoPi;
        const double driftSemis = (driftAmt > 0.0)
            ? (noteDriftCents_ + 1.8 * driftAmt * std::sin(wanderPhase_)) * 0.01
            : 0.0;

        const double tuneOffset = semiOffset + fineCents * 0.01;
        if (tuneOffset != lastTuneOffset_) {
            lastTuneOffset_ = tuneOffset;
            lastInvTuneRatio_ = (tuneOffset == 0.0) ? 1.0 : std::exp2(-tuneOffset / 12.0);
        }
        const double rootNote = currentNote_ + driftSemis;
        const double oscNote = rootNote + tuneOffset;
        const double masterHz = 440.0 * std::exp2((oscNote - 69.0) * (1.0 / 12.0));
        const double masterDt = sanitizeDt(masterHz * invOsSr);

        double slaveDt = masterDt;
        if (hardSync) {
            if (syncSemi != lastSyncSemi_) {
                lastSyncSemi_ = syncSemi;
                lastSyncRatio_ = std::exp2(syncSemi * (1.0 / 12.0));
            }
            slaveDt = sanitizeDt(masterHz * lastSyncRatio_ * invOsSr);
        }
        const double subHz = masterHz * lastInvTuneRatio_ * subOctMul;
        const double subDt = sanitizeDt(subHz * invOsSr);

        // 4. Filter cutoff modulation: key tracking + exponential envelope + bounded accent emphasis,
        //    slewed smoothly in log2 domain so fast 1 ms filter attacks never cause resonant chirp clicks.
        const double keyOct = ((oscNote - kKeyTrackRefNote) * (1.0 / 12.0)) * keyTrack;
        const double envBoosted = fltEnvLevel_ * (1.0 + kAccentEnvScale * accentLevelSm_);
        // 303 accent swell gently opens cutoff during accented slides after the attack has settled.
        const double accentSwellOct = accentLevelSm_ * kAccentSlideOct * (1.0 - fltEnvLevel_);
        const double totalOct = keyOct + envAmt * envBoosted + (envAmt >= 0.0 ? accentSwellOct : 0.0);
        const double rawCutHz = std::clamp(std::exp2(cutoffLog2 + totalOct), 20.0, maxCutHz);
        const double targetCutLog2 = std::log2(rawCutHz);
        if (!effCutInitialized_) {
            effCutLog2Sm_ = targetCutLog2;
            effCutInitialized_ = true;
        } else {
            effCutLog2Sm_ += (targetCutLog2 - effCutLog2Sm_) * cutoffSlewCoef_;
        }
        const double effCutHz = std::clamp(std::exp2(effCutLog2Sm_), 20.0, maxCutHz);
        const double g = std::tan(kPi * effCutHz * invOsSr);
        const double k = resonanceToK(res);
        const double driveGain = 1.0 + drive * 2.0;
        if (drive != lastDrive_) {
            lastDrive_ = drive;
            lastDriveComp_ = (drive <= 0.0) ? 1.0 : (1.0 / std::pow(driveGain, 0.48));
        }
        const double driveComp = lastDriveComp_;

        const double oscGain = oscLvl * 0.50;
        const double subGain = subLvl * 0.50;
        const double vcaGain0 = prevVcaGain_;
        const double vcaGain1 = ampSm_ * gainModSm_;
        prevVcaGain_ = vcaGain1;

        // 5-7. Run oscillator + sub + 4-pole nonlinear ZDF ladder + VCA + smooth asymmetric
        //      analog saturation at 4x oversampling, then downsample 4x -> 2x -> 1x via
        //      cascaded linear-phase Kaiser half-band FIR filters.
        double os4[4]{};
        for (int sub = 0; sub < 4; ++sub) {
            double src = 0.0;
            if (oscGain > 1.0e-6) {
                src += renderOscSample(masterDt, slaveDt, pw, wave, hardSync) * oscGain;
            }
            if (subGain > 1.0e-6) {
                src += renderSubSample(subDt, subShape) * subGain;
            }
            // Microscopic thermal noise floor during self-oscillation (analog hardware realism).
            if (k > 3.95) {
                src += nextRandomBipolar() * 2.0e-5;
            }
            if (telemetryEnabled_) {
                telemetry_.maxSrc = std::max(telemetry_.maxSrc, std::abs(src));
            }
            const double filtered = processLadderSample(src, g, k, drive, driveGain, driveComp);
            if (telemetryEnabled_) {
                telemetry_.maxLadderOut = std::max(telemetry_.maxLadderOut, std::abs(filtered));
            }
            const double alpha = static_cast<double>(sub + 1) * 0.25;
            const double vca = filtered * (vcaGain0 + (vcaGain1 - vcaGain0) * alpha);
            double satIn = 0.0;
            const double satOut = analogOutputSaturate(vca, sat, satIn);
            if (telemetryEnabled_) {
                telemetry_.maxVcaOut = std::max(telemetry_.maxVcaOut, std::abs(vca));
                telemetry_.maxSatInput = std::max(telemetry_.maxSatInput, std::abs(satIn));
                if (std::abs(satIn) > 1.8) ++telemetry_.satHardKneeHits;
            }
            os4[sub] = satOut;
        }
        const double os2_0 = downsampler4x_.processPair(os4[0], os4[1]);
        const double os2_1 = downsampler4x_.processPair(os4[2], os4[3]);
        double sample = downsampler_.processPair(os2_0, os2_1);

        // 8. Output trim + clip gain + DC blocker.
        sample *= masterGain * clipGainSm_;
        const double dcOut = flushDenormal(sample - dcX_ + dcR_ * dcY_);
        dcX_ = flushDenormal(sample);
        dcY_ = dcOut;
        if (telemetryEnabled_) {
            telemetry_.maxOutput = std::max(telemetry_.maxOutput, std::abs(dcOut));
            if (std::abs(dcOut) > 4.0) ++telemetry_.outputClampHits;
        }

        const float out = static_cast<float>(std::clamp(dcOut, -4.0, 4.0));
        const std::size_t idx = (startFrame + i) * 2;
        stereo[idx] += out;
        stereo[idx + 1] += out;
    }
}

void BassSynth::renderBlock(std::span<float> stereo, std::span<const NoteEvent> events) noexcept {
    if (!prepared_) return;
    const std::size_t totalFrames = stereo.size() / 2;
    if (totalFrames == 0) return;

    std::size_t cursor = 0;
    for (const auto& ev : events) {
        const std::size_t offset = static_cast<std::size_t>(std::clamp(ev.frameOffset, 0, static_cast<int>(totalFrames)));
        if (offset > cursor) {
            renderFrames(stereo, cursor, offset - cursor);
            cursor = offset;
        }
        if (ev.kind == EventKind::NoteOff) {
            noteOff(ev.midiNote, ev.noteId);
        } else {
            noteOn(ev.midiNote, ev.velocity, ev.clipGain, ev.noteId);
        }
    }
    if (cursor < totalFrames) {
        renderFrames(stereo, cursor, totalFrames - cursor);
    }
}

// ---------- BassSynthProcessor (nt::audio::BlockProcessor) ----------

BassSynthProcessor::BassSynthProcessor(const Timeline& timeline, const Track& track) {
    id = "instrument";
    const QJsonObject instrument = track.raw.value(u"instrument").toObject();
    synth_.setParams(bassParamsFromJson(instrument));

    const double maxGainDb = 20.0 * std::log10(static_cast<double>(std::numeric_limits<float>::max()) / 4.0);
    const double documentBpm = timeline.raw.value(u"tempo").toObject().value(u"bpm").toDouble(120.0);
    const double bpm = (std::isfinite(documentBpm) && documentBpm > 0.0) ? documentBpm : 120.0;
    std::uint64_t nextNoteId = 1;

    for (const auto& clip : timeline.clips) {
        if (clip.trackId != track.id || clip.mediaType != MediaType::Midi ||
            clip.muted || clip.hidden || clip.durationMs <= 0.0) {
            continue;
        }
        const auto extracted = audio::vst::extractMidiNoteEvents(
            clip.raw, bpm, 48000.0, clip.inPointMs, clip.durationMs, timeline.raw);
        const auto fades = audio::resolveClipFades(
            clip.fadeInMs, clip.fadeOutMs,
            audio::parseFadeShape(clip.fadeInShape), audio::parseFadeShape(clip.fadeOutShape),
            clip.durationMs);
        const float clipGain = static_cast<float>(std::pow(10.0, std::clamp(clip.volumeDb, -6000.0, maxGainDb) / 20.0));
        const double clipEndMs = clip.startMs + clip.durationMs;

        for (const auto& ev : extracted) {
            const double startMs = clip.startMs + static_cast<double>(ev.startFrame) / 48.0;
            const double offMs = std::min(clip.startMs + static_cast<double>(ev.gateOffFrame) / 48.0, clipEndMs);
            if (offMs <= startMs) continue;
            const float vel = std::clamp(static_cast<float>(ev.velocity) / 127.0f, 0.0f, 1.0f);
            if (vel <= 0.0f) continue;

            const std::uint64_t noteId = nextNoteId++;
            intervals_.push_back(NoteInterval{
                startMs, offMs, ev.pitch, vel, clip.startMs, clip.durationMs, clipGain, fades, noteId});
            events_.push_back(ScheduledEvent{
                startMs, BassSynth::EventKind::NoteOn, ev.pitch, vel, clip.startMs, clip.durationMs, clipGain, fades, noteId});
            events_.push_back(ScheduledEvent{
                offMs, BassSynth::EventKind::NoteOff, ev.pitch, 0.0f, clip.startMs, clip.durationMs, clipGain, fades, noteId});
        }
    }

    // Chronological order; at identical timestamps, NoteOff precedes NoteOn so
    // adjacent non-overlapping notes retrigger cleanly while overlapping notes trigger legato.
    std::stable_sort(events_.begin(), events_.end(), [](const ScheduledEvent& a, const ScheduledEvent& b) {
        if (a.timeMs != b.timeMs) return a.timeMs < b.timeMs;
        return static_cast<int>(a.kind) < static_cast<int>(b.kind);
    });
    std::stable_sort(intervals_.begin(), intervals_.end(), [](const NoteInterval& a, const NoteInterval& b) {
        return a.startMs < b.startMs;
    });

    reset();
}

void BassSynthProcessor::prepare(double rate) {
    synth_.prepare(rate);
    expectedMs_ = std::numeric_limits<double>::quiet_NaN();
}

void BassSynthProcessor::reset() noexcept {
    audio::BlockProcessor::reset();
    synth_.reset();
    next_ = 0;
    expectedMs_ = std::numeric_limits<double>::quiet_NaN();
    heldClipCount_ = 0;
    activeClipStartMs_ = 0.0;
    activeClipDurationMs_ = 0.0;
    activeFades_ = {};
    hasActiveClipFades_ = false;
}

void BassSynthProcessor::pushHeldClip(std::uint64_t noteId, double clipStartMs, double clipDurationMs,
                                      const audio::ResolvedFades& fades) noexcept {
    if (noteId != 0) {
        int writeIdx = 0;
        for (int i = 0; i < heldClipCount_; ++i) {
            if (heldClips_[static_cast<std::size_t>(i)].noteId != noteId) {
                heldClips_[static_cast<std::size_t>(writeIdx++)] = heldClips_[static_cast<std::size_t>(i)];
            }
        }
        heldClipCount_ = writeIdx;
    }
    if (heldClipCount_ >= BassSynth::kMaxHeldNotes) {
        for (int i = 1; i < BassSynth::kMaxHeldNotes; ++i) {
            heldClips_[static_cast<std::size_t>(i - 1)] = heldClips_[static_cast<std::size_t>(i)];
        }
        heldClipCount_ = BassSynth::kMaxHeldNotes - 1;
    }
    heldClips_[static_cast<std::size_t>(heldClipCount_++)] =
        HeldClipMeta{noteId, clipStartMs, clipDurationMs, fades};
    activeClipStartMs_ = clipStartMs;
    activeClipDurationMs_ = clipDurationMs;
    activeFades_ = fades;
    hasActiveClipFades_ = true;
}

void BassSynthProcessor::popHeldClip(std::uint64_t noteId) noexcept {
    if (heldClipCount_ <= 0) return;
    int matchIdx = -1;
    for (int i = 0; i < heldClipCount_; ++i) {
        if (heldClips_[static_cast<std::size_t>(i)].noteId == noteId) {
            matchIdx = i;
            break;
        }
    }
    if (matchIdx < 0) return;
    for (int i = matchIdx + 1; i < heldClipCount_; ++i) {
        heldClips_[static_cast<std::size_t>(i - 1)] = heldClips_[static_cast<std::size_t>(i)];
    }
    --heldClipCount_;
    if (heldClipCount_ > 0) {
        const auto& top = heldClips_[static_cast<std::size_t>(heldClipCount_ - 1)];
        activeClipStartMs_ = top.clipStartMs;
        activeClipDurationMs_ = top.clipDurationMs;
        activeFades_ = top.fades;
        hasActiveClipFades_ = true;
    }
}

bool BassSynthProcessor::hasPendingOutput(int) const noexcept {
    return next_ < events_.size() || synth_.hasActiveSound();
}

bool BassSynthProcessor::setParameter(std::string_view name, double value) noexcept {
    return synth_.setParameter(name, value);
}

void BassSynthProcessor::chaseAt(double timeMs) noexcept {
    reset();
    // Advance event cursor past everything strictly before `timeMs` (O(log N), zero allocation).
    const auto it = std::lower_bound(
        events_.begin(), events_.end(), timeMs,
        [](const ScheduledEvent& ev, double t) { return ev.timeMs < t; });
    next_ = static_cast<std::size_t>(it - events_.begin());
    // Re-trigger any notes currently held across `timeMs` in chronological start order (zero allocation).
    for (const auto& iv : intervals_) {
        if (iv.startMs >= timeMs) break;
        if (iv.offMs > timeMs) {
            pushHeldClip(iv.noteId, iv.clipStartMs, iv.clipDurationMs, iv.fades);
            synth_.noteOn(iv.midiNote, iv.velocity, iv.clipGain, iv.noteId);
        }
    }
}

void BassSynthProcessor::process(std::span<float> stereo, const audio::BlockContext& context) noexcept {
    if (!std::isfinite(context.timelineMs) || context.msPerFrame <= 0.0) return;
    const std::size_t totalFrames = stereo.size() / 2;
    if (totalFrames == 0) return;

    if (!std::isfinite(expectedMs_) || std::abs(context.timelineMs - expectedMs_) > 0.001) {
        chaseAt(context.timelineMs);
    }

    const double blockStartMs = context.timelineMs;
    const double blockEndMs = blockStartMs + static_cast<double>(totalFrames) * context.msPerFrame;

    // Render sample-accurately by splitting the block at each scheduled MIDI event.
    // Apply clip fade envelopes over a small stack scratch buffer when active fades exist.
    std::array<float, 256> fadeScratch{};
    auto renderSlice = [&](std::size_t startFrame, std::size_t count) noexcept {
        if (count == 0) return;
        const bool needFade = hasActiveClipFades_ &&
                              (activeFades_.fadeInMs > 0.0 || activeFades_.fadeOutMs > 0.0);
        if (!needFade) {
            synth_.renderFrames(stereo, startFrame, count);
            return;
        }
        std::size_t done = 0;
        while (done < count) {
            const std::size_t chunk = std::min<std::size_t>(count - done, fadeScratch.size() / 2);
            std::fill_n(fadeScratch.begin(), chunk * 2, 0.0f);
            synth_.renderFrames(std::span<float>(fadeScratch.data(), chunk * 2), 0, chunk);
            for (std::size_t f = 0; f < chunk; ++f) {
                const std::size_t absFrame = startFrame + done + f;
                const double tMs = blockStartMs + static_cast<double>(absFrame) * context.msPerFrame;
                const float fg = static_cast<float>(audio::clipFadeGain(
                    activeFades_, activeClipDurationMs_, tMs - activeClipStartMs_));
                stereo[absFrame * 2] += fadeScratch[f * 2] * fg;
                stereo[absFrame * 2 + 1] += fadeScratch[f * 2 + 1] * fg;
            }
            done += chunk;
        }
    };

    std::size_t cursor = 0;
    while (next_ < events_.size() && events_[next_].timeMs < blockEndMs) {
        const auto& ev = events_[next_++];
        const double deltaFrames = (ev.timeMs - blockStartMs) / context.msPerFrame;
        const std::size_t evFrame = static_cast<std::size_t>(
            std::clamp<long long>(std::llround(deltaFrames), 0LL, static_cast<long long>(totalFrames)));
        if (evFrame > cursor) {
            renderSlice(cursor, evFrame - cursor);
            cursor = evFrame;
        }
        if (ev.kind == BassSynth::EventKind::NoteOff) {
            synth_.noteOff(ev.midiNote, ev.noteId);
            popHeldClip(ev.noteId);
        } else {
            if (ev.velocity > 0.0f) {
                pushHeldClip(ev.noteId, ev.clipStartMs, ev.clipDurationMs, ev.fades);
            }
            synth_.noteOn(ev.midiNote, ev.velocity, ev.clipGain, ev.noteId);
        }
    }

    if (cursor < totalFrames) {
        renderSlice(cursor, totalFrames - cursor);
    }

    expectedMs_ = blockEndMs;
}

}  // namespace nt::midi
