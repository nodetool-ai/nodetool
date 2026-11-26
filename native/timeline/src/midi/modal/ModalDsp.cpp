// Ported from RipplerX (https://github.com/tiagolr/ripplerx) at commit 11683a6.
// Copyright (C) 2025 tiagolr (tilr) — GNU General Public License v3.0 (GPL-3.0).
// Compatible with NodeTool's AGPL-3.0; see native/timeline/licenses/GPL-3.0.txt.
//
// OutputLimiter additionally incorporates the FairlyChildish limiter port:
// Copyright 2006, Thomas Scott Stillwell (BSD 3-Clause license; see ModalDsp.h).
#include "midi/modal/ModalDsp.h"

#include <algorithm>
#include <cmath>
#include <numbers>

namespace nt::midi::modal {
namespace {

constexpr double kPi = std::numbers::pi;
constexpr double kTwoPi = 2.0 * std::numbers::pi;

inline double nextRandomBipolar(std::uint64_t& state) noexcept {
    if (state == 0) state = 0x9E3779B97F4A7C15ULL;
    state ^= state >> 12;
    state ^= state << 25;
    state ^= state >> 27;
    const std::uint64_t r = state * 0x2545F4914F6CDD1DULL;
    const double u = static_cast<double>(r >> 11) * (1.0 / 9007199254740992.0);
    return u * 2.0 - 1.0;
}

inline double susToDb(double val) noexcept {
    return val * 60.0 - 60.0;
}

}  // namespace

std::string_view modalModelName(ModalModel model) noexcept {
    switch (model) {
    case ModalModel::String: return "string";
    case ModalModel::Beam: return "beam";
    case ModalModel::Squared: return "squared";
    case ModalModel::Membrane: return "membrane";
    case ModalModel::Plate: return "plate";
    case ModalModel::Drumhead: return "drumhead";
    case ModalModel::Marimba: return "marimba";
    case ModalModel::OpenTube: return "openTube";
    case ModalModel::ClosedTube: return "closedTube";
    case ModalModel::Marimba2: return "marimba2";
    case ModalModel::Bell: return "bell";
    case ModalModel::Djembe: return "djembe";
    }
    return "string";
}

std::optional<ModalModel> tryModalModelFromName(std::string_view name) noexcept {
    if (name == "string") return ModalModel::String;
    if (name == "beam") return ModalModel::Beam;
    if (name == "squared") return ModalModel::Squared;
    if (name == "membrane") return ModalModel::Membrane;
    if (name == "plate") return ModalModel::Plate;
    if (name == "drumhead") return ModalModel::Drumhead;
    if (name == "marimba") return ModalModel::Marimba;
    if (name == "openTube" || name == "open_tube" || name == "opentube") return ModalModel::OpenTube;
    if (name == "closedTube" || name == "closed_tube" || name == "closedtube") return ModalModel::ClosedTube;
    if (name == "marimba2") return ModalModel::Marimba2;
    if (name == "bell") return ModalModel::Bell;
    if (name == "djembe") return ModalModel::Djembe;
    return std::nullopt;
}

ModalModel modalModelFromName(std::string_view name) noexcept {
    return tryModalModelFromName(name).value_or(ModalModel::String);
}

std::string_view modalModelLabel(ModalModel model) noexcept {
    switch (model) {
    case ModalModel::String: return "String";
    case ModalModel::Beam: return "Beam";
    case ModalModel::Squared: return "Squared";
    case ModalModel::Membrane: return "Membrane";
    case ModalModel::Plate: return "Plate";
    case ModalModel::Drumhead: return "Drumhead";
    case ModalModel::Marimba: return "Marimba";
    case ModalModel::OpenTube: return "Open Tube";
    case ModalModel::ClosedTube: return "Closed Tube";
    case ModalModel::Marimba2: return "Marimba 2";
    case ModalModel::Bell: return "Bell";
    case ModalModel::Djembe: return "Djembe";
    }
    return "String";
}

bool isWaveguideModel(ModalModel model) noexcept {
    return model == ModalModel::OpenTube || model == ModalModel::ClosedTube;
}

double defaultRatioForModel(ModalModel model) noexcept {
    if (model == ModalModel::Beam) return 2.0;
    if (model == ModalModel::Djembe) return 1.0;
    return 0.78;
}

std::string_view noiseFilterModeName(NoiseFilterMode mode) noexcept {
    switch (mode) {
    case NoiseFilterMode::LowPass: return "lp";
    case NoiseFilterMode::BandPass: return "bp";
    case NoiseFilterMode::HighPass: return "hp";
    }
    return "hp";
}

std::optional<NoiseFilterMode> tryNoiseFilterModeFromName(std::string_view name) noexcept {
    if (name == "lp" || name == "LP" || name == "lowpass") return NoiseFilterMode::LowPass;
    if (name == "bp" || name == "BP" || name == "bandpass") return NoiseFilterMode::BandPass;
    if (name == "hp" || name == "HP" || name == "highpass") return NoiseFilterMode::HighPass;
    return std::nullopt;
}

NoiseFilterMode noiseFilterModeFromName(std::string_view name) noexcept {
    return tryNoiseFilterModeFromName(name).value_or(NoiseFilterMode::HighPass);
}

std::string_view modalCouplingName(ModalCoupling coupling) noexcept {
    return coupling == ModalCoupling::Serial ? "serial" : "parallel";
}

std::optional<ModalCoupling> tryModalCouplingFromName(std::string_view name) noexcept {
    if (name == "serial" || name == "A>B") return ModalCoupling::Serial;
    if (name == "parallel" || name == "A+B") return ModalCoupling::Parallel;
    return std::nullopt;
}

ModalCoupling modalCouplingFromName(std::string_view name) noexcept {
    return tryModalCouplingFromName(name).value_or(ModalCoupling::Parallel);
}

int sanitizePartialCount(int count) noexcept {
    if (count <= 1) return 1;
    if (count <= 2) return 2;
    if (count <= 4) return 4;
    if (count <= 8) return 8;
    if (count <= 16) return 16;
    if (count <= 32) return 32;
    return 64;
}

// ---------- BiquadFilter (port of RipplerX Filter.cpp) ----------

void BiquadFilter::lp(double srate, double freq, double q) noexcept {
    const double sr = std::max(1.0, srate);
    const double safeQ = std::max(0.05, q);
    const double w0 = kTwoPi * std::clamp(freq / sr, 1e-5, 0.49);
    const double alpha = std::sin(w0) / (2.0 * safeQ);
    const double scale = 1.0 / (1.0 + alpha);
    a1_ = std::cos(w0) * -2.0 * scale;
    a2_ = (1.0 - alpha) * scale;
    b2_ = b0_ = (1.0 + a1_ + a2_) * 0.25;
    b1_ = b0_ * 2.0;
}

void BiquadFilter::bp(double srate, double freq, double q) noexcept {
    const double sr = std::max(1.0, srate);
    const double safeQ = std::max(0.05, q);
    const double w0 = kTwoPi * std::clamp(freq / sr, 1e-5, 0.49);
    const double alpha = std::sin(w0) / (2.0 * safeQ);
    const double scale = 1.0 / (1.0 + alpha);
    a1_ = std::cos(w0) * -2.0 * scale;
    a2_ = (1.0 - alpha) * scale;
    b0_ = (1.0 - a2_) * 0.5 * safeQ;
    b2_ = -b0_;
    b1_ = 0.0;
}

void BiquadFilter::hp(double srate, double freq, double q) noexcept {
    const double sr = std::max(1.0, srate);
    const double safeQ = std::max(0.05, q);
    const double w0 = kTwoPi * std::clamp(freq / sr, 1e-5, 0.49);
    const double alpha = std::sin(w0) / (2.0 * safeQ);
    const double scale = 1.0 / (1.0 + alpha);
    a1_ = std::cos(w0) * -2.0 * scale;
    a2_ = (1.0 - alpha) * scale;
    b2_ = b0_ = (1.0 - a1_ + a2_) * 0.25;
    b1_ = b0_ * -2.0;
}

void BiquadFilter::clear(double input) noexcept {
    x0_ = x1_ = input;
    const double denom = 1.0 + a1_ + a2_;
    y0_ = y1_ = (std::abs(denom) > 1e-12) ? (input / denom * (b0_ + b1_ + b2_)) : 0.0;
}

void BiquadFilter::copyCoeffs(const BiquadFilter& src) noexcept {
    a1_ = src.a1_;
    a2_ = src.a2_;
    b0_ = src.b0_;
    b1_ = src.b1_;
    b2_ = src.b2_;
}

double BiquadFilter::df1(double sample) noexcept {
    const double x2 = x1_;
    x1_ = x0_;
    x0_ = sample;

    const double y2 = y1_;
    y1_ = y0_;
    const double raw = b0_ * x0_ + b1_ * x1_ + b2_ * x2 - a1_ * y1_ - a2_ * y2;
    if (!std::isfinite(raw)) [[unlikely]] {
        ++nonFiniteCount;
        y0_ = 0.0;
    } else {
        const double absRaw = std::abs(raw);
        if (absRaw > maxRawAbs) maxRawAbs = absRaw;
        y0_ = (absRaw < kDenormalFloor) ? 0.0 : raw;
    }
    return y0_;
}

// ---------- TensionEnvelope (port of RipplerX Envelope.cpp) ----------

double TensionEnvelope::normalizeTension(double t) noexcept {
    t = std::clamp(t, -1.0, 1.0) + 1.0;
    return t == 1.0 ? 100.0 : (t > 1.0 ? 3.001 - t : 0.001 + t);
}

void TensionEnvelope::init(double srate, double attackMs, double decayMs, double sustainDb,
                           double releaseMs, double tensionA, double tensionD, double tensionR) noexcept {
    const double sr = std::max(1.0, srate);
    att_ = std::max(attackMs, 1.0) * 0.001 * sr;
    dec_ = std::max(decayMs, 1.0) * 0.001 * sr;
    sus_ = std::pow(10.0, std::min(sustainDb, 0.0) / 20.0);
    rel_ = std::max(releaseMs, 1.0) * 0.001 * sr;

    ta_ = normalizeTension(tensionA);
    td_ = normalizeTension(-1.0 * tensionD);
    tr_ = normalizeTension(-1.0 * tensionR);
}

std::pair<double, double> TensionEnvelope::calcCoefs(
    double targetB1, double targetB2, double targetC,
    double rate, double tension, double mult) noexcept {
    const double safeRate = std::max(1.0, rate);
    const double safeC = std::max(0.0, targetC);
    double c = 0.0;
    double b = 0.0;
    if (tension > 1.0) {
        const double t = std::pow(tension - 1.0, 3.0);
        c = std::exp(std::log((safeC + t) / t) / safeRate);
        b = (targetB1 - mult * t) * (1.0 - c);
    } else {
        const double t = std::max(1e-12, std::pow(tension, 3.0));
        c = std::exp(-std::log((safeC + t) / t) / safeRate);
        b = (targetB2 + mult * t) * (1.0 - c);
    }
    return {b, c};
}

void TensionEnvelope::recalcCoefs() noexcept {
    const auto [b, c] = calcCoefs(0.0, scale_, scale_, att_, ta_, 1.0);
    ab_ = b;
    ac_ = c;
    const auto [b2, c2] = calcCoefs(1.0, sus_ * scale_, (1.0 - sus_) * scale_, dec_, td_, -1.0);
    db_ = b2;
    dc_ = c2;
}

void TensionEnvelope::reset() noexcept {
    state_ = kStateOff;
    env_ = 0.0;
}

void TensionEnvelope::attack(double scale) noexcept {
    scale_ = std::max(0.0, scale);
    recalcCoefs();
    state_ = kStateAttack;
}

void TensionEnvelope::decay() noexcept {
    env_ = scale_;
    state_ = kStateDecay;
}

void TensionEnvelope::sustain() noexcept {
    env_ = scale_ * sus_;
    state_ = kStateSustain;
}

void TensionEnvelope::release() noexcept {
    if (state_ == kStateOff) return;
    const double start = std::max(env_, sus_) * scale_;
    const auto [b, c] = calcCoefs(start, 0.0, start, rel_, tr_, -1.0);
    rb_ = b;
    rc_ = c;
    state_ = kStateRelease;
}

int TensionEnvelope::process() noexcept {
    if (state_ == kStateOff) return kStateOff;

    if (state_ == kStateAttack) {
        env_ = flushDenormal(ab_ + env_ * ac_);
        if (env_ >= scale_) decay();
    } else if (state_ == kStateDecay) {
        env_ = flushDenormal(db_ + env_ * dc_);
        if (env_ <= sus_ * scale_) sustain();
    } else if (state_ == kStateRelease) {
        env_ = flushDenormal(rb_ + env_ * rc_);
        if (env_ <= 0.0) reset();
    }
    return state_;
}

// ---------- ImpulseMallet (port of RipplerX Mallet.cpp, impulse mode) ----------

void ImpulseMallet::trigger(double srate, double freqHz) noexcept {
    const double sr = std::max(1.0, srate);
    filter_.clear(0.0);
    filter_.bp(sr, std::clamp(freqHz, 20.0, sr * 0.49), 0.707);
    countdown_ = std::max(1, static_cast<int>(sr / 10.0));  // 100 ms impulse decay window
    impulse_ = 1.0;
    env_ = std::exp(-100.0 / sr);
}

void ImpulseMallet::clear() noexcept {
    countdown_ = 0;
    impulse_ = 0.0;
    filter_.clear(0.0);
}

double ImpulseMallet::process() noexcept {
    if (countdown_ <= 0) return 0.0;
    const double sample = filter_.df1(impulse_) * 2.0;
    countdown_ -= 1;
    impulse_ = flushDenormal(impulse_ * env_);
    return sample;
}

// ---------- NoiseExciter (port of RipplerX Noise.cpp) ----------

void NoiseExciter::init(double srate, NoiseFilterMode filterMode, double freqHz, double q,
                        double attMs, double decMs, double sus, double relMs,
                        double velFreq, double velQ,
                        double attTen, double decTen, double relTen,
                        double velAtt, double velDec, double velSus, double velRel) noexcept {
    srate_ = std::max(1.0, srate);
    fmode_ = filterMode;
    freq_ = std::clamp(freqHz, 20.0, 20000.0);
    q_ = std::clamp(q, 0.707, 4.0);
    velFreq_ = std::clamp(velFreq, -1.0, 1.0);
    velQ_ = std::clamp(velQ, -1.0, 1.0);
    initFilter();

    att_ = std::clamp(attMs, 1.0, 20000.0);
    dec_ = std::clamp(decMs, 1.0, 20000.0);
    sus_ = std::clamp(sus, 0.0, 1.0);
    rel_ = std::clamp(relMs, 1.0, 20000.0);

    attTen_ = std::clamp(attTen, -1.0, 1.0);
    decTen_ = std::clamp(decTen, -1.0, 1.0);
    relTen_ = std::clamp(relTen, -1.0, 1.0);

    velAtt_ = std::clamp(velAtt, -1.0, 1.0);
    velDec_ = std::clamp(velDec, -1.0, 1.0);
    velSus_ = std::clamp(velSus, -1.0, 1.0);
    velRel_ = std::clamp(velRel, -1.0, 1.0);

    initEnvelope();
}

void NoiseExciter::attack(double vel) noexcept {
    vel_ = std::clamp(vel, 0.0, 1.0);
    initFilter();
    initEnvelope();
    env_.attack(1.0);
}

void NoiseExciter::initFilter() noexcept {
    const double f = std::clamp(std::exp(std::log(freq_) + vel_ * velFreq_ * (std::log(20000.0) - std::log(20.0))), 20.0, 20000.0);
    const double res = std::clamp(q_ + vel_ * velQ_ * (4.0 - 0.707), 0.707, 4.0);

    filterActive_ = (fmode_ == NoiseFilterMode::BandPass) ||
                    (fmode_ == NoiseFilterMode::LowPass && f < 20000.0) ||
                    (fmode_ == NoiseFilterMode::HighPass && f > 20.0);

    switch (fmode_) {
    case NoiseFilterMode::LowPass: filter_.lp(srate_, f, res); break;
    case NoiseFilterMode::BandPass: filter_.bp(srate_, f, res); break;
    case NoiseFilterMode::HighPass: filter_.hp(srate_, f, res); break;
    }
    oscFilter_.copyCoeffs(filter_);
}

void NoiseExciter::initEnvelope() noexcept {
    const double logSpan = std::log(20000.0);  // log(20000) - log(1)
    const double effAtt = std::clamp(std::exp(std::log(att_) + vel_ * velAtt_ * logSpan), 1.0, 20000.0);
    const double effDec = std::clamp(std::exp(std::log(dec_) + vel_ * velDec_ * logSpan), 1.0, 20000.0);
    const double effSus = std::clamp(sus_ + vel_ * velSus_, 0.0, 1.0);
    const double effRel = std::clamp(std::exp(std::log(rel_) + vel_ * velRel_ * logSpan), 1.0, 20000.0);

    env_.init(srate_, effAtt, effDec, susToDb(effSus), effRel, attTen_, decTen_, relTen_);
}

void NoiseExciter::release() noexcept {
    env_.release();
}

void NoiseExciter::clear() noexcept {
    env_.reset();
    filter_.clear(0.0);
    oscFilter_.clear(0.0);
}

double NoiseExciter::process(std::uint64_t& rngState) noexcept {
    if (env_.state() == TensionEnvelope::kStateOff) return 0.0;
    env_.process();
    double sample = nextRandomBipolar(rngState);
    if (filterActive_) {
        sample = filter_.df1(sample);
    }
    if (env_.state() == TensionEnvelope::kStateOff) {
        filter_.clear(0.0);
    }
    return sample * env_.level();
}

double NoiseExciter::processOsc(double input) noexcept {
    if (env_.state() == TensionEnvelope::kStateOff) return 0.0;
    return (filterActive_ ? oscFilter_.df1(input) : input) * env_.level();
}

// ---------- ModalModels (port of RipplerX Models.cpp) ----------

const std::array<double, kMaxPartials>& ModalModels::bFreeRoots() noexcept {
    static constexpr std::array<double, kMaxPartials> kBFree = {
        1.50561873, 2.49975267, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5,
        9.5, 10.5, 11.5, 12.5, 13.5, 14.5, 15.5, 16.5,
        17.5, 18.5, 19.5, 20.5, 21.5, 22.5, 23.5, 24.5,
        25.5, 26.5, 27.5, 28.5, 29.5, 30.5, 31.5, 32.5,
        33.5, 34.5, 35.5, 36.5, 37.5, 38.5, 39.5, 40.5,
        41.5, 42.5, 43.5, 44.5, 45.5, 46.5, 47.5, 48.5,
        49.5, 50.5, 51.5, 52.5, 53.5, 54.5, 55.5, 56.5,
        57.5, 58.5, 59.5, 60.5, 61.5, 62.5, 63.5, 64.5,
    };
    return kBFree;
}

ModalModels::ModalModels() noexcept
    : aModels_{{
          // 0: String (fk = k)
          {1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0, 16.0,
           17.0, 18.0, 19.0, 20.0, 21.0, 22.0, 23.0, 24.0, 25.0, 26.0, 27.0, 28.0, 29.0, 30.0, 31.0, 32.0,
           33.0, 34.0, 35.0, 36.0, 37.0, 38.0, 39.0, 40.0, 41.0, 42.0, 43.0, 44.0, 45.0, 46.0, 47.0, 48.0,
           49.0, 50.0, 51.0, 52.0, 53.0, 54.0, 55.0, 56.0, 57.0, 58.0, 59.0, 60.0, 61.0, 62.0, 63.0, 64.0},
          // 1: Beam (recalculated via recalcBeam)
          {1.0, 2.742118730723096, 5.372437705395023, 8.879796231350905, 13.26432297929055, 18.525894832548836,
           24.664464701923304, 31.680011427264994, 39.57480167993186, 48.34386187557112, 57.98998201587341, 68.51312839987956,
           79.91327932335997, 92.19042029669127, 105.34454134738507, 119.37563542989709, 134.286605658006, 150.07132597088105,
           166.73305349293955, 184.27177735520195, 202.68748915580662, 221.9801823173097, 242.14985163115497, 263.1964929295172,
           285.1237904740257, 307.92409320904443, 331.6013888047332, 356.1556713642617, 381.58693597293706, 407.89517850825996,
           435.08039549149447, 463.1425839706985, 492.0862467609114, 521.9021136490643, 552.5949669402571, 584.164802709515,
           616.6116175480827, 649.9354084840451, 684.1361729168341, 719.2139085629082, 755.1739518807949, 792.0053758900387,
           829.7137826702212, 868.2991693165571, 907.7615332399005, 948.1008721264657, 989.3171839034187, 1031.4104667093834,
           1074.3868982163283, 1118.233875919467, 1162.9578340759736, 1208.5587703942417, 1255.0366827948008, 1302.3915693871795,
           1350.6234284496627, 1399.7322584115318, 1449.7250824905104, 1500.5876119645127, 1552.3271202881517, 1604.9436055754263,
           1658.4370660924033, 1712.8075002427393, 1768.0549065547818, 1824.179283670064},
          // 2: Squared (fk = k^2)
          {1.0, 4.0, 9.0, 16.0, 24.999999999999996, 36.0, 49.0, 64.0, 81.0, 99.99999999999999, 121.0, 144.0,
           169.0, 196.0, 225.0, 256.0, 289.0, 324.0, 361.0, 399.99999999999994, 441.0, 484.0, 529.0, 576.0,
           625.0, 676.0, 729.0, 784.0, 840.9999999999999, 900.0, 961.0, 1024.0, 1089.0, 1156.0, 1225.0, 1296.0,
           1369.0, 1444.0, 1521.0, 1599.9999999999998, 1680.9999999999998, 1764.0, 1849.0, 1936.0, 2024.9999999999998, 2116.0,
           2209.0, 2304.0, 2401.0, 2500.0, 2601.0, 2704.0, 2808.9999999999995, 2916.0, 3025.0, 3136.0, 3248.9999999999995,
           3363.9999999999995, 3481.0, 3600.0, 3720.9999999999995, 3844.0, 3968.9999999999995, 4096.0},
          // 3: Membrane (recalculated via recalcMembrane, default ratio 0.78)
          {1.0, 1.46109285817633, 2.0065176070089703, 2.583401188563129, 3.17463993575823, 3.773492277607296,
           4.376834180480457, 4.983035133780558, 1.6926924291749292, 2.0, 2.427204269735683, 2.92218571635266,
           3.455943631122641, 4.013035214017941, 4.584962933678762, 5.166802377126258, 2.4441536557186816, 2.6662106880321503,
           3.0, 3.4128944891151236, 3.8797198113361246, 4.38327857452899, 4.912287098306147, 5.459352181097535,
           3.213415363586011, 3.3853848583498585, 3.6540595515354726, 4.0, 4.405039956758808, 4.854408539471366,
           5.336920061454232, 5.84437143270532, 3.990195644111825, 4.129945958302949, 4.352904109387891, 4.647109099145228,
           5.0, 5.400083818557902, 5.837665519855606, 6.304942539213217, 4.770823412246371, 4.888307311437363,
           5.078077287524788, 5.332421376064301, 5.6426141771832246, 6.0, 6.3966736257417525, 6.825788978230247,
           5.553676490089963, 5.654919530531964, 5.819745309187935, 6.042953272833355, 6.318359065318225, 6.639470349789949,
           7.0, 7.394184316141261, 6.337930329019764, 6.426830727172022, 6.5723263585085, 6.770769716699717,
           7.017670523558341, 7.308119103070945, 7.63714857122281, 8.0},
          // 4: Plate (recalculated via recalcPlate, default ratio 0.78)
          {1.0, 2.134792340213877, 4.026112907237005, 6.673961701069386, 10.078338721711017, 14.239243969161897,
           19.156677443422033, 24.83063914449142, 2.8652076597861225, 4.0, 5.891320567023128, 8.539169360855508,
           11.943546381497141, 16.10445162894802, 21.021885103208156, 26.695846804277544, 5.973887092762994, 7.108679432976872,
           9.0, 11.647848793832381, 15.052225814474012, 19.21313106192489, 24.130564536185027, 29.804526237254414,
           10.326038298930614, 11.46083063914449, 13.352151206167619, 16.0, 19.404377020641633, 23.565282268092513,
           28.482715742352646, 34.15667744342203, 15.921661278288981, 17.056453618502857, 18.947774185525986, 21.595622979358367,
           25.0, 29.16090524745088, 34.07833872171101, 39.7523004227804, 22.760756030838103, 23.895548371051976,
           25.786868938075106, 28.434717731907487, 31.839094752549116, 36.0, 40.91743347426013, 46.591395175329524,
           30.843322556577967, 31.97811489679184, 33.86943546381497, 36.517284257647354, 39.92166127828899, 44.082566525739864,
           49.0, 54.67396170106939, 40.16936085550858, 41.304153195722456, 43.195473762745586, 45.84332255657796,
           49.2476995772196, 53.408604824670476, 58.32603829893061, 64.0},
          // 5: Drumhead (Bessel roots Jmn)
          {1.0, 1.593340505695112, 2.1355487866494034, 2.295417267427694, 2.6530664045492145, 2.9172954551172228,
           3.155464815408362, 3.5001474903090264, 3.5984846739581138, 3.6474511791052775, 4.058931883331434, 4.131738159726707,
           4.230439127905234, 4.6010445344331075, 4.610051645437306, 4.831885262930598, 4.903280573212368, 5.1307689067016575,
           5.412118429982582, 5.5403985098530635, 5.650842376925684, 5.976540221648715, 6.152609171589257, 6.1631367313038865,
           6.208732130572546, 6.528612451522295, 6.746213299505839, 6.848991602808508, 7.0707081490386905, 7.325257332462771,
           7.468242109085181, 7.514500962483965, 7.604536126938166, 7.892520026843893, 8.071028338967128, 8.1568737689496,
           8.45000551018646, 8.66047555520746, 8.781093075730398, 8.820447105611922, 8.999214496283312, 9.238840557670077,
           9.390589484063241, 9.464339027734203, 9.807815107462856, 9.98784275554081, 10.092254814868133, 10.126502295693772,
           10.368705458854519, 10.574713443493692, 10.706875023386747, 10.77153891878896, 11.152639282954734, 11.310212368186301,
           11.402312929615599, 11.722758172320448, 11.903823217314876, 12.020976194473256, 12.48894011894477, 12.6291936518746,
           13.066558649839825, 13.228284530761863, 13.819314942198952, 14.40316086180383},
          // 6: Marimba
          {1.0, 3.9393939393939394, 10.575757575757576, 19.0, 26.757575757575758, 36.93939393939394,
           49.18181818181818, 63.18181818181818, 78.9090909090909, 96.39393939393939, 115.63636363636364, 136.6060606060606,
           159.36363636363637, 183.8181818181818, 210.06060606060606, 238.03030303030303, 267.75757575757575, 299.24242424242425,
           442.6363636363636, 568.5454545454545, 614.0, 100000.0, 100000.0, 100000.0,
           100000.0, 100000.0, 100000.0, 100000.0, 100000.0, 100000.0, 100000.0, 100000.0,
           100000.0, 100000.0, 100000.0, 100000.0, 100000.0, 100000.0, 100000.0, 100000.0,
           100000.0, 100000.0, 100000.0, 100000.0, 100000.0, 100000.0, 100000.0, 100000.0,
           100000.0, 100000.0, 100000.0, 100000.0, 100000.0, 100000.0, 100000.0, 100000.0,
           100000.0, 100000.0, 100000.0, 100000.0, 100000.0, 100000.0, 100000.0, 100000.0},
          // 7: OpenTube harmonics (used for serial coupling frequency shifts)
          {1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0, 16.0,
           17.0, 18.0, 19.0, 20.0, 21.0, 22.0, 23.0, 24.0, 25.0, 26.0, 27.0, 28.0, 29.0, 30.0, 31.0, 32.0,
           33.0, 34.0, 35.0, 36.0, 37.0, 38.0, 39.0, 40.0, 41.0, 42.0, 43.0, 44.0, 45.0, 46.0, 47.0, 48.0,
           49.0, 50.0, 51.0, 52.0, 53.0, 54.0, 55.0, 56.0, 57.0, 58.0, 59.0, 60.0, 61.0, 62.0, 63.0, 64.0},
          // 8: ClosedTube odd harmonics (used for serial coupling frequency shifts)
          {1.0, 3.0, 5.0, 7.0, 9.0, 11.0, 13.0, 15.0, 17.0, 19.0, 21.0, 23.0, 25.0, 27.0, 29.0, 31.0,
           33.0, 35.0, 37.0, 39.0, 41.0, 43.0, 45.0, 47.0, 49.0, 51.0, 53.0, 55.0, 57.0, 59.0, 61.0, 63.0,
           65.0, 67.0, 69.0, 71.0, 73.0, 75.0, 77.0, 79.0, 81.0, 83.0, 85.0, 87.0, 89.0, 91.0, 93.0, 95.0,
           97.0, 99.0, 101.0, 103.0, 105.0, 107.0, 109.0, 111.0, 113.0, 115.0, 117.0, 119.0, 121.0, 123.0, 125.0, 127.0},
          // 9: Marimba2 (mesh2faust marimbaBar)
          {1.0, 1.9203266581541947, 2.3141717799876242, 4.707864059430217, 6.873884860855047, 7.406986383228944,
           9.10045884559416, 13.257060734683654, 14.637949279677162, 17.307596372965154, 19.650542855838847, 20.732751895404856,
           24.59892139973911, 25.43424752188353, 26.093486472917707, 29.37789962712825, 31.035072021669656, 32.90951412040796,
           34.44950734864093, 35.80195022645086, 37.993540286176156, 40.579442486151315, 44.50494455748414, 45.194115143390576,
           47.320534905911714, 49.14126988675865, 53.48072009994195, 55.93681240825477, 57.030803048781145, 58.215013156121074,
           62.34982439046137, 65.88462310021686, 66.6255902741292, 67.69718525877597, 69.39628317024838, 76.04970349637584,
           77.52887818992153, 77.85993056285272, 78.14597934292632, 79.95811693928867, 84.10067643372001, 86.70823130573042,
           87.38710625836521, 89.67687632609348, 90.91553653516915, 93.6067301599432, 96.28667288650287, 96.91767845145185,
           98.3304091612031, 99.50071485659882, 99.7700995704492, 101.43321583574539, 106.64471680109368, 107.49702541110888,
           108.13599151724732, 109.37252891533912, 110.42332035234418, 111.6513665065006, 113.20420274118582, 114.71776697266988,
           116.70896367551987, 118.83177465936846, 119.11410852022031, 120.01948740483174},
          // 10: Bell (mesh2faust russianBell)
          {1.0, 1.0036779251227195, 1.8972671990622025, 1.9079712799472486, 2.3187706059051942, 2.3328522236061247,
           2.8855740347278185, 2.886277382958458, 3.3312110777346327, 3.42510806652502, 3.689603633965858, 3.689918675360832,
           3.88643856692798, 3.8907319217525096, 3.964832588468019, 4.001450655725694, 4.237189537695069, 4.248391823576819,
           4.835702249249029, 5.189684225950619, 5.252509341343687, 5.254817202725474, 5.684218624075024, 5.6858744230346545,
           5.73928492929885, 5.740083522602388, 5.779368451901238, 5.784035460473294, 5.8637848926661285, 5.910748040149461,
           6.4238259213129165, 6.4503919701077, 6.500820572935746, 6.507597626199721, 6.717085500769287, 6.738303172393581,
           6.869997802036779, 7.213759249761887, 7.745622389918675, 7.754780570005129, 7.8062861748113415, 7.9292988497325805,
           7.941460912887391, 7.960656458348596, 7.962268298043812, 8.119276137445967, 8.177668693677193, 8.4181991354678,
           8.42948201333431, 8.788482672723276, 8.799252692504945, 8.902996556524288, 8.918528829950912, 8.933841307055463,
           9.144406183603193, 9.161183969521577, 9.174078687083302, 9.179573595135174, 9.318631401567881, 9.334163674994505,
           9.8958898087772, 9.907685544728551, 10.022639021173712, 10.029672503480109},
          // 11: Djembe (default freq=200 Hz, overwritten dynamically by calcDjembe)
          {1.0, 3.857142857142857, 6.714285714285714, 9.571428571428571, 12.428571428571429, 15.285714285714286,
           18.142857142857142, 21.0, 23.857142857142858, 26.714285714285715, 29.571428571428573, 32.42857142857143,
           35.285714285714285, 38.142857142857146, 41.0, 43.857142857142854, 46.714285714285715, 49.57142857142857,
           52.42857142857143, 55.285714285714285, 58.142857142857146, 61.0, 63.857142857142854, 66.71428571428571,
           69.57142857142857, 72.42857142857143, 75.28571428571429, 78.14285714285714, 81.0, 83.85714285714286,
           86.71428571428571, 89.57142857142857, 92.42857142857143, 95.28571428571429, 98.14285714285714, 101.0,
           103.85714285714286, 106.71428571428571, 109.57142857142857, 112.42857142857143, 115.28571428571429, 118.14285714285714,
           121.0, 123.85714285714286, 126.71428571428571, 129.57142857142858, 132.42857142857142, 135.28571428571428,
           138.14285714285714, 141.0, 143.85714285714286, 146.71428571428572, 149.57142857142858, 152.42857142857142,
           155.28571428571428, 158.14285714285714, 161.0, 163.85714285714286, 166.71428571428572, 169.57142857142858,
           172.42857142857142, 175.28571428571428, 178.14285714285714, 181.0},
      }},
      modelGains_{{
          // 0: unity gain
          {1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0,
           1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0,
           1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0,
           1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0},
          // 1: Marimba2 gains
          {0.96623, 0.859578, 1.0, 0.788921, 0.722356, 0.828411, 0.804952, 0.321144,
           0.716796, 0.634043, 0.356832, 0.758356, 0.627535, 0.522109, 0.41653, 0.399465,
           0.639828, 0.478843, 0.395868, 0.589925, 0.789059, 0.525307, 0.814867, 0.641971,
           0.554683, 0.417749, 0.288577, 0.80181, 0.706824, 0.268298, 0.461017, 0.598288,
           0.769713, 0.388368, 0.510933, 0.561361, 0.495144, 0.562978, 0.155653, 0.814671,
           0.540099, 0.636206, 0.263332, 0.324908, 0.0159624, 0.409779, 0.849463, 0.390377,
           0.807923, 0.195733, 0.368285, 0.133785, 0.315076, 0.561451, 0.424994, 0.815392,
           0.805216, 0.274915, 0.7907, 0.151032, 0.295099, 0.70326, 0.319596, 0.591565},
          // 2: Bell gains
          {0.925507, 0.59752, 0.0965671, 0.45412, 0.989773, 0.593498, 0.512541, 0.124241,
           0.705411, 0.292396, 0.673399, 0.302181, 0.026234, 0.286249, 0.556267, 1.0,
           0.250426, 0.107711, 0.427299, 0.336295, 0.616257, 0.21442, 0.0845294, 0.231363,
           0.522724, 0.559114, 0.34847, 0.854197, 0.835576, 0.735036, 0.288494, 0.117122,
           0.409686, 0.363575, 0.484943, 0.170862, 0.420531, 0.164793, 0.233847, 0.861232,
           0.214037, 0.283462, 0.173153, 0.876122, 0.607809, 0.294745, 0.143142, 0.332009,
           0.491878, 0.626104, 0.384312, 0.527985, 0.201821, 0.297983, 0.212535, 0.367379,
           0.365935, 0.558277, 0.50738, 0.14265, 0.806237, 0.255278, 0.252357, 0.117637},
      }} {
    bModels_ = aModels_;
}

const std::array<double, kMaxPartials>& ModalModels::ratios(bool isA, ModalModel model) const noexcept {
    const std::size_t idx = static_cast<std::size_t>(std::clamp(static_cast<int>(model), 0, kModelCount - 1));
    return isA ? aModels_[idx] : bModels_[idx];
}

const std::array<double, kMaxPartials>& ModalModels::gains(ModalModel model) const noexcept {
    if (model == ModalModel::Marimba2) return modelGains_[1];
    if (model == ModalModel::Bell) return modelGains_[2];
    return modelGains_[0];
}

void ModalModels::recalcBeam(bool isA, double ratio) noexcept {
    const double r = std::clamp(ratio, 0.1, 10.0);
    const auto& bFree = bFreeRoots();
    auto& model = isA ? aModels_[static_cast<std::size_t>(ModalModel::Beam)]
                      : bModels_[static_cast<std::size_t>(ModalModel::Beam)];
    std::size_t i = 0;
    for (int m = 1; m <= 8; ++m) {
        const double m4 = std::pow(static_cast<double>(m), 4.0);
        for (int n = 1; n <= 8; ++n) {
            model[i] = std::sqrt(m4 + std::pow(r * bFree[i], 4.0));
            ++i;
        }
    }
    const double f0 = model[0] > 0.0 ? model[0] : 1.0;
    for (double& v : model) v /= f0;
}

void ModalModels::recalcMembrane(bool isA, double ratio) noexcept {
    const double r = std::clamp(ratio, 0.1, 10.0);
    auto& model = isA ? aModels_[static_cast<std::size_t>(ModalModel::Membrane)]
                      : bModels_[static_cast<std::size_t>(ModalModel::Membrane)];
    std::size_t i = 0;
    for (int m = 1; m <= 8; ++m) {
        const double m2 = static_cast<double>(m * m);
        for (int n = 1; n <= 8; ++n) {
            const double rn = r * static_cast<double>(n);
            model[i] = std::sqrt(m2 + rn * rn);
            ++i;
        }
    }
    const double f0 = model[0] > 0.0 ? model[0] : 1.0;
    for (double& v : model) v /= f0;
}

void ModalModels::recalcPlate(bool isA, double ratio) noexcept {
    const double r = std::clamp(ratio, 0.1, 10.0);
    auto& model = isA ? aModels_[static_cast<std::size_t>(ModalModel::Plate)]
                      : bModels_[static_cast<std::size_t>(ModalModel::Plate)];
    std::size_t i = 0;
    for (int m = 1; m <= 8; ++m) {
        const double m2 = static_cast<double>(m * m);
        for (int n = 1; n <= 8; ++n) {
            const double rn = r * static_cast<double>(n);
            model[i] = m2 + rn * rn;
            ++i;
        }
    }
    const double f0 = model[0] > 0.0 ? model[0] : 1.0;
    for (double& v : model) v /= f0;
}

void ModalModels::calcDjembe(double freqHz, double ratio, std::array<double, kMaxPartials>& out) const noexcept {
    const double safeFreq = std::max(1.0, freqHz);
    const double r = std::clamp(ratio, 0.1, 10.0);
    for (std::size_t i = 0; i < out.size(); ++i) {
        out[i] = 1.0 + (200.0 * static_cast<double>(i) * r) / safeFreq;
    }
}

// ---------- ModalRatioTables ----------

void ModalRatioTables::init() noexcept {
    constexpr double kMinRatio = 0.1;
    constexpr double kMaxRatio = 10.0;
    const double logMin = std::log(kMinRatio);
    const double logSpan = std::log(kMaxRatio) - logMin;
    ModalModels scratch{};
    for (std::size_t k = 0; k < kRatioTableKnots; ++k) {
        const double t = static_cast<double>(k) / static_cast<double>(kRatioTableKnots - 1);
        const double r = std::clamp(std::exp(logMin + t * logSpan), kMinRatio, kMaxRatio);
        scratch.recalcBeam(true, r);
        scratch.recalcMembrane(true, r);
        scratch.recalcPlate(true, r);
        beam_[k] = scratch.ratios(true, ModalModel::Beam);
        membrane_[k] = scratch.ratios(true, ModalModel::Membrane);
        plate_[k] = scratch.ratios(true, ModalModel::Plate);
    }
    initialized_ = true;
}

void ModalRatioTables::lookup(ModalModel model, double ratio, std::array<double, kMaxPartials>& out) const noexcept {
    if (!initialized_) return;
    constexpr double kMinRatio = 0.1;
    constexpr double kMaxRatio = 10.0;
    const double logMin = std::log(kMinRatio);
    const double invLogSpan = 1.0 / (std::log(kMaxRatio) - logMin);
    const double r = std::clamp(ratio, kMinRatio, kMaxRatio);
    const double pos = std::clamp((std::log(r) - logMin) * invLogSpan, 0.0, 1.0) *
                       static_cast<double>(kRatioTableKnots - 1);
    const std::size_t idx = std::min(static_cast<std::size_t>(pos), kRatioTableKnots - 2);
    const double frac = pos - static_cast<double>(idx);

    const auto& table = (model == ModalModel::Beam) ? beam_
                      : (model == ModalModel::Membrane) ? membrane_
                                                        : plate_;
    const auto& lo = table[idx];
    const auto& hi = table[idx + 1];
    for (std::size_t i = 0; i < kMaxPartials; ++i) {
        out[i] = lo[i] + frac * (hi[i] - lo[i]);
    }
}

// ---------- ModalPartial (port of RipplerX Partial.cpp) ----------

void ModalPartial::update(double f0, double ratio, double ratioMax, double vel,
                          double pitchBend, bool isRelease,
                          const ModalLookupTable* a1Lut) noexcept {
    constexpr double kLogDecaySpan = 9.2103403719761836;     // std::log(100.0) - std::log(0.01)
    constexpr double kNegLogMinInharm = 9.2103403719761836;  // -std::log(0.0001)

    lastF0_ = f0;
    lastRatio_ = ratio;
    lastRatioMax_ = ratioMax;
    lastVel_ = vel;
    lastIsRelease_ = isRelease;
    lastGain_ = 1.0;

    outOfRange = false;
    const double sr = std::max(1.0, srate);
    const double safeF0 = std::max(1.0, f0);
    const double safeInharm = std::clamp(inharm, 0.0001, 1.0);
    double inharmNorm = safeInharm - 0.0001;
    if (vel != 0.0 && velInharm != 0.0) {
        inharmNorm = std::clamp(
            std::exp(std::log(safeInharm) + vel * velInharm * kNegLogMinInharm) - 0.0001, 0.0, 1.0);
    }
    const double ratioMinus1 = ratio - 1.0;
    const double inharmK = (inharmNorm > 0.0 && ratioMinus1 != 0.0)
        ? std::sqrt(1.0 + inharmNorm * ratioMinus1 * ratioMinus1)
        : 1.0;
    f_k = safeF0 * ratio * inharmK;
    baseFk_ = f_k;
    f_k *= pitchBend;

    const double safeDecay = std::clamp(decay, 0.01, 100.0);
    double decayK = safeDecay;
    if (vel != 0.0 && velDecay != 0.0) {
        decayK = std::clamp(std::exp(std::log(safeDecay) + vel * velDecay * kLogDecaySpan), 0.01, 100.0);
    }
    if (isRelease) {
        decayK *= std::clamp(rel, 0.001, 1.0);
    }

    const double maxFreq = std::min(20000.0, sr * 0.495);
    if (!std::isfinite(f_k) || f_k >= maxFreq || f_k < 1.0 || decayK <= 0.0) {
        outOfRange = true;
        coeffsValid_ = false;
        poleRadius_ = 0.0;
        b0Norm = 0.0;
        b2Norm = 0.0;
        a1Norm = 0.0;
        a2Norm = 0.0;
        clear();
        return;
    }

    const double fMax = std::max(f_k, std::min(20000.0, safeF0 * ratioMax * inharmK));
    const double omega = kTwoPi * f_k / sr;
    const double alpha = kTwoPi / sr;  // ~1 s decay reference

    const double dampBase = std::clamp(damp + velDamp * 2.0 * vel, -1.0, 1.0);
    if (dampBase != 0.0) {
        const double dampK = dampBase <= 0.0
            ? std::pow(safeF0 / f_k, dampBase * 2.0)
            : std::pow(fMax / f_k, dampBase * 2.0);
        decayK = std::clamp(decayK / std::max(1e-6, dampK), 1e-6, 1e4);
    } else {
        decayK = std::clamp(decayK, 1e-6, 1e4);
    }

    const double toneBase = std::clamp(tone + velTone * 2.0 * vel, -1.0, 1.0);
    double toneGain = 1.0;
    if (toneBase != 0.0) {
        toneGain = toneBase <= 0.0
            ? std::pow(f_k / safeF0, toneBase * 2.0)
            : std::pow(f_k / fMax, toneBase * 2.0);
        toneGain = std::clamp(toneGain, 0.0, 100.0);
    }

    const double effHit = std::clamp(hit + velHit * vel * 0.5, 0.02, 0.5);
    const double ampK = std::abs(std::sin(kPi * static_cast<double>(k) * effHit)) * 35.0;

    // Exact pole radius r = exp(-alpha / decayK) prevents pole inversion and
    // DC/Nyquist hang when decayK < alpha (e.g. decay=0.01, release=0.001, damp=-1),
    // while matching RipplerX's bilinear a1/a0, a2/a0 to O((alpha/decayK)^2) in normal ranges.
    const double d = alpha / decayK;
    const double r = std::exp(-d);
    const double invA0 = 1.0 / (1.0 + d);
    const double b0 = alpha * toneGain * ampK;
    const double negTwoCos = (a1Lut != nullptr && a1Lut->initialized())
        ? (*a1Lut)(f_k)
        : (-2.0 * std::cos(omega));

    poleRadius_ = r;
    b0Norm = b0 * invA0;
    b2Norm = -b0Norm;
    a1Norm = negTwoCos * r;
    a2Norm = r * r;
    coeffsValid_ = true;
}

void ModalPartial::applyGain(double gain) noexcept {
    lastGain_ = gain;
    if (!outOfRange) {
        b0Norm *= gain;
        b2Norm *= gain;
    }
}

void ModalPartial::applyPitchBend(double pitchBend, const ModalLookupTable& a1Lut) noexcept {
    f_k = baseFk_ * pitchBend;
    const double maxFreq = std::min(20000.0, srate * 0.495);
    if (!std::isfinite(f_k) || f_k < 1.0 || f_k >= maxFreq) {
        outOfRange = true;
        coeffsValid_ = false;
        poleRadius_ = 0.0;
        b0Norm = 0.0;
        b2Norm = 0.0;
        a1Norm = 0.0;
        a2Norm = 0.0;
        clear();
        return;
    }
    if (outOfRange || !coeffsValid_) {
        const double savedGain = lastGain_;
        clear();
        update(lastF0_, lastRatio_, lastRatioMax_, lastVel_, pitchBend, lastIsRelease_, &a1Lut);
        if (!outOfRange) {
            applyGain(savedGain);
        }
        return;
    }
    a1Norm = a1Lut(f_k) * poleRadius_;
}

void ModalPartial::clear() noexcept {
    x1 = x2 = y1 = y2 = 0.0;
}

// ---------- ModalWaveguide (port of RipplerX Waveguide.cpp) ----------

ModalWaveguide::ModalWaveguide() : tube_(static_cast<std::size_t>(kWaveguideMaxLen), 0.0) {}

void ModalWaveguide::updateDelayAndFilter() noexcept {
    const double sr = std::max(1.0, srate);
    const double rParam = std::clamp(radius, 0.0, 1.0);
    // Sample-rate-invariant 1-pole loop filter calibrated to 48 kHz reference:
    // p(sr) = (1 - rParam)^(48000 / sr), rEff = 1 - p(sr).
    if (rParam >= 1.0) {
        rEff_ = 1.0;
    } else if (rParam <= 0.0) {
        rEff_ = 0.0;
    } else {
        rEff_ = 1.0 - std::pow(1.0 - rParam, 48000.0 / sr);
    }

    // Subtract 1-pole loop filter phase delay at f_k (approaches DC delay (1 - rEff) / rEff)
    // so the waveguide stays in tune across radius and sample rates.
    const double p = 1.0 - rEff_;
    double filterDelay = 0.0;
    if (rEff_ > 1e-4) {
        const double omega = kTwoPi * f_k / sr;
        if (omega > 1e-6 && omega < kPi) {
            filterDelay = std::atan2(p * std::sin(omega), 1.0 - p * std::cos(omega)) / omega;
        } else {
            filterDelay = p / rEff_;
        }
    }

    double tlen = sr / f_k;
    if (isClosed) tlen *= 0.5;
    tlen = std::clamp(tlen - filterDelay, 2.0, static_cast<double>(kWaveguideMaxLen - 2));

    readPtrFrac_ = static_cast<double>(writePtr_) - tlen;
    if (readPtrFrac_ < 0.0) readPtrFrac_ += static_cast<double>(kWaveguideMaxLen);

    // Sample-rate-invariant decay calibrated to 48 kHz (48000 / 125000 = 0.384),
    // scaled by passesPerSec (2 * f_k for ClosedTube, f_k for OpenTube).
    constexpr double kDecayScale = 48000.0 / 125000.0;
    const double passesPerSec = isClosed ? (2.0 * f_k) : f_k;
    const double denom = std::max(1e-6, passesPerSec * lastDecayK_ * kDecayScale);
    tubeDecay_ = std::clamp(std::exp(-kPi / denom), 0.0, 0.99999);
}

void ModalWaveguide::update(double f0, double vel, double pitchBend, bool isRelease) noexcept {
    constexpr double kLogDecaySpan = 9.2103403719761836;  // std::log(100.0) - std::log(0.01)
    baseFreq = std::max(1.0, f0);
    f_k = std::max(1.0, baseFreq * pitchBend);

    const double safeDecay = std::clamp(decay, 0.01, 100.0);
    double decayK = safeDecay;
    if (vel != 0.0 && velDecay != 0.0) {
        decayK = std::clamp(std::exp(std::log(safeDecay) + vel * velDecay * kLogDecaySpan), 0.01, 100.0);
    }
    if (isRelease) decayK *= std::clamp(rel, 0.001, 1.0);
    lastDecayK_ = std::max(1e-6, decayK);

    updateDelayAndFilter();
}

void ModalWaveguide::applyPitchBend(double pitchBend) noexcept {
    f_k = std::max(1.0, baseFreq * pitchBend);
    updateDelayAndFilter();
}

double ModalWaveguide::process(double input) noexcept {
    const int i0 = static_cast<int>(readPtrFrac_) % kWaveguideMaxLen;
    const int i1 = (i0 + 1) % kWaveguideMaxLen;
    const double frac = readPtrFrac_ - std::floor(readPtrFrac_);
    const double sample = tube_[static_cast<std::size_t>(i0)] * (1.0 - frac) +
                          tube_[static_cast<std::size_t>(i1)] * frac;

    const double rawY = rEff_ * sample + (1.0 - rEff_) * y1_;
    if (!std::isfinite(rawY)) [[unlikely]] {
        ++nonFiniteCount;
        y_ = 0.0;
    } else {
        const double absY = std::abs(rawY);
        if (absY > maxRawAbs) maxRawAbs = absY;
        y_ = (absY < kDenormalFloor) ? 0.0 : rawY;
    }
    y1_ = y_;

    double dsample = y_ * tubeDecay_;
    if (isClosed) dsample = -dsample;
    const double rawFb = input + dsample;
    if (!std::isfinite(rawFb)) [[unlikely]] {
        ++nonFiniteCount;
        tube_[static_cast<std::size_t>(writePtr_)] = 0.0;
    } else {
        const double absFb = std::abs(rawFb);
        if (absFb > maxRawAbs) maxRawAbs = absFb;
        if (absFb > 64.0) [[unlikely]] {
            ++clampCount;
        }
        const double clamped = std::clamp(rawFb, -64.0, 64.0);
        tube_[static_cast<std::size_t>(writePtr_)] = (std::abs(clamped) < kDenormalFloor) ? 0.0 : clamped;
    }

    writePtr_ = (writePtr_ + 1) % kWaveguideMaxLen;
    readPtrFrac_ += 1.0;
    if (readPtrFrac_ >= static_cast<double>(kWaveguideMaxLen)) {
        readPtrFrac_ -= static_cast<double>(kWaveguideMaxLen);
    }
    return dsample;
}

void ModalWaveguide::clear() noexcept {
    y_ = y1_ = 0.0;
    writePtr_ = 0;
    readPtrFrac_ = 0.0;
    std::fill(tube_.begin(), tube_.end(), 0.0);
}

// ---------- ModalResonator (port of RipplerX Resonator.cpp) ----------

ModalResonator::ModalResonator() {
    for (int i = 0; i < kMaxPartials; ++i) {
        partials[static_cast<std::size_t>(i)].setIndex(i + 1);
    }
}

void ModalResonator::setParams(double sr, bool enabled, ModalModel mdl, int partialCount, double dec,
                               double damp, double tone, double hit, double rel, double inharm,
                               double cutVal, double rad, double velDecay, double velHit,
                               double velInharm, double velDamp, double velTone) noexcept {
    on = enabled;
    model = mdl;
    npartials = sanitizePartialCount(partialCount);
    decay = std::clamp(dec, 0.01, 100.0);
    radius = std::clamp(rad, 0.0, 1.0);
    srate = std::max(1.0, sr);

    const double prevCut = cut;
    cut = std::clamp(cutVal, -1.0, 1.0);
    const bool wasOff = (prevCut == 0.0);
    const bool signChanged = (prevCut < 0.0 && cut > 0.0) || (prevCut > 0.0 && cut < 0.0);
    if (cut != 0.0) {
        const double freq = 20.0 * std::pow(1000.0, cut < 0.0 ? (1.0 + cut) : cut);
        if (cut < 0.0) {
            filter.lp(srate, freq, 0.707);
        } else {
            filter.hp(srate, freq, 0.707);
        }
        if (wasOff || signChanged) {
            filter.clear(0.0);
        }
    } else if (!wasOff) {
        filter.clear(0.0);
    }

    for (ModalPartial& partial : partials) {
        partial.damp = damp;
        partial.decay = decay;
        partial.hit = hit;
        partial.inharm = inharm;
        partial.rel = rel;
        partial.tone = tone;
        partial.velDecay = velDecay;
        partial.velHit = velHit;
        partial.velInharm = velInharm;
        partial.velDamp = velDamp;
        partial.velTone = velTone;
        partial.srate = srate;
    }

    waveguide.decay = decay;
    waveguide.radius = radius;
    waveguide.isClosed = (model == ModalModel::ClosedTube);
    waveguide.srate = srate;
    waveguide.velDecay = velDecay;
    waveguide.rel = rel;
}

void ModalResonator::activate() noexcept {
    active = true;
    silence = 0;
}

void ModalResonator::update(double frequency, double vel, bool isRelease, double pitchBend,
                            const std::array<double, kMaxPartials>& ratios,
                            const std::array<double, kMaxPartials>& gains,
                            const ModalLookupTable* a1Lut) noexcept {
    if (isWaveguideModel(model)) {
        waveguide.update(ratios[0] * frequency, vel, pitchBend, isRelease);
    } else {
        const double ratioMax = ratios[kMaxPartials - 1];
        for (int i = 0; i < npartials; ++i) {
            const std::size_t idx = static_cast<std::size_t>(i);
            partials[idx].update(frequency, ratios[idx], ratioMax, vel, pitchBend, isRelease, a1Lut);
            partials[idx].applyGain(gains[idx]);
        }
    }
}

void ModalResonator::applyPitchBend(double bend, const ModalLookupTable& a1Lut) noexcept {
    if (!active) return;
    if (isWaveguideModel(model)) {
        waveguide.applyPitchBend(bend);
    } else {
        for (int p = 0; p < npartials; ++p) {
            partials[static_cast<std::size_t>(p)].applyPitchBend(bend, a1Lut);
        }
    }
}

double ModalResonator::process(double input) noexcept {
    double out = 0.0;
    if (active) {
        if (isWaveguideModel(model)) {
            out = waveguide.process(input);
        } else {
            for (int p = 0; p < npartials; ++p) {
                out += partials[static_cast<std::size_t>(p)].process(input);
            }
        }
    }

    if (std::abs(out) + std::abs(input) > 1e-5) {
        silence = 0;
    } else {
        silence += 1;
    }
    if (static_cast<double>(silence) >= srate) {
        active = false;
    }
    return out;
}

void ModalResonator::clear() noexcept {
    for (ModalPartial& partial : partials) {
        partial.clear();
    }
    waveguide.clear();
    filter.clear(0.0);
    active = false;
    silence = 0;
}

// ---------- ModalVoice (port of RipplerX Voice.cpp) ----------

namespace {

[[nodiscard]] inline double polyBlep(double phase, double dt) noexcept {
    if (dt <= 0.0) return 0.0;
    if (phase < dt) {
        const double t = phase / dt;
        return 2.0 * t - t * t - 1.0;
    }
    if (phase > 1.0 - dt) {
        const double t = (phase - 1.0) / dt;
        return t * t + 2.0 * t + 1.0;
    }
    return 0.0;
}

}  // namespace

double ModalVoice::noteToFreq(int midiNote) noexcept {
    return 440.0 * std::pow(2.0, (static_cast<double>(midiNote) - 69.0) / 12.0);
}

void ModalVoice::trigger(std::uint64_t timestamp, double sr, int midiNote, double velocity,
                         double malletFreqHz, bool skipFadeout, const VoiceClipEnvelope& clipEnvelope,
                         std::uint64_t instanceId, const ModalTableSnapshot& snapshot,
                         const ModalRatioTables* ratioTables) noexcept {
    srate = std::max(1.0, sr);
    malletFreq = malletFreqHz;
    newVel = std::clamp(velocity, 0.0, 1.0);
    newNote = midiNote;
    newNoteId = instanceId;
    newFreq = noteToFreq(newNote);
    newClipEnv = clipEnvelope;
    pendingRelease = false;
    pendingReleaseTs = 0;
    sustainedReleasePending = false;
    fadeInWithSwap = false;

    isRelease = false;
    isPressed = true;
    pressedTs = timestamp;

    if (skipFadeout) {
        triggerStart(false, snapshot, ratioTables);
    } else if ((resA.on && resA.active) || (resB.on && resB.active)) {
        isFading = true;
        fadeTotalSamples = std::max(1, static_cast<int>(kRepeatNoteFadeMs * 0.001 * srate));
        fadeSamples = fadeTotalSamples;
        updateResonators(snapshot, false, nullptr, ratioTables);
    } else {
        triggerStart(true, snapshot, ratioTables);
    }
}

double ModalVoice::fadeOut(const ModalTableSnapshot& snapshot,
                           const ModalRatioTables* ratioTables) noexcept {
    fadeSamples -= 1;
    if (fadeSamples <= 0) {
        isFading = false;
        triggerStart(true, snapshot, ratioTables);
        return 1.0;
    }
    return static_cast<double>(fadeSamples) / static_cast<double>(std::max(1, fadeTotalSamples));
}

void ModalVoice::triggerStart(bool resetResonators, const ModalTableSnapshot& snapshot,
                              const ModalRatioTables* ratioTables) noexcept {
    if (resetResonators) {
        resA.clear();
        resB.clear();
        noise.clear();
    }
    note = newNote;
    noteId = newNoteId;
    vel = newVel;
    freq = newFreq;
    clipEnv = newClipEnv;
    ratiosDirty_ = true;

    mallet.trigger(srate, malletFreq);
    noise.attack(vel);
    if (resA.on) resA.activate();
    if (resB.on) resB.activate();
    updateResonators(snapshot, true, nullptr, ratioTables);

    if (pendingRelease) {
        const std::uint64_t relTs = pendingReleaseTs;
        pendingRelease = false;
        pendingReleaseTs = 0;
        release(relTs, snapshot, ratioTables);
    }
}

void ModalVoice::release(std::uint64_t timestamp, const ModalTableSnapshot& snapshot,
                         const ModalRatioTables* ratioTables) noexcept {
    isRelease = true;
    isPressed = false;
    sustainedReleasePending = false;
    releaseTs = timestamp;
    noise.release();
    updateResonators(snapshot, false, nullptr, ratioTables);
}

void ModalVoice::clear() noexcept {
    isPressed = false;
    isRelease = true;
    isFading = false;
    fadeSamples = 0;
    pendingRelease = false;
    pendingReleaseTs = 0;
    sustainedReleasePending = false;
    fadeInWithSwap = false;
    note = -1;
    noteId = 0;
    newNote = -1;
    newNoteId = 0;
    clipEnv = VoiceClipEnvelope{};
    newClipEnv = VoiceClipEnvelope{};
    ratiosDirty_ = true;
    mallet.clear();
    noise.clear();
    resA.clear();
    resB.clear();
    aPhases_.fill(0.0);
    bPhases_.fill(0.0);
}

void ModalVoice::setCoupling(ModalCoupling c, double s) noexcept {
    if (coupling != c || split != s) {
        coupling = c;
        split = s;
        ratiosDirty_ = true;
    }
}

void ModalVoice::setPitch(double aCoarse, double bCoarse, double aFine, double bFine, double bend) noexcept {
    const double nextA = std::pow(2.0, (aCoarse + aFine / 100.0) / 12.0);
    const double nextB = std::pow(2.0, (bCoarse + bFine / 100.0) / 12.0);
    if (nextA != aPitchFactor || nextB != bPitchFactor) {
        aPitchFactor = nextA;
        bPitchFactor = nextB;
        ratiosDirty_ = true;
    }
    pitchBend = bend;
}

void ModalVoice::setRatio(double aR, double bR) noexcept {
    if (aRatio != aR || bRatio != bR) {
        aRatio = aR;
        bRatio = bR;
        ratiosDirty_ = true;
    }
}

void ModalVoice::applyPitch(std::array<double, kMaxPartials>& model, double factor) noexcept {
    for (double& r : model) r *= factor;
}

void ModalVoice::applyPitchBend(double bend, const ModalLookupTable& a1Lut) noexcept {
    if (bend != pitchBend) {
        pitchBend = bend;
        if (resA.on) resA.applyPitchBend(bend, a1Lut);
        if (resB.on) resB.applyPitchBend(bend, a1Lut);
    }
}

double ModalVoice::processOscillators(bool isA, const ModalLookupTable& sinLut) noexcept {
    auto& res = isA ? resA : resB;
    auto& phases = isA ? aPhases_ : bPhases_;
    if (!res.on) return 0.0;

    double out = 0.0;
    const bool isTube = isWaveguideModel(res.model);
    if (isTube) {
        const double dt = std::clamp(res.waveguide.f_k / std::max(1.0, srate), 0.0, 0.4999);
        const double phase = phases[0];
        if (res.model == ModalModel::OpenTube) {
            // Band-limited falling sawtooth (1 - 2*phase, +2 rising discontinuity at phase=0).
            out = (1.0 - 2.0 * phase) + polyBlep(phase, dt);
        } else {
            // Band-limited square wave (-1 on [0, 0.5), +1 on [0.5, 1.0)).
            const double secondEdge = phase < 0.5 ? (phase + 0.5) : (phase - 0.5);
            out = (phase < 0.5 ? -1.0 : 1.0) - polyBlep(phase, dt) + polyBlep(secondEdge, dt);
        }
        phases[0] = phase + dt;
        if (phases[0] >= 1.0) phases[0] -= std::floor(phases[0]);
    } else {
        for (int i = 0; i < res.npartials; ++i) {
            const auto idx = static_cast<std::size_t>(i);
            const auto& partial = res.partials[idx];
            if (!partial.outOfRange) {
                phases[idx] += partial.f_k / srate;
                if (phases[idx] >= 1.0) phases[idx] -= std::floor(phases[idx]);
                out += sinLut(phases[idx]);
            }
        }
    }
    return out * (isTube ? 0.125 : 0.004);
}

double ModalVoice::freqShift(double fa, double fb, double splitVal,
                             const ModalLookupTable* sinLut) noexcept {
    const double avg = (fa + fb) * 0.5;
    double cosAvg = 0.0;
    if (sinLut != nullptr && sinLut->initialized()) {
        // cos(x) = sin(x + pi/2), normalized to [0, 1) turns.
        double turns = (avg + 0.5 * kPi) * (1.0 / kTwoPi);
        turns -= std::floor(turns);
        cosAvg = (*sinLut)(turns);
    } else {
        cosAvg = std::cos(avg);
    }
    const double k = splitVal + cosAvg * 0.2;
    const double halfDiff = (fa - fb) * 0.5;
    const double kScaled = k * 0.4;
    const double w = avg + std::sqrt(halfDiff * halfDiff + kScaled * kScaled);
    return std::abs(std::max(fa, fb) - w);
}

void ModalVoice::computeSerialShifts(double freqHz, double splitVal,
                                     const std::array<double, kMaxPartials>& aIn,
                                     const std::array<double, kMaxPartials>& bIn,
                                     std::array<double, kMaxPartials>& aOut,
                                     std::array<double, kMaxPartials>& bOut,
                                     const ModalLookupTable* sinLut) noexcept {
    aOut = aIn;
    bOut = bIn;
    const double safeFreq = std::max(1.0, freqHz);
    const double invFreq = 1.0 / safeFreq;
    for (std::size_t i = 0; i < kMaxPartials; ++i) {
        const double fa = aIn[i];
        const double faHz = fa * safeFreq;
        for (std::size_t j = 0; j < kMaxPartials; ++j) {
            const double fb = bIn[j];
            if (std::abs(fa - fb) <= 4.0) {
                const double shift = freqShift(faHz, fb * safeFreq, splitVal, sinLut) * invFreq;
                aOut[i] += (fa > fb) ? shift : -shift;
                bOut[j] += (fa > fb) ? -shift : shift;
            }
        }
    }
}

void ModalVoice::computeSerialShiftsMultiSplit(
    double freqHz, double exactSplitVal,
    const std::array<double, kMaxPartials>& aIn,
    const std::array<double, kMaxPartials>& bIn,
    std::array<double, kMaxPartials>& aExactOut,
    std::array<double, kMaxPartials>& bExactOut,
    std::array<std::array<float, kMaxPartials>, kSerialSplitKnots>& aDeltaOut,
    std::array<std::array<float, kMaxPartials>, kSerialSplitKnots>& bDeltaOut,
    const ModalLookupTable* sinLut) noexcept {
    aExactOut = aIn;
    bExactOut = bIn;
    std::array<std::array<double, kMaxPartials>, kSerialSplitKnots> accA{};
    std::array<std::array<double, kMaxPartials>, kSerialSplitKnots> accB{};

    const double safeFreq = std::max(1.0, freqHz);
    const double invFreq = 1.0 / safeFreq;
    for (std::size_t i = 0; i < kMaxPartials; ++i) {
        const double fa = aIn[i];
        const double faHz = fa * safeFreq;
        for (std::size_t j = 0; j < kMaxPartials; ++j) {
            const double fb = bIn[j];
            if (std::abs(fa - fb) <= 4.0) {
                const double fbHz = fb * safeFreq;
                const double avg = (faHz + fbHz) * 0.5;
                double cosAvg = 0.0;
                if (sinLut != nullptr && sinLut->initialized()) {
                    double turns = (avg + 0.5 * kPi) * (1.0 / kTwoPi);
                    turns -= std::floor(turns);
                    cosAvg = (*sinLut)(turns);
                } else {
                    cosAvg = std::cos(avg);
                }
                const double halfDiff = (faHz - fbHz) * 0.5;
                const double halfDiffSq = halfDiff * halfDiff;
                const double maxF = std::max(faHz, fbHz);
                const double sign = (fa > fb) ? 1.0 : -1.0;

                const double kExact = (exactSplitVal + cosAvg * 0.2) * 0.4;
                const double shiftExact = std::abs(maxF - (avg + std::sqrt(halfDiffSq + kExact * kExact))) * invFreq;
                aExactOut[i] += sign * shiftExact;
                bExactOut[j] -= sign * shiftExact;

                for (std::size_t k = 0; k < kSerialSplitKnots; ++k) {
                    const double kk = (kSerialSplitValues[k] + cosAvg * 0.2) * 0.4;
                    const double sh = std::abs(maxF - (avg + std::sqrt(halfDiffSq + kk * kk))) * invFreq;
                    accA[k][i] += sign * sh;
                    accB[k][j] -= sign * sh;
                }
            }
        }
    }

    for (std::size_t k = 0; k < kSerialSplitKnots; ++k) {
        for (std::size_t i = 0; i < kMaxPartials; ++i) {
            aDeltaOut[k][i] = static_cast<float>(accA[k][i]);
            bDeltaOut[k][i] = static_cast<float>(accB[k][i]);
        }
    }
}

void ModalVoice::updateResonators(const ModalTableSnapshot& snapshot, bool recomputeRatios,
                                  const ModalLookupTable* a1Lut,
                                  const ModalRatioTables* ratioTables) noexcept {
    const auto& aGain = snapshot.models.gains(resA.model);
    const auto& bGain = snapshot.models.gains(resB.model);

    if (recomputeRatios || ratiosDirty_) {
        const bool aRatioMatches = !modelUsesRatio(resA.model) || std::abs(snapshot.aRatio - aRatio) <= 1e-7;
        const bool bRatioMatches = !modelUsesRatio(resB.model) || std::abs(snapshot.bRatio - bRatio) <= 1e-7;
        const bool pairMatchesSnapshot =
            snapshot.aModel == resA.model && snapshot.bModel == resB.model &&
            std::abs(snapshot.aPitchFactor - aPitchFactor) <= 1e-9 &&
            std::abs(snapshot.bPitchFactor - bPitchFactor) <= 1e-9 &&
            aRatioMatches && bRatioMatches;

        const bool canUseExactSerial =
            coupling == ModalCoupling::Serial && resA.on && resB.on &&
            snapshot.serialShiftsValid && note >= 0 && note < 128 &&
            pairMatchesSnapshot && std::abs(snapshot.split - split) <= 1e-6;

        if (canUseExactSerial) {
            const auto noteIdx = static_cast<std::size_t>(note);
            cachedAModel_ = snapshot.serialA[noteIdx];
            cachedBModel_ = snapshot.serialB[noteIdx];
        } else {
            auto loadModelRatios = [&](bool isA, ModalModel model, double ratio, double snapRatio,
                                       std::array<double, kMaxPartials>& dst) noexcept {
                if (model == ModalModel::Djembe) {
                    snapshot.models.calcDjembe(freq, ratio, dst);
                } else if ((model == ModalModel::Beam || model == ModalModel::Membrane || model == ModalModel::Plate) &&
                           std::abs(ratio - snapRatio) > 1e-7 && ratioTables != nullptr && ratioTables->initialized()) {
                    ratioTables->lookup(model, ratio, dst);
                } else {
                    dst = snapshot.models.ratios(isA, model);
                }
            };

            loadModelRatios(true, resA.model, aRatio, snapshot.aRatio, cachedAModel_);
            loadModelRatios(false, resB.model, bRatio, snapshot.bRatio, cachedBModel_);

            if (aPitchFactor != 1.0) applyPitch(cachedAModel_, aPitchFactor);
            if (bPitchFactor != 1.0) applyPitch(cachedBModel_, bPitchFactor);

            // Consume immutable control-thread-prepared serial shift deltas ONLY when both
            // current models, ratios, and pitches match the snapshot pair (only split differs).
            if (coupling == ModalCoupling::Serial && resA.on && resB.on &&
                snapshot.serialDeltasValid && note >= 0 && note < 128 &&
                pairMatchesSnapshot) {
                const auto noteIdx = static_cast<std::size_t>(note);
                const double clampedSplit = std::clamp(split, kSerialSplitValues.front(), kSerialSplitValues.back());
                std::size_t kLo = 0;
                while (kLo + 1 < kSerialSplitKnots - 1 && clampedSplit > kSerialSplitValues[kLo + 1]) {
                    ++kLo;
                }
                const std::size_t kHi = kLo + 1;
                const double span = kSerialSplitValues[kHi] - kSerialSplitValues[kLo];
                const double frac = span > 0.0 ? std::clamp((clampedSplit - kSerialSplitValues[kLo]) / span, 0.0, 1.0) : 0.0;

                const auto& dALo = snapshot.serialDeltaA[kLo][noteIdx];
                const auto& dAHi = snapshot.serialDeltaA[kHi][noteIdx];
                const auto& dBLo = snapshot.serialDeltaB[kLo][noteIdx];
                const auto& dBHi = snapshot.serialDeltaB[kHi][noteIdx];

                for (std::size_t i = 0; i < kMaxPartials; ++i) {
                    const double dA = static_cast<double>(dALo[i]) + frac * (static_cast<double>(dAHi[i]) - static_cast<double>(dALo[i]));
                    const double dB = static_cast<double>(dBLo[i]) + frac * (static_cast<double>(dBHi[i]) - static_cast<double>(dBLo[i]));
                    cachedAModel_[i] += dA;
                    cachedBModel_[i] += dB;
                }
            }
        }
        ratiosDirty_ = false;
    }

    if (resA.on) resA.update(freq, vel, isRelease, pitchBend, cachedAModel_, aGain, a1Lut);
    if (resB.on) resB.update(freq, vel, isRelease, pitchBend, cachedBModel_, bGain, a1Lut);
}

// ---------- CombStereoizer (port of RipplerX Comb.h) ----------

CombStereoizer::CombStereoizer() : buf_(static_cast<std::size_t>(kMaxDelaySamples), 0.0) {}

void CombStereoizer::init(double srate) noexcept {
    const double sr = std::max(1.0, srate);
    delayLen_ = std::clamp(static_cast<int>(20.0 * sr / 1000.0), 1, kMaxDelaySamples);
    clear();
}

void CombStereoizer::clear() noexcept {
    pos_ = 0;
    std::fill_n(buf_.begin(), static_cast<std::size_t>(delayLen_), 0.0);
}

std::pair<double, double> CombStereoizer::process(double input) noexcept {
    buf_[static_cast<std::size_t>(pos_)] = flushDenormal(input);
    pos_ = (pos_ + 1) % delayLen_;
    const double delayed = buf_[static_cast<std::size_t>(pos_)] * 0.33;
    return {input + delayed, input - delayed};
}

// ---------- OutputLimiter (port of RipplerX Limiter.h / FairlyChildish) ----------

void OutputLimiter::init(double srate, double threshDb, double biasPct,
                         double rmsWinUs, double makeupDb) noexcept {
    const double sr = std::max(1.0, srate);
    threshv_ = std::exp(threshDb * kDb2Log);
    ratio_ = 20.0;
    bias_ = 80.0 * biasPct / 100.0;
    makeupv_ = std::exp(makeupDb * kDb2Log);
    const double attime = 0.0002;
    const double reltime = 0.3;
    const double rmstime = std::max(1e-6, rmsWinUs / 1000000.0);
    atcoef_ = std::exp(-1.0 / (attime * sr));
    relcoef_ = std::exp(-1.0 / (reltime * sr));
    rmscoef_ = std::exp(-1.0 / (rmstime * sr));
    clear();
}

void OutputLimiter::clear() noexcept {
    rundb_ = 0.0;
    runave_ = 0.0;
}

void OutputLimiter::advanceSilence(std::size_t frames) noexcept {
    if (frames == 0 || (runave_ == 0.0 && rundb_ == 0.0)) return;
    std::size_t i = 0;
    while (i < frames && runave_ > 0.0) {
        (void)process(0.0, 0.0);
        ++i;
    }
    const std::size_t rem = frames - i;
    if (rem > 0 && rundb_ > 0.0) {
        rundb_ = flushDenormal(rundb_ * std::pow(relcoef_, static_cast<double>(rem)));
    }
}

std::pair<double, double> OutputLimiter::process(double spl0, double spl1) noexcept {
    double maxspl = std::max(std::abs(spl0), std::abs(spl1));
    maxspl *= maxspl;

    runave_ = flushDenormal(maxspl + rmscoef_ * (runave_ - maxspl));
    const double det = std::sqrt(std::max(0.0, runave_));
    double overdb = (det > 1e-30 && threshv_ > 1e-30)
        ? std::max(0.0, kLog2Db * std::log(det / threshv_))
        : 0.0;

    if (overdb > rundb_) {
        rundb_ = flushDenormal(overdb + atcoef_ * (rundb_ - overdb));
    } else {
        rundb_ = flushDenormal(overdb + relcoef_ * (rundb_ - overdb));
    }
    overdb = std::max(0.0, rundb_);

    const double cratio = (bias_ == 0.0)
        ? ratio_
        : (1.0 + (ratio_ - 1.0) * std::sqrt(overdb / bias_));
    const double gr = -overdb * (cratio - 1.0) / cratio;
    const double grv = std::exp(gr * kDb2Log);

    return {spl0 * grv * makeupv_, spl1 * grv * makeupv_};
}

}  // namespace nt::midi::modal
