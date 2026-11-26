// Derived from georgi/fablesynth (https://github.com/georgi/fablesynth) at
// commit af55d51 / ae9fca7 (juce/source/dsp/{Engine,Wavetables,Params,DriveOs,LfoShape,LfoClock}).
// FableSynth is published under PolyForm Noncommercial 1.0.0. Its author, who
// also maintains NodeTool, contributes this code to NodeTool under NodeTool's
// licence (AGPL-3.0).

#include "midi/WavetableSynth.h"
#include "midi/WavetablePresets.h"

#include <QJsonObject>

#include <algorithm>
#include <cmath>
#include <numbers>

namespace nt::midi {
namespace {

constexpr double kPi = std::numbers::pi;
constexpr double kLn2 = 0.6931471805599453;
constexpr double kDcR48k = 0.9998;
constexpr double kPosTauSec = 128.0 / (48000.0 * 0.4307829160924542);
constexpr double kCutTauSec = 128.0 / (48000.0 * kLn2);
constexpr double kAdaaFadeWidth = 0.1;

inline double flushDenormal(double x) noexcept {
    return std::abs(x) < 1.0e-24 ? 0.0 : x;
}

inline float flushDenormalF(float x) noexcept {
    return std::abs(x) < 1.0e-24f ? 0.0f : x;
}

inline float sanitizeFloat(float v, float lo, float hi, float fallback) noexcept {
    return std::isfinite(v) ? std::clamp(v, lo, hi) : fallback;
}

inline double smoothCoef(int frames, double tauSr) noexcept {
    return 1.0 - std::exp(-static_cast<double>(frames) / std::max(1.0, tauSr));
}

inline double wrapOscPhase(double phase) noexcept {
    if (!std::isfinite(phase)) return 0.0;
    if (phase < 0.0 || phase >= static_cast<double>(kWavetableSize)) {
        phase = std::fmod(phase, static_cast<double>(kWavetableSize));
        if (phase < 0.0) phase += static_cast<double>(kWavetableSize);
    }
    return phase;
}

inline double readHermite(const float* data, int off, int im1, int i0, int i1, int i2, double f) noexcept {
    const double ym1 = data[off + im1];
    const double y0 = data[off + i0];
    const double y1 = data[off + i1];
    const double y2 = data[off + i2];
    const double c1 = 0.5 * (y1 - ym1);
    const double c2 = ym1 - 2.5 * y0 + 2.0 * y1 - 0.5 * y2;
    const double c3 = 0.5 * (y2 - ym1) + 1.5 * (y0 - y1);
    return ((c3 * f + c2) * f + c1) * f + y0;
}

// Branchless rational approximation to log(cosh(z)) = |z| + log1p(exp(-2|z|)) - ln(2).
// Uses Pade [3/3] for exp(-2|z|/32) squared 5 times and Pade [2/2] for log1p(u):
// max value error < 2.3e-8, max derivative error vs tanh(z) < 3.5e-7 over all real z.
inline double lcosh(double z) noexcept {
    const double a = std::abs(z);
    const double x = std::min(2.0 * a, 36.0);
    const double y = x * 0.03125;
    const double y2 = y * y;
    const double y3 = y2 * y;
    double u = (120.0 - 60.0 * y + 12.0 * y2 - y3) / (120.0 + 60.0 * y + 12.0 * y2 + y3);
    u *= u;
    u *= u;
    u *= u;
    u *= u;
    u *= u;
    const double t = u / (2.0 + u);
    const double s = t * t;
    const double log1pU = (2.0 * t * (1.0 + s * (-7.0 / 9.0 + s * (64.0 / 945.0)))) /
                          (1.0 + s * (-10.0 / 9.0 + s * (5.0 / 21.0)));
    return a + log1pU - kLn2;
}

inline float smoothLinear(float cur, float target, double coef) noexcept {
    const double diff = static_cast<double>(target) - static_cast<double>(cur);
    if (std::abs(diff) < 1e-6) return target;
    return static_cast<float>(static_cast<double>(cur) + diff * coef);
}

inline float smoothLog(float cur, float target, double coef) noexcept {
    if (cur <= 0.0f || target <= 0.0f) return smoothLinear(cur, target, coef);
    const double lc = std::log(static_cast<double>(cur));
    const double lt = std::log(static_cast<double>(target));
    if (std::abs(lt - lc) < 1e-6) return target;
    return static_cast<float>(std::exp(lc + (lt - lc) * coef));
}

double chaseValueAt(const audio::vst::MidiChaseLane& lane, double timeMs) noexcept {
    if (lane.points.empty()) return 0.0;
    const auto it = std::upper_bound(
        lane.points.begin(), lane.points.end(), timeMs,
        [](double t, const audio::vst::MidiChaseLane::Point& p) { return t < p.timeMs; });
    if (it == lane.points.begin()) return static_cast<double>(it->value);
    const auto& prev = *(it - 1);
    if (it == lane.points.end() || lane.step || it->timeMs <= prev.timeMs) {
        return static_cast<double>(prev.value);
    }
    const double frac = (timeMs - prev.timeMs) / (it->timeMs - prev.timeMs);
    return static_cast<double>(prev.value) + frac * static_cast<double>(it->value - prev.value);
}

}  // namespace

std::string_view filterTypeName(FilterType type) noexcept {
    switch (type) {
    case FilterType::Lp12: return "lp12";
    case FilterType::Lp24: return "lp24";
    case FilterType::Bp12: return "bp12";
    case FilterType::Hp12: return "hp12";
    case FilterType::Hp24: return "hp24";
    case FilterType::Bp24: return "bp24";
    case FilterType::None: return "none";
    }
    return "lp24";
}

FilterType filterTypeFromName(std::string_view name) noexcept {
    if (name == "lp12" || name == "LP 12") return FilterType::Lp12;
    if (name == "lp24" || name == "LP 24") return FilterType::Lp24;
    if (name == "bp12" || name == "BP 12") return FilterType::Bp12;
    if (name == "hp12" || name == "HP 12") return FilterType::Hp12;
    if (name == "hp24" || name == "HP 24") return FilterType::Hp24;
    if (name == "bp24" || name == "BP 24") return FilterType::Bp24;
    if (name == "none" || name == "off" || name == "OFF") return FilterType::None;
    return FilterType::Lp24;
}

FilterType filterTypeFromIndex(int index) noexcept {
    const int clamped = std::clamp(index, 0, static_cast<int>(FilterType::None));
    return static_cast<FilterType>(clamped);
}

std::string_view subShapeName(SubShape shape) noexcept {
    return shape == SubShape::Square ? "square" : "sine";
}

SubShape subShapeFromName(std::string_view name) noexcept {
    return (name == "square" || name == "sqr" || name == "SQR") ? SubShape::Square : SubShape::Sine;
}

SubShape subShapeFromIndex(int index) noexcept {
    return index >= 1 ? SubShape::Square : SubShape::Sine;
}

std::string_view noiseTypeName(NoiseType type) noexcept {
    return type == NoiseType::Pink ? "pink" : "white";
}

NoiseType noiseTypeFromName(std::string_view name) noexcept {
    return (name == "pink" || name == "PINK") ? NoiseType::Pink : NoiseType::White;
}

NoiseType noiseTypeFromIndex(int index) noexcept {
    return index >= 1 ? NoiseType::Pink : NoiseType::White;
}

std::string_view lfoShapeName(LfoShape shape) noexcept {
    switch (shape) {
    case LfoShape::Sine: return "sine";
    case LfoShape::Tri: return "tri";
    case LfoShape::Saw: return "saw";
    case LfoShape::Square: return "square";
    case LfoShape::SampleHold: return "sh";
    }
    return "sine";
}

LfoShape lfoShapeFromName(std::string_view name) noexcept {
    if (name == "tri" || name == "TRI") return LfoShape::Tri;
    if (name == "saw" || name == "SAW") return LfoShape::Saw;
    if (name == "square" || name == "sqr" || name == "SQR") return LfoShape::Square;
    if (name == "sh" || name == "s&h" || name == "S&H") return LfoShape::SampleHold;
    return LfoShape::Sine;
}

LfoShape lfoShapeFromIndex(int index) noexcept {
    const int clamped = std::clamp(index, 0, static_cast<int>(LfoShape::SampleHold));
    return static_cast<LfoShape>(clamped);
}

// ---------------- Env ----------------

void WavetableSynth::Env::set(double a, double d, double sus, double r, double sr) noexcept {
    sustain = std::clamp(sus, 0.0, 1.0);
    if (a != lastA || d != lastD || r != lastR || sr != lastSr) {
        lastA = a;
        lastD = d;
        lastR = r;
        lastSr = sr;
        ca = 1.0 - std::exp(-1.0 / (std::max(0.0008, a) * sr));
        cs = 1.0 - std::exp(-9.210340371976184 / (kStealFadeSec * sr));
        cd = 1.0 - std::exp(-1.0 / (std::max(0.002, d / 4.5) * sr));
        cr = 1.0 - std::exp(-1.0 / (std::max(0.002, r / 4.5) * sr));
    }
}

void WavetableSynth::Env::softAttack(double sec) noexcept {
    if (state != 1) return;
    const double sr = lastSr > 0.0 ? lastSr : 48000.0;
    caSoft = std::min(ca, 1.0 - std::exp(-1.0 / (sec * sr)));
}

double WavetableSynth::Env::process() noexcept {
    switch (state) {
    case 1:
        level += (1.45 - level) * (caSoft > 0.0 ? caSoft : ca);
        if (level >= 1.0) {
            level = 1.0;
            caSoft = 0.0;
            state = 2;
        }
        break;
    case 2:
        level += (sustain - level) * cd;
        if (level - sustain < 0.0005) {
            level = sustain;
            state = 3;
        }
        break;
    case 3:
        level = sustain;
        break;
    case 4:
        level -= level * cr;
        if (level < 1e-4) {
            level = 0.0;
            state = 0;
        }
        break;
    case 5:
        level -= level * cs;
        if (level < 1e-4) {
            level = 0.0;
            state = 0;
        }
        break;
    default:
        level = 0.0;
        break;
    }
    level = flushDenormal(level);
    return level;
}

double WavetableSynth::Env::processBlock(int n) noexcept {
    if (state == 0) return level;
    if (state == 3) {
        level = sustain;
        return level;
    }
    for (int i = 0; i < n; ++i) {
        (void)process();
    }
    return level;
}

// ---------------- LFO ----------------

double WavetableSynth::LfoClock::phase(double pos, double r) noexcept {
    if (!ready || pos < position) {
        cycles = pos * r;
        ready = true;
    } else {
        cycles += (pos - position) * rate;
    }
    position = pos;
    rate = r;
    return cycles - std::floor(cycles);
}

void WavetableSynth::LfoState::reset(Rng& rng) noexcept {
    clock.reset();
    phase = 0.0;
    hold = static_cast<double>(rng.next()) * 2.0 - 1.0;
    elapsed = 0;
}

double WavetableSynth::LfoState::value(LfoShape shape, double phaseOffset) const noexcept {
    double p = phase + phaseOffset;
    p -= std::floor(p);
    switch (shape) {
    case LfoShape::Sine: return std::sin(2.0 * kPi * p);
    case LfoShape::Tri: return 1.0 - 4.0 * std::abs(p - 0.5);
    case LfoShape::Saw: return 1.0 - 2.0 * p;
    case LfoShape::Square: return p < 0.5 ? 1.0 : -1.0;
    case LfoShape::SampleHold: return hold;
    }
    return 0.0;
}

double WavetableSynth::LfoState::riseGain(double riseSec, double sr) const noexcept {
    if (riseSec <= 0.0) return 1.0;
    return std::min(1.0, static_cast<double>(elapsed) / (riseSec * sr));
}

void WavetableSynth::LfoState::advance(double rateHz, int n, double sr, Rng& rng) noexcept {
    elapsed += n;
    const double d = (rateHz * static_cast<double>(n)) / sr;
    if (std::isfinite(d)) {
        phase += d;
    }
    if (phase >= 1.0) {
        phase -= std::floor(phase);
        hold = static_cast<double>(rng.next()) * 2.0 - 1.0;
    }
}

// ---------------- 2x Drive Oversampler (inline in WavetableSynth.h) ----------------

void WavetableSynth::FilterState::reset() noexcept {
    active = false;
    for (double& x : svf) x = 0.0;
    osL.reset();
    osR.reset();
    drive = 0.0;
    driveMix = 0.0;
    driveMixTarget = 0.0;
    cutSm = 0.0;
    cutPrev = -1.0;
}

// ---------------- WavetableSynth ----------------

WavetableSynth::WavetableSynth() {
    cur_ = target_;
}

void WavetableSynth::prepare(double sampleRate) {
    // Pre-build immutable tables on the control thread so process() never allocates.
    tables_ = &factoryWavetables();
    subSquare_ = subSquareTable();

    sampleRate_ = (std::isfinite(sampleRate) && sampleRate > 0.0) ? sampleRate : 48000.0;
    // Scale control chunk (~1.33 ms: 59f @ 44.1k, 64f @ 48k, 128f @ 96k) for sample-rate-independent transients.
    controlChunkFrames_ = std::clamp(
        static_cast<int>(std::lround(sampleRate_ * (64.0 / 48000.0))), 16, kRenderChunkFrames);
    svfSubStepFrames_ = std::max(1, controlChunkFrames_ / 2);

    const double r = 48000.0 / sampleRate_;
    dcR_ = std::pow(kDcR48k, r);

    static constexpr double kPinkP48k[6] = {0.99886, 0.99332, 0.969, 0.8665, 0.55, 0.7616};
    static constexpr double kPinkG48k[6] = {0.0555179, 0.0750759, 0.153852, 0.3104856, 0.5329522, 0.016898};
    for (int i = 0; i < 6; ++i) {
        pinkP_[static_cast<std::size_t>(i)] = std::pow(kPinkP48k[i], r);
        pinkG_[static_cast<std::size_t>(i)] = (i == 5)
            ? kPinkG48k[5] * (1.0 + pinkP_[5]) / (1.0 + kPinkP48k[5])
            : kPinkG48k[i] * (1.0 - pinkP_[static_cast<std::size_t>(i)]) / (1.0 - kPinkP48k[i]);
    }
    ampSlewK_ = 1.0 - std::exp(-1.0 / (kAmpSlewSec * sampleRate_));
    velSlewK_ = 1.0 - std::exp(-1.0 / (kVelSlewSec * sampleRate_));
    driveWStep_ = 1.0 / (kDriveOsRampSec * sampleRate_);
    prepared_ = true;
    reset();
}

void WavetableSynth::setParams(const WavetableSynthParams& params) noexcept {
    const WavetableSynthParams def{};
    target_ = params;

    auto sanitizeOsc = [](WavetableSynthParams::Osc& o, const WavetableSynthParams::Osc& d) noexcept {
        o.table = wavetableIdFromIndex(static_cast<int>(o.table));
        o.position = sanitizeFloat(o.position, 0.0f, 1.0f, d.position);
        o.octave = std::clamp(o.octave, -3, 3);
        o.semitones = std::clamp(o.semitones, -24, 24);
        o.fine = sanitizeFloat(o.fine, -100.0f, 100.0f, d.fine);
        o.unison = std::clamp(o.unison, 1, kMaxUnison);
        o.detune = sanitizeFloat(o.detune, 0.0f, 1.0f, d.detune);
        o.spread = sanitizeFloat(o.spread, 0.0f, 1.0f, d.spread);
        o.blend = sanitizeFloat(o.blend, 0.0f, 1.0f, d.blend);
        o.level = sanitizeFloat(o.level, 0.0f, 1.2f, d.level);
        o.pan = sanitizeFloat(o.pan, -1.0f, 1.0f, d.pan);
    };
    sanitizeOsc(target_.oscA, def.oscA);
    sanitizeOsc(target_.oscB, def.oscB);

    target_.sub.shape = subShapeFromIndex(static_cast<int>(target_.sub.shape));
    target_.sub.octave = std::clamp(target_.sub.octave, -2, 0);
    target_.sub.level = sanitizeFloat(target_.sub.level, 0.0f, 1.0f, def.sub.level);

    target_.noise.type = noiseTypeFromIndex(static_cast<int>(target_.noise.type));
    target_.noise.level = sanitizeFloat(target_.noise.level, 0.0f, 1.0f, def.noise.level);

    target_.filter.type = filterTypeFromIndex(static_cast<int>(target_.filter.type));
    target_.filter.cutoffHz = sanitizeFloat(target_.filter.cutoffHz, 20.0f, 20000.0f, def.filter.cutoffHz);
    target_.filter.resonance = sanitizeFloat(target_.filter.resonance, 0.0f, 0.99f, def.filter.resonance);
    target_.filter.drive = sanitizeFloat(target_.filter.drive, 0.0f, 1.0f, def.filter.drive);
    target_.filter.envAmount = sanitizeFloat(target_.filter.envAmount, -1.0f, 1.0f, def.filter.envAmount);
    target_.filter.keyTrack = sanitizeFloat(target_.filter.keyTrack, 0.0f, 1.0f, def.filter.keyTrack);

    auto sanitizeEnv = [](WavetableSynthParams::Env& e, const WavetableSynthParams::Env& d) noexcept {
        e.attackSec = sanitizeFloat(e.attackSec, 0.001f, 8.0f, d.attackSec);
        e.decaySec = sanitizeFloat(e.decaySec, 0.005f, 10.0f, d.decaySec);
        e.sustain = sanitizeFloat(e.sustain, 0.0f, 1.0f, d.sustain);
        e.releaseSec = sanitizeFloat(e.releaseSec, 0.005f, 12.0f, d.releaseSec);
    };
    sanitizeEnv(target_.ampEnv, def.ampEnv);
    sanitizeEnv(target_.modEnv, def.modEnv);

    target_.lfo.shape = lfoShapeFromIndex(static_cast<int>(target_.lfo.shape));
    target_.lfo.rateHz = sanitizeFloat(target_.lfo.rateHz, 0.02f, 30.0f, def.lfo.rateHz);
    target_.lfo.syncDiv = std::clamp(target_.lfo.syncDiv, 0, kLfoSyncDivCount - 1);
    target_.lfo.riseSec = sanitizeFloat(target_.lfo.riseSec, 0.0f, 5.0f, def.lfo.riseSec);
    target_.lfo.phase = sanitizeFloat(target_.lfo.phase, 0.0f, 1.0f, def.lfo.phase);
    target_.lfo.toPitch = sanitizeFloat(target_.lfo.toPitch, -1.0f, 1.0f, def.lfo.toPitch);
    target_.lfo.toPos = sanitizeFloat(target_.lfo.toPos, -1.0f, 1.0f, def.lfo.toPos);
    target_.lfo.toCutoff = sanitizeFloat(target_.lfo.toCutoff, -1.0f, 1.0f, def.lfo.toCutoff);

    target_.velToAmp = sanitizeFloat(target_.velToAmp, 0.0f, 1.0f, def.velToAmp);
    target_.velToCutoff = sanitizeFloat(target_.velToCutoff, -1.0f, 1.0f, def.velToCutoff);
    target_.glideSec = sanitizeFloat(target_.glideSec, 0.0f, 2.0f, def.glideSec);
    target_.pitchBendRange = sanitizeFloat(target_.pitchBendRange, 0.0f, 24.0f, def.pitchBendRange);
    target_.modWheel = sanitizeFloat(target_.modWheel, 0.0f, 1.0f, def.modWheel);
    target_.masterVolume = sanitizeFloat(target_.masterVolume, 0.0f, 1.5f, def.masterVolume);

    cur_ = target_;
    modWheelTarget_ = static_cast<double>(target_.modWheel);
    modWheelCur_ = modWheelTarget_;
}

bool WavetableSynth::setParameter(std::string_view name, double value) noexcept {
    if (!std::isfinite(value)) return false;

    auto setF = [&](float& dst, double lo, double hi, double scale = 1.0) noexcept {
        dst = static_cast<float>(std::clamp(value * scale, lo, hi));
        return true;
    };
    auto setDiscreteI = [&](int& tDst, int& cDst, int lo, int hi) noexcept {
        const int v = std::clamp(static_cast<int>(std::lround(value)), lo, hi);
        tDst = cDst = v;
        return true;
    };
    auto setDiscreteB = [&](bool& tDst, bool& cDst) noexcept {
        const bool v = value >= 0.5;
        tDst = cDst = v;
        return true;
    };

    if (name == "oscA.on" || name == "oscAOn") return setDiscreteB(target_.oscA.on, cur_.oscA.on);
    if (name == "oscA.table" || name == "oscATable") {
        target_.oscA.table = cur_.oscA.table = wavetableIdFromIndex(static_cast<int>(std::lround(value)));
        return true;
    }
    if (name == "oscA.pos" || name == "oscA.position" || name == "oscAPosition") return setF(target_.oscA.position, 0.0, 1.0);
    if (name == "oscA.oct" || name == "oscA.octave" || name == "oscAOctave") return setDiscreteI(target_.oscA.octave, cur_.oscA.octave, -3, 3);
    if (name == "oscA.semi" || name == "oscA.semitones" || name == "oscASemitones") return setDiscreteI(target_.oscA.semitones, cur_.oscA.semitones, -24, 24);
    if (name == "oscA.fine" || name == "oscAFine") return setF(target_.oscA.fine, -100.0, 100.0);
    if (name == "oscA.unison" || name == "oscAUnison") return setDiscreteI(target_.oscA.unison, cur_.oscA.unison, 1, kMaxUnison);
    if (name == "oscA.detune" || name == "oscADetune") return setF(target_.oscA.detune, 0.0, 1.0);
    if (name == "oscA.spread" || name == "oscASpread") return setF(target_.oscA.spread, 0.0, 1.0);
    if (name == "oscA.blend" || name == "oscABlend") return setF(target_.oscA.blend, 0.0, 1.0);
    if (name == "oscA.level" || name == "oscALevel") return setF(target_.oscA.level, 0.0, 1.2);
    if (name == "oscA.pan" || name == "oscAPan") return setF(target_.oscA.pan, -1.0, 1.0);

    if (name == "oscB.on" || name == "oscBOn") return setDiscreteB(target_.oscB.on, cur_.oscB.on);
    if (name == "oscB.table" || name == "oscBTable") {
        target_.oscB.table = cur_.oscB.table = wavetableIdFromIndex(static_cast<int>(std::lround(value)));
        return true;
    }
    if (name == "oscB.pos" || name == "oscB.position" || name == "oscBPosition") return setF(target_.oscB.position, 0.0, 1.0);
    if (name == "oscB.oct" || name == "oscB.octave" || name == "oscBOctave") return setDiscreteI(target_.oscB.octave, cur_.oscB.octave, -3, 3);
    if (name == "oscB.semi" || name == "oscB.semitones" || name == "oscBSemitones") return setDiscreteI(target_.oscB.semitones, cur_.oscB.semitones, -24, 24);
    if (name == "oscB.fine" || name == "oscBFine") return setF(target_.oscB.fine, -100.0, 100.0);
    if (name == "oscB.unison" || name == "oscBUnison") return setDiscreteI(target_.oscB.unison, cur_.oscB.unison, 1, kMaxUnison);
    if (name == "oscB.detune" || name == "oscBDetune") return setF(target_.oscB.detune, 0.0, 1.0);
    if (name == "oscB.spread" || name == "oscBSpread") return setF(target_.oscB.spread, 0.0, 1.0);
    if (name == "oscB.blend" || name == "oscBBlend") return setF(target_.oscB.blend, 0.0, 1.0);
    if (name == "oscB.level" || name == "oscBLevel") return setF(target_.oscB.level, 0.0, 1.2);
    if (name == "oscB.pan" || name == "oscBPan") return setF(target_.oscB.pan, -1.0, 1.0);

    if (name == "sub.on" || name == "subOn") return setDiscreteB(target_.sub.on, cur_.sub.on);
    if (name == "sub.shape" || name == "subShape") {
        target_.sub.shape = cur_.sub.shape = subShapeFromIndex(static_cast<int>(std::lround(value)));
        return true;
    }
    if (name == "sub.oct" || name == "sub.octave" || name == "subOctave") {
        return setDiscreteI(target_.sub.octave, cur_.sub.octave, -2, 0);
    }
    if (name == "sub.level" || name == "subLevel") {
        setF(target_.sub.level, 0.0, 1.0);
        if (target_.sub.level > 0.0f) target_.sub.on = cur_.sub.on = true;
        return true;
    }

    if (name == "noise.on" || name == "noiseOn") return setDiscreteB(target_.noise.on, cur_.noise.on);
    if (name == "noise.type" || name == "noiseType") {
        target_.noise.type = cur_.noise.type = noiseTypeFromIndex(static_cast<int>(std::lround(value)));
        return true;
    }
    if (name == "noise.level" || name == "noiseLevel") {
        setF(target_.noise.level, 0.0, 1.0);
        if (target_.noise.level > 0.0f) target_.noise.on = cur_.noise.on = true;
        return true;
    }

    if (name == "filter.on" || name == "filterOn") {
        setDiscreteB(target_.filter.on, cur_.filter.on);
        if (target_.filter.on && target_.filter.type == FilterType::None) {
            target_.filter.type = cur_.filter.type = FilterType::Lp24;
        }
        return true;
    }
    if (name == "filter.type" || name == "filterType") {
        const FilterType ft = filterTypeFromIndex(static_cast<int>(std::lround(value)));
        target_.filter.type = cur_.filter.type = ft;
        target_.filter.on = cur_.filter.on = (ft != FilterType::None);
        return true;
    }
    if (name == "filter.cutoff" || name == "cutoffHz") return setF(target_.filter.cutoffHz, 20.0, 20000.0);
    if (name == "filter.res" || name == "resonance") return setF(target_.filter.resonance, 0.0, 0.99);
    if (name == "filter.drive" || name == "drive") return setF(target_.filter.drive, 0.0, 1.0);
    if (name == "filter.env") return setF(target_.filter.envAmount, -1.0, 1.0);
    if (name == "filterEnvAmount") return setF(target_.filter.envAmount, -1.0, 1.0, 0.25);
    if (name == "filter.key" || name == "keyTrack") return setF(target_.filter.keyTrack, 0.0, 1.0);

    if (name == "env1.a") return setF(target_.ampEnv.attackSec, 0.001, 8.0);
    if (name == "ampAttackMs") return setF(target_.ampEnv.attackSec, 0.001, 8.0, 0.001);
    if (name == "env1.d") return setF(target_.ampEnv.decaySec, 0.005, 10.0);
    if (name == "ampDecayMs") return setF(target_.ampEnv.decaySec, 0.005, 10.0, 0.001);
    if (name == "env1.s" || name == "ampSustain") return setF(target_.ampEnv.sustain, 0.0, 1.0);
    if (name == "env1.r") return setF(target_.ampEnv.releaseSec, 0.005, 12.0);
    if (name == "ampReleaseMs") return setF(target_.ampEnv.releaseSec, 0.005, 12.0, 0.001);

    if (name == "env2.a") return setF(target_.modEnv.attackSec, 0.001, 8.0);
    if (name == "modAttackMs") return setF(target_.modEnv.attackSec, 0.001, 8.0, 0.001);
    if (name == "env2.d") return setF(target_.modEnv.decaySec, 0.005, 10.0);
    if (name == "modDecayMs") return setF(target_.modEnv.decaySec, 0.005, 10.0, 0.001);
    if (name == "env2.s" || name == "modSustain") return setF(target_.modEnv.sustain, 0.0, 1.0);
    if (name == "env2.r") return setF(target_.modEnv.releaseSec, 0.005, 12.0);
    if (name == "modReleaseMs") return setF(target_.modEnv.releaseSec, 0.005, 12.0, 0.001);

    if (name == "lfo1.shape" || name == "lfoShape") {
        target_.lfo.shape = cur_.lfo.shape = lfoShapeFromIndex(static_cast<int>(std::lround(value)));
        return true;
    }
    if (name == "lfo1.rate" || name == "lfoRateHz") return setF(target_.lfo.rateHz, 0.02, 30.0);
    if (name == "lfo1.sync" || name == "lfoTempoSync") return setDiscreteB(target_.lfo.tempoSync, cur_.lfo.tempoSync);
    if (name == "lfo1.syncrate" || name == "lfoSyncDiv") return setDiscreteI(target_.lfo.syncDiv, cur_.lfo.syncDiv, 0, kLfoSyncDivCount - 1);
    if (name == "lfo1.rise" || name == "lfoRiseSec") return setF(target_.lfo.riseSec, 0.0, 5.0);
    if (name == "lfo1.phase" || name == "lfoPhase") return setF(target_.lfo.phase, 0.0, 1.0);
    if (name == "lfo1.retrig" || name == "lfoRetrig") return setDiscreteB(target_.lfo.retrig, cur_.lfo.retrig);
    if (name == "lfo1.toPitch" || name == "lfoToPitch") return setF(target_.lfo.toPitch, -1.0, 1.0);
    if (name == "lfo1.toPos" || name == "lfoToPos") return setF(target_.lfo.toPos, -1.0, 1.0);
    if (name == "lfo1.toCutoff" || name == "lfoToCutoff") return setF(target_.lfo.toCutoff, -1.0, 1.0);

    if (name == "vel.toAmp" || name == "velToAmp") return setF(target_.velToAmp, 0.0, 1.0);
    if (name == "vel.toCutoff" || name == "velToCutoff") return setF(target_.velToCutoff, -1.0, 1.0);
    if (name == "master.mono" || name == "mono") return setDiscreteB(target_.mono, cur_.mono);
    if (name == "master.legato" || name == "legato") return setDiscreteB(target_.legato, cur_.legato);
    if (name == "master.glide") return setF(target_.glideSec, 0.0, 2.0);
    if (name == "glideMs") return setF(target_.glideSec, 0.0, 2.0, 0.001);
    if (name == "master.pitchBendRange" || name == "pitchBendRange") return setF(target_.pitchBendRange, 0.0, 24.0);
    if (name == "perf.modwheel" || name == "modWheel") {
        setModWheel(static_cast<float>(value));
        return true;
    }
    if (name == "master.volume" || name == "masterVolume") return setF(target_.masterVolume, 0.0, 1.5);
    if (name == "gainDb") {
        const double vol = 0.75 * std::pow(10.0, (std::clamp(value, -60.0, 12.0) + 8.0) / 40.0);
        target_.masterVolume = static_cast<float>(std::clamp(vol, 0.0, 1.5));
        return true;
    }
    return false;
}

void WavetableSynth::reset() noexcept {
    for (auto& v : voices_) {
        killVoice(v);
    }
    heldCount_ = 0;
    sustainDown_ = false;
    hasLastPitch_ = false;
    bendTarget_ = 0.0;
    bendCur_ = 0.0;
    modWheelTarget_ = std::clamp(static_cast<double>(target_.modWheel), 0.0, 1.0);
    modWheelCur_ = modWheelTarget_;
    cur_ = target_;
    globalLfo_.reset(rng_);
}

void WavetableSynth::setTempo(double bpm, double ppq, bool playing) noexcept {
    bpm_ = (std::isfinite(bpm) && bpm > 1.0) ? std::min(bpm, 1000.0) : 120.0;
    ppq_ = std::isfinite(ppq) ? ppq : 0.0;
    playing_ = playing;
}

double WavetableSynth::computeVelGain(double vel) const noexcept {
    const double v = std::clamp(vel, 0.0, 1.0);
    const double wtCurve = 0.25 + 0.75 * v * v;
    const double amt = std::clamp(static_cast<double>(cur_.velToAmp), 0.0, 1.0);
    return (1.0 - amt) + amt * wtCurve;
}

double WavetableSynth::ClipEnvelope::gainAt(double timeMs) const noexcept {
    if (durationMs <= 0.0) return static_cast<double>(gain);
    const double localMs = timeMs - startMs;
    if (localMs < 0.0) {
        return fades.fadeInMs > 0.0 ? 0.0 : static_cast<double>(gain);
    }
    if (localMs >= durationMs) {
        return fades.fadeOutMs > 0.0 ? 0.0 : static_cast<double>(gain);
    }
    return static_cast<double>(gain) * audio::clipFadeGain(fades, durationMs, localMs);
}

void WavetableSynth::killVoice(Voice& v) noexcept {
    v.gate = false;
    v.sustained = false;
    v.hasPending = false;
    v.clipIndex = -1;
    v.pendClipIndex = -1;
    v.ampEnv.kill();
    v.modEnv.kill();
    v.ampSm = 0.0;
    v.velSm = -1.0;
    v.clipGainSm = -1.0;
    v.clipEnvSm = -1.0;
    v.clipEnvSlewing = false;
    v.oscA.posSm = -1.0;
    v.oscB.posSm = -1.0;
    v.oscA.havePrev = false;
    v.oscB.havePrev = false;
    v.subPhase = 0.0;
    v.subIncPrev = -1.0;
    v.filter.reset();
    v.dcxL = v.dcxR = v.dcyL = v.dcyR = 0.0;
    for (double& x : v.pb) x = 0.0;
}

void WavetableSynth::startVoice(Voice& v, int note, double vel, double startPitch, double clipGain, int clipIndex) noexcept {
    v.note = note;
    v.vel = std::clamp(vel, 0.0, 1.0);
    v.clipGain = std::isfinite(clipGain) ? std::max(0.0, clipGain) : 1.0;
    v.clipIndex = clipIndex;
    v.gate = true;
    v.sustained = false;
    v.age = clock_++;
    v.pitch = startPitch;
    v.velGain = computeVelGain(v.vel);
    v.velSm = -1.0;
    v.clipGainSm = -1.0;
    v.clipEnvSm = -1.0;
    v.clipEnvSlewing = false;
    v.ampEnv.trigger();
    v.modEnv.trigger();
    v.lfo.reset(rng_);
    for (int i = 0; i < kMaxUnison; ++i) {
        v.oscA.phases[static_cast<std::size_t>(i)] = static_cast<double>(rng_.next()) * kWavetableSize;
        v.oscB.phases[static_cast<std::size_t>(i)] = static_cast<double>(rng_.next()) * kWavetableSize;
    }
    v.oscA.posSm = -1.0;
    v.oscB.posSm = -1.0;
    v.oscA.havePrev = false;
    v.oscB.havePrev = false;
    v.subPhase = 0.0;
    v.subIncPrev = -1.0;
    v.filter.reset();
    v.dcxL = v.dcxR = v.dcyL = v.dcyR = 0.0;
    for (double& x : v.pb) x = 0.0;
}

void WavetableSynth::retriggerVoice(Voice& v, int note, double vel, double clipGain, int clipIndex) noexcept {
    v.note = note;
    v.vel = std::clamp(vel, 0.0, 1.0);
    v.clipGain = std::isfinite(clipGain) ? std::max(0.0, clipGain) : 1.0;
    if (v.clipIndex != clipIndex && v.clipEnvSm >= 0.0) {
        v.clipEnvSlewing = true;
    }
    v.clipIndex = clipIndex;
    v.gate = true;
    v.sustained = false;
    v.hasPending = false;
    v.age = clock_++;
    v.velGain = computeVelGain(v.vel);
    v.ampEnv.trigger();
    v.modEnv.trigger();
    v.modEnv.softAttack(kRetriggerSoftSec);
    v.lfo.reset(rng_);
}

void WavetableSynth::releaseVoice(Voice& v) noexcept {
    v.gate = false;
    v.sustained = false;
    v.ampEnv.release();
    v.modEnv.release();
}

void WavetableSynth::heldRemove(int note, int clipIndex) noexcept {
    int w = 0;
    for (int i = 0; i < heldCount_; ++i) {
        const HeldNote& h = held_[static_cast<std::size_t>(i)];
        const bool match = h.note == note && (clipIndex < 0 || h.clipIndex == clipIndex);
        if (!match) {
            held_[static_cast<std::size_t>(w++)] = h;
        }
    }
    heldCount_ = w;
}

void WavetableSynth::noteOn(int midiNote, float velocity, float clipGain, int clipIndex) noexcept {
    if (!prepared_) return;
    if (!std::isfinite(velocity) || velocity <= 0.0f) {
        noteOff(midiNote, clipIndex);
        return;
    }
    const int n = std::clamp(midiNote, 0, 127);
    const double vel = std::clamp(static_cast<double>(velocity), 0.0, 1.0);
    const double gain = std::isfinite(clipGain) ? std::max(0.0, static_cast<double>(clipGain)) : 1.0;

    heldRemove(n, clipIndex);
    if (heldCount_ == static_cast<int>(held_.size())) {
        heldRemove(held_[0].note, held_[0].clipIndex);
    }
    held_[static_cast<std::size_t>(heldCount_++)] = HeldNote{n, vel, gain, clipIndex};

    if (cur_.mono) {
        monoNoteOn(n, vel, gain, clipIndex);
    } else {
        polyNoteOn(n, vel, gain, clipIndex);
    }
}

void WavetableSynth::monoNoteOn(int n, double vel, double clipGain, int clipIndex) noexcept {
    Voice* gatedVoice = nullptr;
    Voice* activeVoice = nullptr;
    for (auto& v : voices_) {
        if (v.gate) {
            if (!gatedVoice || v.age > gatedVoice->age) {
                gatedVoice = &v;
            }
        } else if (v.active()) {
            if (!activeVoice || v.age > activeVoice->age) {
                activeVoice = &v;
            }
        }
    }
    Voice* chosen = gatedVoice ? gatedVoice : activeVoice;
    // Silence any stray polyphonic voices from a prior poly->mono switch.
    for (auto& v : voices_) {
        if (&v == chosen) continue;
        if (v.active() || v.hasPending) {
            v.gate = false;
            v.sustained = false;
            v.hasPending = false;
            v.ampEnv.state = 5;
        }
    }
    if (chosen) {
        if (gatedVoice && cur_.legato) {
            chosen->note = n;
            chosen->sustained = false;
            chosen->clipGain = clipGain;
            if (chosen->clipIndex != clipIndex && chosen->clipEnvSm >= 0.0) {
                chosen->clipEnvSlewing = true;
            }
            chosen->clipIndex = clipIndex;
            chosen->age = clock_++;
        } else {
            retriggerVoice(*chosen, n, vel, clipGain, clipIndex);
        }
        lastPitch_ = static_cast<double>(n);
        hasLastPitch_ = true;
        return;
    }
    polyNoteOn(n, vel, clipGain, clipIndex);
}

void WavetableSynth::monoNoteOff(int n, int clipIndex) noexcept {
    for (auto& v : voices_) {
        if (v.hasPending && v.pendNote == n && (clipIndex < 0 || v.pendClipIndex == clipIndex)) {
            v.hasPending = false;
        }
        if (v.gate && v.note == n && (clipIndex < 0 || v.clipIndex == clipIndex)) {
            if (heldCount_ > 0) {
                const HeldNote& back = held_[static_cast<std::size_t>(heldCount_ - 1)];
                v.sustained = false;
                if (cur_.legato) {
                    v.note = back.note;
                    v.clipGain = back.clipGain;
                    if (v.clipIndex != back.clipIndex && v.clipEnvSm >= 0.0) {
                        v.clipEnvSlewing = true;
                    }
                    v.clipIndex = back.clipIndex;
                } else {
                    retriggerVoice(v, back.note, v.vel, back.clipGain, back.clipIndex);
                }
                lastPitch_ = static_cast<double>(back.note);
                hasLastPitch_ = true;
            } else if (sustainDown_) {
                v.sustained = true;
            } else {
                releaseVoice(v);
            }
        }
    }
}

void WavetableSynth::polyNoteOn(int n, double vel, double clipGain, int clipIndex) noexcept {
    Voice* voice = nullptr;
    for (auto& v : voices_) {
        if (v.gate && v.note == n && (clipIndex < 0 || v.clipIndex == clipIndex)) {
            voice = &v;
            break;
        }
    }
    if (!voice) {
        for (auto& v : voices_) {
            if (v.hasPending && v.pendNote == n && (clipIndex < 0 || v.pendClipIndex == clipIndex)) {
                voice = &v;
                break;
            }
        }
    }
    if (!voice) {
        for (auto& v : voices_) {
            if (!v.active() && !v.hasPending) {
                voice = &v;
                break;
            }
        }
    }
    if (!voice) {
        Voice* rel = nullptr;
        Voice* gated = nullptr;
        Voice* pend = nullptr;
        for (auto& v : voices_) {
            if (v.hasPending) {
                if (!pend || v.pendAge < pend->pendAge) pend = &v;
            } else if (v.gate) {
                if (!gated || v.age < gated->age) gated = &v;
            } else {
                if (!rel || v.age < rel->age) rel = &v;
            }
        }
        voice = rel ? rel : (gated ? gated : pend);
    }
    if (!voice) return;

    const double start = (cur_.glideSec > 0.001f && hasLastPitch_) ? lastPitch_ : static_cast<double>(n);
    lastPitch_ = static_cast<double>(n);
    hasLastPitch_ = true;

    if (voice->hasPending || (voice->active() && std::max(voice->ampEnv.level, voice->ampSm) > 1e-3)) {
        // Steal or same-note retrigger of an audible voice: fade smoothly over
        // kStealFadeSec (4 ms) to silence, then launch the queued note click-free.
        voice->pendNote = n;
        voice->pendVel = vel;
        voice->pendStart = start;
        voice->pendClipGain = clipGain;
        voice->pendClipIndex = clipIndex;
        voice->hasPending = true;
        voice->pendAge = clock_++;
        voice->gate = false;
        voice->sustained = false;
        voice->ampEnv.state = 5;
    } else {
        startVoice(*voice, n, vel, start, clipGain, clipIndex);
    }
}

void WavetableSynth::noteOff(int midiNote, int clipIndex) noexcept {
    const int n = std::clamp(midiNote, 0, 127);
    heldRemove(n, clipIndex);
    if (cur_.mono) {
        monoNoteOff(n, clipIndex);
        return;
    }
    for (auto& v : voices_) {
        if (v.hasPending && v.pendNote == n && (clipIndex < 0 || v.pendClipIndex == clipIndex)) {
            v.hasPending = false;
        }
        if (v.gate && v.note == n && (clipIndex < 0 || v.clipIndex == clipIndex)) {
            if (sustainDown_) {
                v.sustained = true;
            } else {
                releaseVoice(v);
            }
        }
    }
}

void WavetableSynth::setPitchBend(float normalizedMinus1To1) noexcept {
    if (!std::isfinite(normalizedMinus1To1)) return;
    bendTarget_ = std::clamp(static_cast<double>(normalizedMinus1To1), -1.0, 1.0);
    if (!hasActiveVoices()) {
        bendCur_ = bendTarget_;
    }
}

void WavetableSynth::setModWheel(float normalized0To1) noexcept {
    if (!std::isfinite(normalized0To1)) return;
    modWheelTarget_ = std::clamp(static_cast<double>(normalized0To1), 0.0, 1.0);
    target_.modWheel = static_cast<float>(modWheelTarget_);
    if (!hasActiveVoices()) {
        modWheelCur_ = modWheelTarget_;
        cur_.modWheel = target_.modWheel;
    }
}

void WavetableSynth::setSustainPedal(bool down) noexcept {
    sustainDown_ = down;
    if (!down) {
        for (auto& v : voices_) {
            if (v.sustained) {
                releaseVoice(v);
            }
        }
    }
}

int WavetableSynth::activeVoiceCount() const noexcept {
    int count = 0;
    for (const auto& v : voices_) {
        if (v.active() || v.hasPending) ++count;
    }
    return count;
}

double WavetableSynth::newestVoicePitch() const noexcept {
    const Voice* best = nullptr;
    for (const auto& v : voices_) {
        if (v.gate && (!best || v.age > best->age)) {
            best = &v;
        }
    }
    return best ? best->pitch : lastPitch_;
}

double WavetableSynth::lfoRateHz() const noexcept {
    if (cur_.lfo.tempoSync) {
        return (bpm_ / 60.0) * lfoSyncDivFactor(cur_.lfo.syncDiv);
    }
    return static_cast<double>(cur_.lfo.rateHz);
}

void WavetableSynth::advanceParamSmoothing(int frames) noexcept {
    const double c = smoothCoef(frames, kParamSmoothSec * sampleRate_);
    const double perfC = smoothCoef(frames, 0.005 * sampleRate_);

    auto smoothOsc = [c](WavetableSynthParams::Osc& dst, const WavetableSynthParams::Osc& tgt) noexcept {
        dst.position = smoothLinear(dst.position, tgt.position, c);
        dst.fine = smoothLinear(dst.fine, tgt.fine, c);
        dst.detune = smoothLinear(dst.detune, tgt.detune, c);
        dst.spread = smoothLinear(dst.spread, tgt.spread, c);
        dst.blend = smoothLinear(dst.blend, tgt.blend, c);
        dst.level = smoothLinear(dst.level, tgt.level, c);
        dst.pan = smoothLinear(dst.pan, tgt.pan, c);
    };
    smoothOsc(cur_.oscA, target_.oscA);
    smoothOsc(cur_.oscB, target_.oscB);

    cur_.sub.level = smoothLinear(cur_.sub.level, target_.sub.level, c);
    cur_.noise.level = smoothLinear(cur_.noise.level, target_.noise.level, c);

    cur_.filter.cutoffHz = smoothLog(cur_.filter.cutoffHz, target_.filter.cutoffHz, c);
    cur_.filter.resonance = smoothLinear(cur_.filter.resonance, target_.filter.resonance, c);
    cur_.filter.drive = smoothLinear(cur_.filter.drive, target_.filter.drive, c);
    cur_.filter.envAmount = smoothLinear(cur_.filter.envAmount, target_.filter.envAmount, c);
    cur_.filter.keyTrack = smoothLinear(cur_.filter.keyTrack, target_.filter.keyTrack, c);

    cur_.ampEnv.attackSec = smoothLog(cur_.ampEnv.attackSec, target_.ampEnv.attackSec, c);
    cur_.ampEnv.decaySec = smoothLog(cur_.ampEnv.decaySec, target_.ampEnv.decaySec, c);
    cur_.ampEnv.sustain = smoothLinear(cur_.ampEnv.sustain, target_.ampEnv.sustain, c);
    cur_.ampEnv.releaseSec = smoothLog(cur_.ampEnv.releaseSec, target_.ampEnv.releaseSec, c);

    cur_.modEnv.attackSec = smoothLog(cur_.modEnv.attackSec, target_.modEnv.attackSec, c);
    cur_.modEnv.decaySec = smoothLog(cur_.modEnv.decaySec, target_.modEnv.decaySec, c);
    cur_.modEnv.sustain = smoothLinear(cur_.modEnv.sustain, target_.modEnv.sustain, c);
    cur_.modEnv.releaseSec = smoothLog(cur_.modEnv.releaseSec, target_.modEnv.releaseSec, c);

    cur_.lfo.rateHz = smoothLog(cur_.lfo.rateHz, target_.lfo.rateHz, c);
    cur_.lfo.riseSec = smoothLinear(cur_.lfo.riseSec, target_.lfo.riseSec, c);
    cur_.lfo.phase = smoothLinear(cur_.lfo.phase, target_.lfo.phase, c);
    cur_.lfo.toPitch = smoothLinear(cur_.lfo.toPitch, target_.lfo.toPitch, c);
    cur_.lfo.toPos = smoothLinear(cur_.lfo.toPos, target_.lfo.toPos, c);
    cur_.lfo.toCutoff = smoothLinear(cur_.lfo.toCutoff, target_.lfo.toCutoff, c);

    cur_.velToAmp = smoothLinear(cur_.velToAmp, target_.velToAmp, c);
    cur_.velToCutoff = smoothLinear(cur_.velToCutoff, target_.velToCutoff, c);
    cur_.glideSec = smoothLinear(cur_.glideSec, target_.glideSec, c);
    cur_.pitchBendRange = smoothLinear(cur_.pitchBendRange, target_.pitchBendRange, c);
    cur_.masterVolume = smoothLinear(cur_.masterVolume, target_.masterVolume, c);

    bendCur_ += (bendTarget_ - bendCur_) * perfC;
    if (std::abs(bendTarget_ - bendCur_) < 1e-6) bendCur_ = bendTarget_;
    modWheelCur_ += (modWheelTarget_ - modWheelCur_) * perfC;
    if (std::abs(modWheelTarget_ - modWheelCur_) < 1e-6) modWheelCur_ = modWheelTarget_;
    cur_.modWheel = static_cast<float>(modWheelCur_);
}

bool WavetableSynth::setupOsc(OscState& o, const WavetableSynthParams::Osc& cfg, const Voice& v,
                              double mPitch, double mPos, int n) noexcept {
    if (!cfg.on || !tables_) return false;
    const int ti = std::clamp(static_cast<int>(cfg.table), 0, kWavetableCount - 1);
    const auto& tbl = (*tables_)[static_cast<std::size_t>(ti)];
    if (tbl.data.empty()) return false;

    const double bendSemis = bendCur_ * static_cast<double>(cur_.pitchBendRange);
    const double basePitch = std::clamp(
        v.pitch + bendSemis + static_cast<double>(cfg.octave * 12 + cfg.semitones) +
            static_cast<double>(cfg.fine) / 100.0 + mPitch * 12.0,
        -60.0, 200.0);
    const double rawFreq = 440.0 * std::pow(2.0, (basePitch - 69.0) / 12.0);
    if (!std::isfinite(rawFreq) || !(rawFreq > 0.0)) return false;
    const double freq = std::clamp(rawFreq, 1.0, sampleRate_ * 0.45);

    double level = std::clamp(static_cast<double>(cfg.level), 0.0, 1.2);
    level *= level;
    if (level < 1e-5) return false;

    const int uni = std::clamp(cfg.unison, 1, kMaxUnison);
    const double det = std::clamp(static_cast<double>(cfg.detune), 0.0, 1.0);
    const double spr = std::clamp(static_cast<double>(cfg.spread), 0.0, 1.0);
    const double blend = std::clamp(static_cast<double>(cfg.blend), 0.0, 1.0);
    const double basePan = std::clamp(static_cast<double>(cfg.pan), -1.0, 1.0);

    const double pos = std::clamp(static_cast<double>(cfg.position) + mPos, 0.0, 1.0);
    if (o.posSm < 0.0) o.posSm = pos;
    o.posSm += (pos - o.posSm) * smoothCoef(n, kPosTauSec * sampleRate_);
    const double posF = o.posSm * static_cast<double>(kWavetableFrames - 1);
    const int f0 = std::min(kWavetableFrames - 1, std::max(0, static_cast<int>(posF)));
    const int f1 = std::min(kWavetableFrames - 1, f0 + 1);
    o.ft = posF - static_cast<double>(f0);

    const double cps = freq / sampleRate_;
    const double maxRatio = std::pow(2.0, (std::abs(det) * 50.0) / 1200.0);
    constexpr double kMipCrossfadeW = 0.07;
    const double mipF = std::log2((cps * maxRatio * 1024.0) / 0.475);
    int mip = 0;
    double mipBlend = 0.0;
    if (mipF > 0.0) {
        mip = std::min(kWavetableMips - 1, static_cast<int>(std::ceil(mipF)));
        const double over = mipF - static_cast<double>(mip - 1);
        if (over < kMipCrossfadeW) mipBlend = 1.0 - over / kMipCrossfadeW;
    }
    const int fineMip = mip > 0 ? mip - 1 : 0;

    o.off0 = (f0 * kWavetableMips + mip) * kWavetableSize;
    o.off1 = (f1 * kWavetableMips + mip) * kWavetableSize;
    o.off0b = (f0 * kWavetableMips + fineMip) * kWavetableSize;
    o.off1b = (f1 * kWavetableMips + fineMip) * kWavetableSize;
    o.mipBlend = mipBlend;
    o.data = tbl.data.data();
    o.uni = uni;

    if (o.cacheUni != uni || o.cacheDet != det || o.cacheSpr != spr ||
        o.cacheBlend != blend || o.cachePan != basePan) {
        double sumW2 = 0.0;
        for (int u = 0; u < uni; ++u) {
            const double sprd = uni > 1 ? (static_cast<double>(u) / static_cast<double>(uni - 1)) * 2.0 - 1.0 : 0.0;
            const double cents = sprd * det * 50.0;
            o.ratios[static_cast<std::size_t>(u)] = std::pow(2.0, cents / 1200.0);
            const double weight = 1.0 - (1.0 - blend) * std::abs(sprd);
            sumW2 += weight * weight;
            const double pan = std::clamp(sprd * spr + basePan, -1.0, 1.0);
            const double a = ((pan + 1.0) * kPi) * 0.25;
            o.gl[static_cast<std::size_t>(u)] = static_cast<float>(std::cos(a) * weight);
            o.gr[static_cast<std::size_t>(u)] = static_cast<float>(std::sin(a) * weight);
        }
        o.sumW2 = sumW2;
        o.cacheUni = uni;
        o.cacheDet = det;
        o.cacheSpr = spr;
        o.cacheBlend = blend;
        o.cachePan = basePan;
    }

    for (int u = 0; u < uni; ++u) {
        o.incs[static_cast<std::size_t>(u)] = cps * o.ratios[static_cast<std::size_t>(u)] * kWavetableSize;
    }
    o.gain = (level * 0.32) / std::sqrt(o.sumW2 > 0.0 ? o.sumW2 : 1.0);
    return true;
}

void WavetableSynth::renderOsc(OscState& o, float* tmpL, float* tmpR, int n) noexcept {
    const float* const data = o.data;
    const double invN = 1.0 / static_cast<double>(n);
    const bool rp = o.havePrev && o.pUni == o.uni;
    const double ft1 = o.ft;
    const double ft0 = (rp && o.pOff0 == o.off0) ? o.pFt : ft1;
    const double dFt = (ft1 - ft0) * invN;
    const double g = o.gain;
    const int off0 = o.off0;
    const int off1 = o.off1;
    const double blend = o.mipBlend;
    const bool useFine = blend >= 0.001;
    const bool singleFrame = (off0 == off1) || (ft0 == 0.0 && ft1 == 0.0);
    const int off0b = o.off0b;
    const int off1b = o.off1b;

    for (int u = 0; u < o.uni; ++u) {
        const auto su = static_cast<std::size_t>(u);
        double ph = wrapOscPhase(o.phases[su]);
        const double inc1 = o.incs[su];
        const double inc0 = rp ? o.pIncs[su] : inc1;
        const double dInc = (inc1 - inc0) * invN;
        const double gl1 = static_cast<double>(o.gl[su]) * g;
        const double gr1 = static_cast<double>(o.gr[su]) * g;
        const double gl0 = rp ? static_cast<double>(o.pGl[su]) : gl1;
        const double gr0 = rp ? static_cast<double>(o.pGr[su]) : gr1;
        const double dGl = (gl1 - gl0) * invN;
        const double dGr = (gr1 - gr0) * invN;

        double ftN = ft0;
        double inc = inc0;
        double gl = gl0;
        double gr = gr0;

        if (!useFine) {
            if (singleFrame) {
                for (int i = 0; i < n; ++i) {
                    const int idx = static_cast<int>(ph) & kWavetableMask;
                    const double frac = ph - static_cast<double>(idx);
                    const int im1 = (idx - 1) & kWavetableMask;
                    const int i1 = (idx + 1) & kWavetableMask;
                    const int i2 = (idx + 2) & kWavetableMask;
                    const double s = readHermite(data, off0, im1, idx, i1, i2, frac);
                    tmpL[i] += static_cast<float>(s * gl);
                    tmpR[i] += static_cast<float>(s * gr);
                    ph += inc;
                    if (ph >= static_cast<double>(kWavetableSize)) ph -= static_cast<double>(kWavetableSize);
                    inc += dInc;
                    gl += dGl;
                    gr += dGr;
                }
            } else {
                for (int i = 0; i < n; ++i) {
                    const int idx = static_cast<int>(ph) & kWavetableMask;
                    const double frac = ph - static_cast<double>(idx);
                    const int im1 = (idx - 1) & kWavetableMask;
                    const int i1 = (idx + 1) & kWavetableMask;
                    const int i2 = (idx + 2) & kWavetableMask;
                    const double s0 = readHermite(data, off0, im1, idx, i1, i2, frac);
                    const double s1 = readHermite(data, off1, im1, idx, i1, i2, frac);
                    const double s = s0 + ftN * (s1 - s0);
                    tmpL[i] += static_cast<float>(s * gl);
                    tmpR[i] += static_cast<float>(s * gr);
                    ph += inc;
                    if (ph >= static_cast<double>(kWavetableSize)) ph -= static_cast<double>(kWavetableSize);
                    ftN += dFt;
                    inc += dInc;
                    gl += dGl;
                    gr += dGr;
                }
            }
        } else if (singleFrame) {
            for (int i = 0; i < n; ++i) {
                const int idx = static_cast<int>(ph) & kWavetableMask;
                const double frac = ph - static_cast<double>(idx);
                const int im1 = (idx - 1) & kWavetableMask;
                const int i1 = (idx + 1) & kWavetableMask;
                const int i2 = (idx + 2) & kWavetableMask;
                const double sc = readHermite(data, off0, im1, idx, i1, i2, frac);
                const double sf = readHermite(data, off0b, im1, idx, i1, i2, frac);
                const double s = sc + blend * (sf - sc);
                tmpL[i] += static_cast<float>(s * gl);
                tmpR[i] += static_cast<float>(s * gr);
                ph += inc;
                if (ph >= static_cast<double>(kWavetableSize)) ph -= static_cast<double>(kWavetableSize);
                inc += dInc;
                gl += dGl;
                gr += dGr;
            }
        } else {
            for (int i = 0; i < n; ++i) {
                const int idx = static_cast<int>(ph) & kWavetableMask;
                const double frac = ph - static_cast<double>(idx);
                const int im1 = (idx - 1) & kWavetableMask;
                const int i1 = (idx + 1) & kWavetableMask;
                const int i2 = (idx + 2) & kWavetableMask;
                const double sc0 = readHermite(data, off0, im1, idx, i1, i2, frac);
                const double sc1 = readHermite(data, off1, im1, idx, i1, i2, frac);
                const double sc = sc0 + ftN * (sc1 - sc0);
                const double sf0 = readHermite(data, off0b, im1, idx, i1, i2, frac);
                const double sf1 = readHermite(data, off1b, im1, idx, i1, i2, frac);
                const double sf = sf0 + ftN * (sf1 - sf0);
                const double s = sc + blend * (sf - sc);
                tmpL[i] += static_cast<float>(s * gl);
                tmpR[i] += static_cast<float>(s * gr);
                ph += inc;
                if (ph >= static_cast<double>(kWavetableSize)) ph -= static_cast<double>(kWavetableSize);
                ftN += dFt;
                inc += dInc;
                gl += dGl;
                gr += dGr;
            }
        }

        o.phases[su] = ph;
        o.pIncs[su] = inc1;
        o.pGl[su] = static_cast<float>(gl1);
        o.pGr[su] = static_cast<float>(gr1);
    }
    o.pFt = ft1;
    o.pOff0 = off0;
    o.pUni = o.uni;
    o.havePrev = true;
}

void WavetableSynth::setupFilter(FilterState& f, const Voice& v, double modEnvLevel, double mCut, int n) noexcept {
    f.active = true;
    f.type = cur_.filter.type;
    f.drive = std::clamp(static_cast<double>(cur_.filter.drive), 0.0, 1.0);
    f.driveMixTarget = std::clamp(f.drive / kAdaaFadeWidth, 0.0, 1.0);

    const double expOct = static_cast<double>(cur_.filter.envAmount) * 4.0 * modEnvLevel
        + (static_cast<double>(cur_.filter.keyTrack) * (v.pitch - 60.0)) / 12.0
        + mCut * 5.0;
    double fc = static_cast<double>(cur_.filter.cutoffHz) * std::pow(2.0, expOct);
    fc = std::clamp(fc, 20.0, sampleRate_ * 0.45);
    if (f.cutSm <= 0.0) f.cutSm = fc;
    f.cutSm += (fc - f.cutSm) * smoothCoef(n, kCutTauSec * sampleRate_);
    f.cutTarget = f.cutSm;

    const double res = std::clamp(static_cast<double>(cur_.filter.resonance), 0.0, 0.99);
    if (f.type == FilterType::Lp24 || f.type == FilterType::Hp24) {
        // FableSynth Finding B3: resonance lives in stage 1, stage 2 critically damped.
        const double r2 = res * res;
        const double resT = res + 0.0035 * r2 * r2;
        const double kk = 2.0 - 1.93 * resT;
        f.k1 = std::max(0.002, 0.5 * kk * kk);
        f.k2 = 2.0;
    } else {
        f.k1 = 2.0 - 1.93 * res;
        f.k2 = f.k1;
    }
}

void WavetableSynth::runFilter(FilterState& f, const float* inL, const float* inR,
                               float* outL, float* outR, int n) noexcept {
    const double drive = f.drive;
    const double mix0 = f.driveMix;
    const double mix1 = f.driveMixTarget;
    const bool active = mix0 > 0.0 || mix1 > 0.0;

    if (!active && f.osL.w <= 0.0 && f.osR.w <= 0.0) {
        for (int i = 0; i < n; ++i) {
            outL[i] = inL[i];
            outR[i] = inR[i];
        }
        if (n > 0) {
            f.osL.xp = DriveOs2::clampIn(inL[n - 1]);
            f.osR.xp = DriveOs2::clampIn(inR[n - 1]);
        }
    } else {
        double dg = 1.0;
        double dcomp = 1.0;
        double kF = 1.0;
        double FpL = 0.0;
        double FpR = 0.0;
        if (active) {
            dg = 1.0 + drive * 7.0;
            dcomp = 1.0 / std::pow(dg, 0.55);
            kF = dcomp / dg;
            FpL = lcosh(dg * f.osL.xp);
            FpR = lcosh(dg * f.osR.xp);
        }
        const double tiny = 1.0e-5 / dg;
        auto sat = [&](double& Fp, double a, double xpv) noexcept {
            const double dx = a - xpv;
            const double Fa = lcosh(dg * a);
            const double r = std::abs(dx) <= tiny ? dcomp * std::tanh(dg * 0.5 * (a + xpv))
                                                  : (kF * (Fa - Fp)) / dx;
            Fp = Fa;
            return r;
        };
        auto satL = [&](double a, double xpv) noexcept { return sat(FpL, a, xpv); };
        auto satR = [&](double a, double xpv) noexcept { return sat(FpR, a, xpv); };
        const double invN = 1.0 / static_cast<double>(n);
        for (int i = 0; i < n; ++i) {
            const double m = mix0 + (mix1 - mix0) * (static_cast<double>(i + 1) * invN);
            outL[i] = static_cast<float>(f.osL.run(inL[i], active, active, m, driveWStep_, satL));
            outR[i] = static_cast<float>(f.osR.run(inR[i], active, active, m, driveWStep_, satR));
        }
    }
    f.driveMix = mix1;

    const double k1 = f.k1;
    const double k2 = f.k2;
    const double c1 = f.cutTarget;
    const double c0 = f.cutPrev > 0.0 ? f.cutPrev : c1;
    const bool twoStage = (f.type == FilterType::Lp24 || f.type == FilterType::Hp24 || f.type == FilterType::Bp24);
    double* const F = f.svf;

    const int svfStep = std::max(1, svfSubStepFrames_);
    for (int at = 0; at < n; at += svfStep) {
        const int m = std::min(svfStep, n - at);
        const double cut = c0 + (c1 - c0) * (static_cast<double>(at + m) / static_cast<double>(n));
        const double gC = std::tan((kPi * cut) / sampleRate_);
        const double a1 = 1.0 / (1.0 + gC * (gC + k1));
        const double a2 = gC * a1;
        const double a3 = gC * a2;
        const double b1 = 1.0 / (1.0 + gC * (gC + k2));
        const double b2 = gC * b1;
        const double b3 = gC * b2;

        auto runStage = [&](float* buf, int o1, double ca1, double ca2, double ca3, auto outFn) noexcept {
            double ic1 = F[o1];
            double ic2 = F[o1 + 1];
            for (int i = at; i < at + m; ++i) {
                const double x = buf[i];
                const double v3 = x - ic2;
                const double v1 = ca1 * ic1 + ca2 * v3;
                const double v2 = ic2 + ca2 * ic1 + ca3 * v3;
                ic1 = 2.0 * v1 - ic1;
                ic2 = 2.0 * v2 - ic2;
                buf[i] = static_cast<float>(outFn(x, v1, v2));
            }
            F[o1] = flushDenormal(ic1);
            F[o1 + 1] = flushDenormal(ic2);
        };

        auto lpOut = [](double, double, double v2) noexcept { return v2; };
        auto bpOut1 = [k1](double, double v1, double) noexcept { return k1 * v1; };
        auto bpOut2 = [k2](double, double v1, double) noexcept { return k2 * v1; };
        auto hpOut1 = [k1](double x, double v1, double v2) noexcept { return x - k1 * v1 - v2; };
        auto hpOut2 = [k2](double x, double v1, double v2) noexcept { return x - k2 * v1 - v2; };

        switch (f.type) {
        case FilterType::Lp12:
        case FilterType::Lp24:
            runStage(outL, 0, a1, a2, a3, lpOut);
            runStage(outR, 2, a1, a2, a3, lpOut);
            if (twoStage) {
                runStage(outL, 4, b1, b2, b3, lpOut);
                runStage(outR, 6, b1, b2, b3, lpOut);
            }
            break;
        case FilterType::Bp12:
        case FilterType::Bp24:
            runStage(outL, 0, a1, a2, a3, bpOut1);
            runStage(outR, 2, a1, a2, a3, bpOut1);
            if (twoStage) {
                runStage(outL, 4, b1, b2, b3, bpOut2);
                runStage(outR, 6, b1, b2, b3, bpOut2);
            }
            break;
        case FilterType::Hp12:
        case FilterType::Hp24:
            runStage(outL, 0, a1, a2, a3, hpOut1);
            runStage(outR, 2, a1, a2, a3, hpOut1);
            if (twoStage) {
                runStage(outL, 4, b1, b2, b3, hpOut2);
                runStage(outR, 6, b1, b2, b3, hpOut2);
            }
            break;
        case FilterType::None:
            break;
        }
    }
    f.cutPrev = c1;
}

void WavetableSynth::renderVoice(Voice& v, float* outL, float* outR, int n,
                                 double chunkStartMs, double msPerFrame,
                                 std::span<const ClipEnvelope> clipEnvelopes) noexcept {
    // Portamento / glide (exact WT-1 exponential pitch slew).
    const double gl = static_cast<double>(cur_.glideSec);
    if (gl > 0.001) {
        const double c = 1.0 - std::exp(-static_cast<double>(n) / (gl * 0.3 * sampleRate_ + 1.0));
        v.pitch += (static_cast<double>(v.note) - v.pitch) * c;
    } else {
        v.pitch = static_cast<double>(v.note);
    }

    // LFO value + rise envelope + mod wheel performance modulation.
    const LfoState& lfoSrc = cur_.lfo.retrig ? v.lfo : globalLfo_;
    const double lfoVal = lfoSrc.value(cur_.lfo.shape, static_cast<double>(cur_.lfo.phase))
        * v.lfo.riseGain(static_cast<double>(cur_.lfo.riseSec), sampleRate_);

    // Mod wheel adds smooth vibrato (~0.48 semi at full wheel) and filter sweep motion.
    const double mPitch = lfoVal * (static_cast<double>(cur_.lfo.toPitch) + modWheelCur_ * 0.04);
    const double mPos = lfoVal * static_cast<double>(cur_.lfo.toPos);
    const double mCut = lfoVal * (static_cast<double>(cur_.lfo.toCutoff) + modWheelCur_ * 0.25)
        + v.vel * static_cast<double>(cur_.velToCutoff);

    v.ampEnv.set(cur_.ampEnv.attackSec, cur_.ampEnv.decaySec, cur_.ampEnv.sustain, cur_.ampEnv.releaseSec, sampleRate_);
    v.modEnv.set(cur_.modEnv.attackSec, cur_.modEnv.decaySec, cur_.modEnv.sustain, cur_.modEnv.releaseSec, sampleRate_);
    // Advance modEnv to the midpoint of the control chunk before setupFilter so fast
    // pluck transients open the filter on chunk 0 across all sample rates.
    const int midN = (n + 1) / 2;
    const double e2 = v.modEnv.processBlock(midN);
    if (n > midN) {
        (void)v.modEnv.processBlock(n - midN);
    }

    std::fill(tmpL_.begin(), tmpL_.begin() + n, 0.0f);
    std::fill(tmpR_.begin(), tmpR_.begin() + n, 0.0f);

    if (setupOsc(v.oscA, cur_.oscA, v, mPitch, mPos, n)) {
        renderOsc(v.oscA, tmpL_.data(), tmpR_.data(), n);
    } else {
        v.oscA.havePrev = false;
    }
    if (setupOsc(v.oscB, cur_.oscB, v, mPitch, mPos, n)) {
        renderOsc(v.oscB, tmpL_.data(), tmpR_.data(), n);
    } else {
        v.oscB.havePrev = false;
    }

    // Sub oscillator (sine or mip-mapped band-limited square).
    if (cur_.sub.on && cur_.sub.level > 0.0f) {
        const double lvl = static_cast<double>(cur_.sub.level) * static_cast<double>(cur_.sub.level) * 0.3;
        if (lvl > 1e-6) {
            const double bendSemis = bendCur_ * static_cast<double>(cur_.pitchBendRange);
            const double subPitch = std::clamp(
                v.pitch + bendSemis + cur_.sub.octave * 12.0 + mPitch * 12.0, -60.0, 200.0);
            const double sf = std::clamp(440.0 * std::pow(2.0, (subPitch - 69.0) / 12.0), 1.0, sampleRate_ * 0.45);
            const double inc1 = sf / sampleRate_;
            const double inc0 = (v.subIncPrev > 0.0 && v.subIncPrev <= 0.45) ? v.subIncPrev : inc1;
            const double dInc = (inc1 - inc0) / static_cast<double>(n);
            double ph = v.subPhase;
            const bool sqr = (cur_.sub.shape == SubShape::Square) && subSquare_ != nullptr;
            const SubSquareMip sqMip = sqr ? selectSubSquareMip(std::max(inc0, inc1)) : SubSquareMip{};
            for (int i = 0; i < n; ++i) {
                const double inc = inc0 + dInc * static_cast<double>(i);
                const double s = sqr ? readSubSquare(subSquare_, sqMip, ph) * 0.7 : std::sin(2.0 * kPi * ph);
                const float o = static_cast<float>(s * lvl);
                tmpL_[static_cast<std::size_t>(i)] += o;
                tmpR_[static_cast<std::size_t>(i)] += o;
                ph += inc;
                if (ph >= 1.0) ph -= 1.0;
            }
            v.subPhase = ph;
            v.subIncPrev = inc1;
        }
    }

    // Noise generator (white or sample-rate-scaled Kellet pink).
    if (cur_.noise.on && cur_.noise.level > 0.0f) {
        const double lvl = static_cast<double>(cur_.noise.level) * static_cast<double>(cur_.noise.level) * 0.35;
        if (lvl > 1e-6) {
            if (cur_.noise.type == NoiseType::Pink) {
                double* const b = v.pb;
                for (int i = 0; i < n; ++i) {
                    const double w = static_cast<double>(rng_.next()) * 2.0 - 1.0;
                    b[0] = pinkP_[0] * b[0] + w * pinkG_[0];
                    b[1] = pinkP_[1] * b[1] + w * pinkG_[1];
                    b[2] = pinkP_[2] * b[2] + w * pinkG_[2];
                    b[3] = pinkP_[3] * b[3] + w * pinkG_[3];
                    b[4] = pinkP_[4] * b[4] + w * pinkG_[4];
                    b[5] = -pinkP_[5] * b[5] - w * pinkG_[5];
                    const double pink = (b[0] + b[1] + b[2] + b[3] + b[4] + b[5] + b[6] + w * 0.5362) * 0.11;
                    b[6] = w * 0.115926;
                    const float o = static_cast<float>(pink * lvl);
                    tmpL_[static_cast<std::size_t>(i)] += o;
                    tmpR_[static_cast<std::size_t>(i)] += o;
                }
                for (int k = 0; k < 7; ++k) b[k] = flushDenormal(b[k]);
            } else {
                for (int i = 0; i < n; ++i) {
                    const float o = static_cast<float>((static_cast<double>(rng_.next()) * 2.0 - 1.0) * lvl);
                    tmpL_[static_cast<std::size_t>(i)] += o;
                    tmpR_[static_cast<std::size_t>(i)] += o;
                }
            }
        }
    }

    // Per-voice ZDF SVF filter + 2x oversampled ADAA drive.
    const float* oL = tmpL_.data();
    const float* oR = tmpR_.data();
    if (cur_.filter.on && cur_.filter.type != FilterType::None) {
        setupFilter(v.filter, v, e2, mCut, n);
        runFilter(v.filter, tmpL_.data(), tmpR_.data(), fltL_.data(), fltR_.data(), n);
        oL = fltL_.data();
        oR = fltR_.data();
    } else if (v.filter.active) {
        v.filter.reset();
    }

    // DC blocker + amp envelope with declick slew + velocity, clip-gain & per-voice clip envelope.
    if (v.velSm < 0.0) v.velSm = v.velGain;
    if (v.clipGainSm < 0.0) v.clipGainSm = v.clipGain;
    const ClipEnvelope* clipEnv = nullptr;
    if (v.clipIndex >= 0 && static_cast<std::size_t>(v.clipIndex) < clipEnvelopes.size() &&
        std::isfinite(chunkStartMs) && msPerFrame > 0.0) {
        clipEnv = &clipEnvelopes[static_cast<std::size_t>(v.clipIndex)];
    }
    const bool envHasFades = clipEnv != nullptr && (clipEnv->fades.fadeInMs > 0.0 || clipEnv->fades.fadeOutMs > 0.0);
    double dcxL = v.dcxL, dcyL = v.dcyL;
    double dcxR = v.dcxR, dcyR = v.dcyR;
    double ampSm = v.ampSm;
    double velSm = v.velSm;
    double clipGainSm = v.clipGainSm;
    double clipEnvSm = v.clipEnvSm;
    bool clipEnvSlewing = v.clipEnvSlewing;
    const double dcR = dcR_;
    const double slewK = ampSlewK_;
    const double velK = velSlewK_;
    const double targetVel = v.velGain;
    const double targetClipGain = v.clipGain;

    for (int i = 0; i < n; ++i) {
        const double sl = oL[i];
        const double sr = oR[i];
        const double yL = sl - dcxL + dcR * dcyL;
        const double yR = sr - dcxR + dcR * dcyR;
        dcxL = sl;
        dcyL = yL;
        dcxR = sr;
        dcyR = yR;

        ampSm += (v.ampEnv.process() - ampSm) * slewK;
        velSm += (targetVel - velSm) * velK;
        clipGainSm += (targetClipGain - clipGainSm) * velK;
        double envGain = 1.0;
        if (clipEnv != nullptr) {
            envGain = envHasFades
                ? clipEnv->gainAt(chunkStartMs + static_cast<double>(i) * msPerFrame)
                : static_cast<double>(clipEnv->gain);
        }
        if (clipEnvSlewing) {
            clipEnvSm += (envGain - clipEnvSm) * velK;
            if (std::abs(envGain - clipEnvSm) < 1e-4) {
                clipEnvSm = envGain;
                clipEnvSlewing = false;
            }
            envGain = clipEnvSm;
        } else {
            clipEnvSm = envGain;
        }
        const double amp = ampSm * velSm * clipGainSm * envGain;
        outL[i] += static_cast<float>(yL * amp);
        outR[i] += static_cast<float>(yR * amp);
    }

    v.dcxL = flushDenormal(dcxL);
    v.dcyL = flushDenormal(dcyL);
    v.dcxR = flushDenormal(dcxR);
    v.dcyR = flushDenormal(dcyR);
    v.ampSm = flushDenormal(ampSm);
    v.velSm = flushDenormal(velSm);
    v.clipGainSm = flushDenormal(clipGainSm);
    v.clipEnvSm = flushDenormal(clipEnvSm);
    v.clipEnvSlewing = clipEnvSlewing;

    v.lfo.advance(lfoRateHz(), n, sampleRate_, rng_);
}

void WavetableSynth::renderChunk(float* stereoOut, int frames, double ppqChunk,
                                 double chunkStartMs, double msPerFrame,
                                 std::span<const ClipEnvelope> clipEnvelopes) noexcept {
    advanceParamSmoothing(frames);

    // Update global LFO (transport-locked when tempoSync && playing, else free-run).
    if (cur_.lfo.tempoSync && playing_) {
        const double ph = globalLfo_.clock.phase(ppqChunk, lfoSyncDivFactor(cur_.lfo.syncDiv));
        if (ph < globalLfo_.phase) {
            globalLfo_.hold = static_cast<double>(rng_.next()) * 2.0 - 1.0;
        }
        globalLfo_.phase = ph;
    } else {
        globalLfo_.clock.reset();
        globalLfo_.advance(lfoRateHz(), frames, sampleRate_, rng_);
    }

    std::fill(mixL_.begin(), mixL_.begin() + frames, 0.0f);
    std::fill(mixR_.begin(), mixR_.begin() + frames, 0.0f);

    for (auto& v : voices_) {
        if (!v.active() && v.hasPending) {
            v.hasPending = false;
            startVoice(v, v.pendNote, v.pendVel, v.pendStart, v.pendClipGain, v.pendClipIndex);
        }
        if (!v.active()) continue;
        renderVoice(v, mixL_.data(), mixR_.data(), frames, chunkStartMs, msPerFrame, clipEnvelopes);
    }

    const float masterGain = static_cast<float>(static_cast<double>(cur_.masterVolume) *
                                                static_cast<double>(cur_.masterVolume) * 1.6);
    for (int i = 0; i < frames; ++i) {
        const float l = flushDenormalF(mixL_[static_cast<std::size_t>(i)] * masterGain);
        const float r = flushDenormalF(mixR_[static_cast<std::size_t>(i)] * masterGain);
        stereoOut[i * 2] += l;
        stereoOut[i * 2 + 1] += r;
    }
}

void WavetableSynth::renderFrames(std::span<float> stereo, std::size_t startFrame, std::size_t frameCount,
                                  double sliceStartMs, double msPerFrame,
                                  std::span<const ClipEnvelope> clipEnvelopes) noexcept {
    if (!prepared_ || frameCount == 0) return;
    const double beatsPerSample = (bpm_ / 60.0) / sampleRate_;
    const std::size_t chunkLimit = static_cast<std::size_t>(std::clamp(controlChunkFrames_, 16, kRenderChunkFrames));
    const bool hasTime = std::isfinite(sliceStartMs) && msPerFrame > 0.0;
    std::size_t done = 0;
    while (done < frameCount) {
        const int run = static_cast<int>(std::min<std::size_t>(chunkLimit, frameCount - done));
        const double chunkStartMs = hasTime ? sliceStartMs + static_cast<double>(done) * msPerFrame : sliceStartMs;
        renderChunk(stereo.data() + (startFrame + done) * 2, run, ppq_, chunkStartMs, msPerFrame, clipEnvelopes);
        if (playing_) {
            ppq_ += static_cast<double>(run) * beatsPerSample;
        }
        done += static_cast<std::size_t>(run);
    }
}

void WavetableSynth::processMidiEvent(const MidiEvent& ev) noexcept {
    switch (ev.type) {
    case MidiEvent::Type::NoteOn:
        noteOn(ev.data1, ev.value, ev.clipGain, ev.clipIndex);
        break;
    case MidiEvent::Type::NoteOff:
        noteOff(ev.data1, ev.clipIndex);
        break;
    case MidiEvent::Type::PitchBend:
        setPitchBend(ev.value);
        break;
    case MidiEvent::Type::ModWheel:
        setModWheel(ev.value);
        break;
    case MidiEvent::Type::Sustain:
        setSustainPedal(ev.value >= 0.5f);
        break;
    }
}

void WavetableSynth::renderBlock(std::span<float> stereo,
                                 std::span<const MidiEvent> events,
                                 double blockStartMs,
                                 double msPerFrame,
                                 std::span<const ClipEnvelope> clipEnvelopes) noexcept {
    const std::size_t totalFrames = stereo.size() / 2;
    if (totalFrames == 0 || !prepared_) return;

    const bool hasTime = std::isfinite(blockStartMs) && msPerFrame > 0.0;
    std::size_t curFrame = 0;
    for (const auto& ev : events) {
        if (ev.frameOffset >= static_cast<int>(totalFrames)) break;
        const std::size_t offset = static_cast<std::size_t>(std::max(0, ev.frameOffset));
        if (offset > curFrame) {
            const double sliceStartMs = hasTime ? blockStartMs + static_cast<double>(curFrame) * msPerFrame : blockStartMs;
            renderFrames(stereo, curFrame, offset - curFrame, sliceStartMs, msPerFrame, clipEnvelopes);
            curFrame = offset;
        }
        processMidiEvent(ev);
    }
    if (curFrame < totalFrames) {
        const double sliceStartMs = hasTime ? blockStartMs + static_cast<double>(curFrame) * msPerFrame : blockStartMs;
        renderFrames(stereo, curFrame, totalFrames - curFrame, sliceStartMs, msPerFrame, clipEnvelopes);
    }
}

// ---------------- WavetableSynthProcessor ----------------

WavetableSynthProcessor::WavetableSynthProcessor(const Timeline& timeline, const Track& track) {
    id = "instrument";
    const auto instrument = track.raw.value(u"instrument").toObject();
    const WavetableSynthParams params = wavetableParamsFromJson(instrument);
    synth_.setParams(params);

    const double docBpm = timeline.raw.value(u"tempo").toObject().value(u"bpm").toDouble(120.0);
    bpm_ = (std::isfinite(docBpm) && docBpm > 1.0) ? std::min(docBpm, 1000.0) : 120.0;

    const double maxGainDb = 20.0 * std::log10(static_cast<double>(std::numeric_limits<float>::max()) / 4.0);
    for (const auto& clip : timeline.clips) {
        if (clip.trackId != track.id || clip.mediaType != MediaType::Midi || clip.muted || clip.hidden ||
            clip.durationMs <= 0.0 || clip.startMs + clip.durationMs <= 0.0) {
            continue;
        }
        const int clipIdx = static_cast<int>(clips_.size());
        WavetableSynth::ClipEnvelope env;
        env.startMs = clip.startMs;
        env.durationMs = clip.durationMs;
        env.gain = static_cast<float>(std::pow(10.0, std::clamp(clip.volumeDb, -6000.0, maxGainDb) / 20.0));
        env.fades = audio::resolveClipFades(
            clip.fadeInMs, clip.fadeOutMs,
            audio::parseFadeShape(clip.fadeInShape), audio::parseFadeShape(clip.fadeOutShape), clip.durationMs);
        clips_.push_back(env);

        // Build each clip's playback stream independently so every MIDI event and
        // chased held note retains its exact source-clip ownership.
        Timeline singleClipTimeline;
        singleClipTimeline.raw = timeline.raw;
        singleClipTimeline.clips.push_back(clip);
        auto clipStream = audio::vst::buildTrackMidiStream(singleClipTimeline, track.id, bpm_);
        for (const auto& ev : clipStream.events) {
            events_.push_back({ev.timeMs, ev.status, ev.data1, ev.data2, ev.clipEndReset, clipIdx});
        }
        for (auto& lane : clipStream.chase) {
            chase_.push_back(std::move(lane));
        }
        for (const auto& held : clipStream.heldNotes) {
            heldNotes_.push_back({held.onMs, held.offMs, held.pitch, held.velocity, clipIdx});
        }
    }

    auto sortClass = [](const TimedMidiEvent& e) noexcept {
        switch (e.status & 0xF0u) {
        case 0x80u: return 0;
        case 0x90u: return e.data2 == 0 ? 0 : 3;
        default: return e.clipEndReset ? 1 : 2;
        }
    };
    std::stable_sort(events_.begin(), events_.end(), [&](const TimedMidiEvent& a, const TimedMidiEvent& b) {
        if (a.timeMs != b.timeMs) return a.timeMs < b.timeMs;
        return sortClass(a) < sortClass(b);
    });
}

void WavetableSynthProcessor::prepare(double rate) {
    synth_.prepare(rate);
    eventCursor_ = 0;
    expectedMs_ = std::numeric_limits<double>::quiet_NaN();
}

void WavetableSynthProcessor::reset() noexcept {
    audio::BlockProcessor::reset();
    synth_.reset();
    eventCursor_ = 0;
    expectedMs_ = std::numeric_limits<double>::quiet_NaN();
}

bool WavetableSynthProcessor::hasPendingOutput(int) const noexcept {
    return eventCursor_ < events_.size() || synth_.hasActiveVoices();
}

bool WavetableSynthProcessor::setParameter(std::string_view name, double value) noexcept {
    return synth_.setParameter(name, value);
}

void WavetableSynthProcessor::chaseAt(double timeMs) noexcept {
    synth_.reset();
    // Chase controller lanes active at `timeMs`.
    for (const auto& lane : chase_) {
        if (timeMs < lane.clipStartMs || timeMs >= lane.clipEndMs) continue;
        if (lane.points.empty() || lane.points.front().timeMs > timeMs) continue;
        const double val = chaseValueAt(lane, timeMs);
        if (lane.statusKind == 0xE0) {
            synth_.setPitchBend(static_cast<float>(std::clamp(val / 8192.0, -1.0, 1.0)));
        } else if (lane.statusKind == 0xB0 && lane.data1 == 1) {
            synth_.setModWheel(static_cast<float>(std::clamp(val / 127.0, 0.0, 1.0)));
        } else if (lane.statusKind == 0xB0 && lane.data1 == 64) {
            synth_.setSustainPedal(val >= 64.0);
        }
    }
    // Re-trigger held notes straddling `timeMs` with their source-clip identity, without allocating.
    for (const auto& held : heldNotes_) {
        if (held.onMs < timeMs && held.offMs > timeMs) {
            synth_.noteOn(held.pitch, static_cast<float>(held.velocity) / 127.0f, 1.0f, held.clipIndex);
        }
    }
    // Position event cursor to the first stream event at or after `timeMs`.
    const auto it = std::lower_bound(
        events_.begin(), events_.end(), timeMs,
        [](const TimedMidiEvent& e, double t) { return e.timeMs < t; });
    eventCursor_ = static_cast<std::size_t>(it - events_.begin());
}

void WavetableSynthProcessor::renderSlice(std::span<float> stereo, std::size_t startFrame, std::size_t frameCount,
                                          std::span<WavetableSynth::MidiEvent> events,
                                          double blockStartMs, double msPerFrame) noexcept {
    if (frameCount == 0) return;
    const double sliceStartMs = blockStartMs + static_cast<double>(startFrame) * msPerFrame;
    synth_.setTempo(bpm_, std::max(0.0, sliceStartMs) * (bpm_ / 60000.0), true);
    for (auto& ev : events) {
        ev.frameOffset -= static_cast<int>(startFrame);
    }
    synth_.renderBlock(
        stereo.subspan(startFrame * 2, frameCount * 2),
        events,
        sliceStartMs,
        msPerFrame,
        std::span<const WavetableSynth::ClipEnvelope>(clips_.data(), clips_.size()));
}

void WavetableSynthProcessor::process(std::span<float> stereo, const audio::BlockContext& context) noexcept {
    if (!std::isfinite(context.timelineMs) || context.msPerFrame <= 0.0) return;
    const std::size_t frames = stereo.size() / 2;
    if (frames == 0) return;

    const double blockStartMs = context.timelineMs;
    const double blockEndMs = blockStartMs + static_cast<double>(frames) * context.msPerFrame;
    if (!std::isfinite(expectedMs_) || std::abs(blockStartMs - expectedMs_) > 0.05) {
        chaseAt(blockStartMs);
    }

    std::size_t renderedFrames = 0;
    std::size_t count = 0;

    auto flushBatch = [&]() noexcept {
        if (count == 0) return;
        const std::size_t lastOffset = static_cast<std::size_t>(blockEvents_[count - 1].frameOffset);
        // Events strictly before `lastOffset` render with `[renderedFrames, lastOffset)`;
        // events exactly at `lastOffset` are applied directly at `lastOffset` so any
        // subsequent event at the same frame is processed before frame `lastOffset` renders.
        std::size_t split = count;
        while (split > 0 && static_cast<std::size_t>(blockEvents_[split - 1].frameOffset) == lastOffset) {
            --split;
        }
        if (lastOffset > renderedFrames) {
            renderSlice(stereo, renderedFrames, lastOffset - renderedFrames,
                        std::span<WavetableSynth::MidiEvent>(blockEvents_.data(), split),
                        blockStartMs, context.msPerFrame);
            renderedFrames = lastOffset;
        }
        for (std::size_t i = split; i < count; ++i) {
            synth_.processMidiEvent(blockEvents_[i]);
        }
        count = 0;
    };

    while (eventCursor_ < events_.size() && events_[eventCursor_].timeMs < blockEndMs) {
        if (count >= kMaxBlockMidiEvents) {
            flushBatch();
        }
        const auto& ev = events_[eventCursor_++];
        const double relFrames = (ev.timeMs - blockStartMs) / context.msPerFrame;
        const int offset = std::clamp(
            static_cast<int>(std::floor(relFrames + 0.5)),
            static_cast<int>(renderedFrames),
            static_cast<int>(frames) - 1);
        const std::uint8_t kind = ev.status & 0xF0u;

        if (kind == 0x90u && ev.data2 > 0) {
            blockEvents_[count++] = {
                offset, WavetableSynth::MidiEvent::Type::NoteOn, ev.data1,
                static_cast<float>(ev.data2) / 127.0f, 1.0f, ev.clipIndex};
        } else if (kind == 0x80u || (kind == 0x90u && ev.data2 == 0)) {
            blockEvents_[count++] = {
                offset, WavetableSynth::MidiEvent::Type::NoteOff, ev.data1, 0.0f, 1.0f, ev.clipIndex};
        } else if (kind == 0xE0u) {
            const int raw14 = (static_cast<int>(ev.data2) << 7) | static_cast<int>(ev.data1);
            const float norm = static_cast<float>(std::clamp((raw14 - 8192) / 8192.0, -1.0, 1.0));
            blockEvents_[count++] = {
                offset, WavetableSynth::MidiEvent::Type::PitchBend, 0, norm, 1.0f, ev.clipIndex};
        } else if (kind == 0xB0u && ev.data1 == 1) {
            blockEvents_[count++] = {
                offset, WavetableSynth::MidiEvent::Type::ModWheel, 1,
                static_cast<float>(ev.data2) / 127.0f, 1.0f, ev.clipIndex};
        } else if (kind == 0xB0u && ev.data1 == 64) {
            blockEvents_[count++] = {
                offset, WavetableSynth::MidiEvent::Type::Sustain, 64,
                ev.data2 >= 64 ? 1.0f : 0.0f, 1.0f, ev.clipIndex};
        }
    }

    if (renderedFrames < frames) {
        renderSlice(stereo, renderedFrames, frames - renderedFrames,
                    std::span<WavetableSynth::MidiEvent>(blockEvents_.data(), count),
                    blockStartMs, context.msPerFrame);
    } else {
        for (std::size_t i = 0; i < count; ++i) {
            synth_.processMidiEvent(blockEvents_[i]);
        }
    }
    expectedMs_ = blockEndMs;
}

}  // namespace nt::midi
