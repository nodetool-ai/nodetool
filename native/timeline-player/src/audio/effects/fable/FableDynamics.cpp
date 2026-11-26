// Derived from georgi/fablesynth (https://github.com/georgi/fablesynth) at
// commit af55d51 / ae9fca7 (juce/source/dsp/{Fx.h,Fx.cpp}).
// FableSynth is published under PolyForm Noncommercial 1.0.0. Its author, who
// also maintains NodeTool, contributes this code to NodeTool under NodeTool's
// licence (AGPL-3.0).

#include "audio/effects/fable/FableDynamics.h"

#include <algorithm>
#include <cmath>

namespace nt::audio::effects::fable {
namespace {

double safeRate(double sr) noexcept {
    return (std::isfinite(sr) && sr > 0.0) ? sr : 48000.0;
}

inline double webCompGainDb(double xDb, double thresholdDb, double ratio) noexcept {
    const double over = xDb - thresholdDb;
    if (over <= 0.0) {
        return 0.0;
    }
    const double slope = 1.0 / ratio - 1.0;
    if (over < 9.0) {
        return slope * over * over / 18.0;
    }
    return slope * (over - 4.5);
}

}  // namespace

// ---------------- WebCompressor ----------------

void WebCompressor::prepare(double sampleRate) noexcept {
    sr_ = safeRate(sampleRate);
    smooth_ = 1.0 - std::exp(-1.0 / (0.02 * sr_));
    attackSec_ = 0.003;
    releaseSec_ = 0.25;
    attack_ = 1.0 - std::exp(-1.0 / (attackSec_ * sr_));
    release_ = 1.0 - std::exp(-1.0 / (releaseSec_ * sr_));
    autoGain.prepare(sr_);
    wetTarget = false;
    threshold_ = thresholdTarget_ = -16.0;
    ratio_ = ratioTarget_ = 4.0;
    keyed_ = false;
    keyHpHz_ = -1.0;
    setKey(false, 20.0f);
    reset();
}

void WebCompressor::setParams(bool on, float thresholdDb, float attack, float release, float ratio) noexcept {
    const double clampedAtt = std::clamp(static_cast<double>(attack), 0.0001, 0.1);
    if (clampedAtt != attackSec_) {
        attackSec_ = clampedAtt;
        attack_ = 1.0 - std::exp(-1.0 / (attackSec_ * sr_));
    }
    const double clampedRel = std::clamp(static_cast<double>(release), 0.01, 2.0);
    if (clampedRel != releaseSec_) {
        releaseSec_ = clampedRel;
        release_ = 1.0 - std::exp(-1.0 / (releaseSec_ * sr_));
    }
    ratioTarget_ = std::clamp(static_cast<double>(ratio), 1.0, 20.0);
    wetTarget = on;
    thresholdTarget_ = std::clamp(static_cast<double>(thresholdDb), -40.0, 0.0);
}

void WebCompressor::setKey(bool keyed, float hpHz) noexcept {
    const double clampedHp = std::clamp(static_cast<double>(hpHz), 10.0, 1000.0);
    const bool prevFilterActive = keyed_ || (keyHpHz_ > 20.0);
    const bool nextFilterActive = keyed || (clampedHp > 20.0);
    if (keyed != keyed_) {
        keyLpL_ = 0.0;
        keyLpR_ = 0.0;
        autoGain.reset();
    } else if (prevFilterActive != nextFilterActive) {
        keyLpL_ = 0.0;
        keyLpR_ = 0.0;
    }
    keyed_ = keyed;
    if (clampedHp != keyHpHz_) {
        keyHpHz_ = clampedHp;
        keyCoef_ = 1.0 - std::exp(-2.0 * kPi * keyHpHz_ / sr_);
    }
}

void WebCompressor::reset() noexcept {
    env = 0.0;
    gain = 1.0;
    gainStep_ = 0.0;
    tick_ = 0;
    wet_ = wetTarget ? 1.0 : 0.0;
    threshold_ = thresholdTarget_;
    ratio_ = ratioTarget_;
    autoGain.reset();
    keyLpL_ = 0.0;
    keyLpR_ = 0.0;
}

void WebCompressor::processSample(double inL, double inR, double& outL, double& outR,
                                  double keyL, double keyR) noexcept {
    if (!std::isfinite(inL)) {
        inL = 0.0;
    }
    if (!std::isfinite(inR)) {
        inR = 0.0;
    }
    if (!std::isfinite(keyL)) {
        keyL = 0.0;
    }
    if (!std::isfinite(keyR)) {
        keyR = 0.0;
    }
    double peak = 0.0;
    if (keyed_) {
        keyLpL_ = flushDenormal(keyLpL_ + keyCoef_ * (keyL - keyLpL_));
        keyLpR_ = flushDenormal(keyLpR_ + keyCoef_ * (keyR - keyLpR_));
        peak = std::max(std::abs(keyL - keyLpL_), std::abs(keyR - keyLpR_));
    } else if (keyHpHz_ > 20.0) {
        keyLpL_ = flushDenormal(keyLpL_ + keyCoef_ * (inL - keyLpL_));
        keyLpR_ = flushDenormal(keyLpR_ + keyCoef_ * (inR - keyLpR_));
        peak = std::max(std::abs(inL - keyLpL_), std::abs(inR - keyLpR_));
    } else {
        peak = std::max(std::abs(inL), std::abs(inR));
    }
    if (!wetTarget && wet_ < 1.0e-6) {
        if (wet_ != 0.0) {
            wet_ = 0.0;
            reset();
        }
        outL = inL;
        outR = inR;
        return;
    }
    env = flushDenormal(env + (peak - env) * (peak > env ? attack_ : release_));
    threshold_ += (thresholdTarget_ - threshold_) * smooth_;
    ratio_ += (ratioTarget_ - ratio_) * smooth_;
    if (tick_ == 0) {
        const double db = webCompGainDb(20.0 * std::log10(std::max(1.0e-9, env)), threshold_, ratio_);
        const double targetGain = std::pow(10.0, db / 20.0);
        gainStep_ = (targetGain - gain) / 32.0;
    }
    tick_ = (tick_ + 1) & 31;
    gain += gainStep_;
    const double g = keyed_ ? gain : gain * autoGain.next(inL, inR, gain * inL, gain * inR);
    wet_ = flushDenormal(wet_ + ((wetTarget ? 1.0 : 0.0) - wet_) * smooth_);
    outL = inL + wet_ * (g * inL - inL);
    outR = inR + wet_ * (g * inR - inR);
}

void WebCompressor::process(float* L, float* R, int n, const float* key) noexcept {
    for (int i = 0; i < n; ++i) {
        const double k = key ? static_cast<double>(key[i]) : 0.0;
        double l = 0.0;
        double r = 0.0;
        processSample(static_cast<double>(L[i]), static_cast<double>(R[i]), l, r, k, k);
        L[i] = static_cast<float>(l);
        R[i] = static_cast<float>(r);
    }
}

// ---------------- OttCompressor ----------------

void OttCompressor::prepare(double sampleRate) noexcept {
    sr_ = safeRate(sampleRate);
    lowCoef_ = 1.0 - std::exp(-2.0 * kPi * 120.0 / sr_);
    highCoef_ = 1.0 - std::exp(-2.0 * kPi * 2500.0 / sr_);
    smooth_ = 1.0 - std::exp(-1.0 / (0.015 * sr_));
    autoGain.prepare(sr_);
    time_ = 0.0;
    setParams(false, 0.35f, 1.0f, 1.0f, 1.0f);
    reset();
}

void OttCompressor::setParams(bool on, float d, float time, float up, float down) noexcept {
    depthTarget = on ? std::clamp(static_cast<double>(d), 0.0, 1.0) : 0.0;
    up_ = std::clamp(static_cast<double>(up), 0.0, 2.0);
    down_ = std::clamp(static_cast<double>(down), 0.0, 2.0);
    const double clampedTime = std::clamp(static_cast<double>(time), 0.01, 10.0);
    if (clampedTime != time_) {
        time_ = clampedTime;
        static constexpr double kA[3] = {0.008, 0.003, 0.001};
        static constexpr double kR[3] = {0.18, 0.12, 0.08};
        for (std::size_t b = 0; b < 3; ++b) {
            attack_[b] = 1.0 - std::exp(-1.0 / (kA[b] * time_ * sr_));
            release_[b] = 1.0 - std::exp(-1.0 / (kR[b] * time_ * sr_));
        }
    }
}

void OttCompressor::reset() noexcept {
    split_.fill(0.0);
    env.fill(0.0);
    gain.fill(1.0);
    target_.fill(1.0);
    bandsL_.fill(0.0);
    bandsR_.fill(0.0);
    tick_ = 0;
    depth = depthTarget;
    autoGain.reset();
}

void OttCompressor::processSample(double inL, double inR, double& outL, double& outR) noexcept {
    if (!std::isfinite(inL)) {
        inL = 0.0;
    }
    if (!std::isfinite(inR)) {
        inR = 0.0;
    }
    if (depthTarget == 0.0 && depth < 1.0e-6) {
        if (depth != 0.0) {
            depth = 0.0;
            reset();
        }
        outL = inL;
        outR = inR;
        return;
    }
    auto& s = split_;
    s[0] = flushDenormal(s[0] + lowCoef_ * (inL - s[0]));
    s[1] = flushDenormal(s[1] + lowCoef_ * (inR - s[1]));
    s[2] = flushDenormal(s[2] + highCoef_ * (inL - s[0] - s[2]));
    s[3] = flushDenormal(s[3] + highCoef_ * (inR - s[1] - s[3]));
    bandsL_[0] = s[0];
    bandsL_[1] = s[2];
    bandsL_[2] = inL - s[0] - s[2];
    bandsR_[0] = s[1];
    bandsR_[1] = s[3];
    bandsR_[2] = inR - s[1] - s[3];

    double wetL = 0.0;
    double wetR = 0.0;
    for (std::size_t b = 0; b < 3; ++b) {
        const double peak = std::max(std::abs(bandsL_[b]), std::abs(bandsR_[b]));
        env[b] = flushDenormal(env[b] + (peak - env[b]) * (peak > env[b] ? attack_[b] : release_[b]));
        if (tick_ == 0) {
            const double db = 20.0 * std::log10(std::max(1.0e-9, env[b]));
            const double floor = std::clamp((db + 90.0) / 18.0, 0.0, 1.0);
            const double boost = std::min(24.0, std::max(0.0, -36.0 - db) * 0.75) * up_ * floor;
            const double cut = std::max(0.0, db + 18.0) * 0.9 * down_;
            target_[b] = std::pow(10.0, (boost - cut) / 20.0);
        }
        gain[b] += (target_[b] - gain[b]) * smooth_;
        wetL += bandsL_[b] * gain[b];
        wetR += bandsR_[b] * gain[b];
    }
    tick_ = (tick_ + 1) & 15;
    depth = flushDenormal(depth + (depthTarget - depth) * smooth_);
    const double compensation = autoGain.next(inL, inR, wetL, wetR);
    outL = inL + depth * (wetL * compensation - inL);
    outR = inR + depth * (wetR * compensation - inR);
}

void OttCompressor::process(float* L, float* R, int n) noexcept {
    for (int i = 0; i < n; ++i) {
        double l = 0.0;
        double r = 0.0;
        processSample(static_cast<double>(L[i]), static_cast<double>(R[i]), l, r);
        L[i] = static_cast<float>(l);
        R[i] = static_cast<float>(r);
    }
}

bool OttCompressor::hasPendingOutput() const noexcept {
    for (double v : split_) {
        if (std::abs(v) > 1.0e-6) {
            return true;
        }
    }
    return false;
}

// ---------------- LookaheadLimiter ----------------

void LookaheadLimiter::prepare(double sampleRate, double makeup, bool truePeak, double releaseSec) {
    sr_ = safeRate(sampleRate);
    truePeak_ = truePeak;
    la_ = std::max(8, static_cast<int>(std::lround(kLookaheadSec * sr_)));
    windowSpan_ = la_ + (truePeak_ ? kTruePeakHoldPad : 0);
    totalDelay_ = la_ + (truePeak_ ? kTruePeakFirDelay : 0);
    qcap_ = windowSpan_ + 2;
    dlL_.assign(static_cast<std::size_t>(totalDelay_), 0.0f);
    dlR_.assign(static_cast<std::size_t>(totalDelay_), 0.0f);
    tpDl_.assign(static_cast<std::size_t>(la_), 0.0);
    qv_.assign(static_cast<std::size_t>(qcap_), 1.0);
    qi_.assign(static_cast<std::size_t>(qcap_), 0);
    if (truePeak_) {
        up1L_.design(kTpFir1Taps, kTpFirBeta);
        up2L_.design(kTpFir2Taps, kTpFirBeta);
        up1R_.design(kTpFir1Taps, kTpFirBeta);
        up2R_.design(kTpFir2Taps, kTpFirBeta);
    }
    atk_ = 1.0 - std::exp((truePeak_ ? -6.5 : -4.0) / static_cast<double>(la_));
    releaseSec_ = -1.0;
    setRelease(releaseSec);
    makeup_ = makeup;
    reset();
}

void LookaheadLimiter::setRelease(double releaseSec) noexcept {
    const double clamped = std::clamp(releaseSec, 0.01, 1.0);
    if (clamped != releaseSec_) {
        releaseSec_ = clamped;
        rel_ = 1.0 - std::exp(-1.0 / (releaseSec_ * sr_));
    }
}

void LookaheadLimiter::reset() noexcept {
    std::ranges::fill(dlL_, 0.0f);
    std::ranges::fill(dlR_, 0.0f);
    std::ranges::fill(tpDl_, 0.0);
    std::ranges::fill(qv_, 1.0);
    std::ranges::fill(qi_, 0);
    if (truePeak_) {
        up1L_.reset();
        up2L_.reset();
        up1R_.reset();
        up2R_.reset();
    }
    qh_ = 0;
    qt_ = 0;
    w_ = 0;
    tpW_ = 0;
    t_ = 0;
    env_ = 1.0;
}

bool LookaheadLimiter::hasPendingOutput() const noexcept {
    for (float v : dlL_) {
        if (v != 0.0f) {
            return true;
        }
    }
    for (float v : dlR_) {
        if (v != 0.0f) {
            return true;
        }
    }
    return false;
}

double LookaheadLimiter::detectTruePeak(double xl, double xr) noexcept {
    double a0 = 0.0;
    double a1 = 0.0;
    double b00 = 0.0;
    double b01 = 0.0;
    double b10 = 0.0;
    double b11 = 0.0;

    up1L_.interpolate(xl, a0, a1);
    up2L_.interpolate(a0, b00, b01);
    up2L_.interpolate(a1, b10, b11);
    double pk = std::max({std::abs(b00), std::abs(b01), std::abs(b10), std::abs(b11)});

    up1R_.interpolate(xr, a0, a1);
    up2R_.interpolate(a0, b00, b01);
    up2R_.interpolate(a1, b10, b11);
    pk = std::max({pk, std::abs(b00), std::abs(b01), std::abs(b10), std::abs(b11)});
    return pk;
}

double LookaheadLimiter::process(float& l, float& r, double ceiling) noexcept {
    if (dlL_.empty()) {
        return 1.0;
    }
    const double inL = std::isfinite(l) ? static_cast<double>(l) : 0.0;
    const double inR = std::isfinite(r) ? static_cast<double>(r) : 0.0;
    const double xl = std::clamp(inL * makeup_, -1.0e18, 1.0e18);
    const double xr = std::clamp(inR * makeup_, -1.0e18, 1.0e18);

    double pk = 0.0;
    double tpDelayed = 0.0;
    if (truePeak_) {
        pk = detectTruePeak(xl, xr);
        tpDelayed = tpDl_[static_cast<std::size_t>(tpW_)];
        tpDl_[static_cast<std::size_t>(tpW_)] = pk;
        if (++tpW_ >= la_) {
            tpW_ = 0;
        }
    } else {
        pk = std::max(std::abs(xl), std::abs(xr));
    }

    const double g = pk > ceiling ? ceiling / pk : 1.0;
    // Monotonic ring queue: minimum required gain over the last la_ + 1 samples.
    while (qh_ != qt_ && qv_[static_cast<std::size_t>(prevQ(qt_))] >= g) {
        qt_ = prevQ(qt_);
    }
    qv_[static_cast<std::size_t>(qt_)] = g;
    qi_[static_cast<std::size_t>(qt_)] = t_;
    qt_ = nextQ(qt_);
    if (qi_[static_cast<std::size_t>(qh_)] < t_ - static_cast<long long>(windowSpan_)) {
        qh_ = nextQ(qh_);
    }

    const double wmin = qv_[static_cast<std::size_t>(qh_)];
    env_ += (wmin - env_) * (wmin < env_ ? atk_ : rel_);

    const float dl = dlL_[static_cast<std::size_t>(w_)];
    const float dr = dlR_[static_cast<std::size_t>(w_)];
    dlL_[static_cast<std::size_t>(w_)] = static_cast<float>(xl);
    dlR_[static_cast<std::size_t>(w_)] = static_cast<float>(xr);
    if (++w_ >= totalDelay_) {
        w_ = 0;
    }
    ++t_;

    double gg = env_;
    double pd = std::max(std::abs(static_cast<double>(dl)), std::abs(static_cast<double>(dr)));
    if (truePeak_) {
        pd = std::max(pd, tpDelayed);
    }
    if (gg * pd > ceiling) {
        gg = ceiling / pd;
    }
    l = static_cast<float>(dl * gg);
    r = static_cast<float>(dr * gg);
    return gg;
}

}  // namespace nt::audio::effects::fable
