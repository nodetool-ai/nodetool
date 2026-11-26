// Derived from georgi/fablesynth (https://github.com/georgi/fablesynth) at
// commit af55d51 / ae9fca7 (juce/source/dsp/{Fx.h,Fx.cpp,DriveOs.h,PlateReverb.h}).
// FableSynth is published under PolyForm Noncommercial 1.0.0. Its author, who
// also maintains NodeTool, contributes this code to NodeTool under NodeTool's
// licence (AGPL-3.0).

#include "audio/effects/fable/FableColorTime.h"

#include <algorithm>
#include <cmath>

namespace nt::audio::effects::fable {
namespace {

constexpr std::array<int, 8> kCombTune{{1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617}};
constexpr std::array<int, 4> kApTune{{556, 441, 341, 225}};
constexpr int kStereoSpread = 23;

double safeRate(double sr) noexcept {
    return (std::isfinite(sr) && sr > 0.0) ? sr : 48000.0;
}

float mixGate(bool on, float amount, bool wet) noexcept {
    if (wet) {
        return on ? static_cast<float>(std::sin(static_cast<double>(amount) * kPi / 2.0)) : 0.0f;
    }
    return on ? static_cast<float>(std::cos(static_cast<double>(amount) * kPi / 2.0)) : 1.0f;
}

float sanitize(float x) noexcept {
    return std::isfinite(x) ? x : 0.0f;
}

}  // namespace

// ---------------- DelayLine ----------------

void DelayLine::prepare(int maxSamples) {
    buf_.assign(static_cast<std::size_t>(std::max(4, maxSamples)), 0.0f);
    w_ = 0;
}

void DelayLine::reset() noexcept {
    std::ranges::fill(buf_, 0.0f);
    w_ = 0;
}

void DelayLine::write(float x) noexcept {
    if (buf_.empty()) {
        return;
    }
    buf_[static_cast<std::size_t>(w_)] = flushDenormalF(sanitize(x));
    if (++w_ >= static_cast<int>(buf_.size())) {
        w_ = 0;
    }
}

float DelayLine::read(double delaySamples) const noexcept {
    if (buf_.empty()) {
        return 0.0f;
    }
    const int sz = static_cast<int>(buf_.size());
    const double d = std::clamp(std::isfinite(delaySamples) ? delaySamples : 0.0, 0.0, static_cast<double>(sz - 1));
    double rd = static_cast<double>(w_) - d;
    if (rd < 0.0) {
        rd += static_cast<double>(sz);
    }
    const int i0 = static_cast<int>(rd) % sz;
    const double frac = rd - std::floor(rd);
    const int i1 = (i0 + 1 < sz) ? (i0 + 1) : 0;
    return buf_[static_cast<std::size_t>(i0)] +
           static_cast<float>(frac) * (buf_[static_cast<std::size_t>(i1)] - buf_[static_cast<std::size_t>(i0)]);
}

float DelayLine::readHermite(double delaySamples) const noexcept {
    if (buf_.empty()) {
        return 0.0f;
    }
    const int sz = static_cast<int>(buf_.size());
    const double d = std::clamp(std::isfinite(delaySamples) ? delaySamples : 0.0, 0.0, static_cast<double>(sz - 1));
    double rd = static_cast<double>(w_) - d;
    if (rd < 0.0) {
        rd += static_cast<double>(sz);
    }
    const int i1 = static_cast<int>(rd) % sz;
    const float t = static_cast<float>(rd - std::floor(rd));
    const int i0 = i1 > 0 ? i1 - 1 : sz - 1;
    const int i2 = i1 + 1 < sz ? i1 + 1 : 0;
    const int i3 = i2 + 1 < sz ? i2 + 1 : 0;
    const float y0 = buf_[static_cast<std::size_t>(i0)];
    const float y1 = buf_[static_cast<std::size_t>(i1)];
    const float y2 = buf_[static_cast<std::size_t>(i2)];
    const float y3 = buf_[static_cast<std::size_t>(i3)];
    const float c1 = 0.5f * (y2 - y0);
    const float c2 = y0 - 2.5f * y1 + 2.0f * y2 - 0.5f * y3;
    const float c3 = 0.5f * (y3 - y0) + 1.5f * (y1 - y2);
    return ((c3 * t + c2) * t + c1) * t + y1;
}

bool DelayLine::hasNonZero() const noexcept {
    for (float v : buf_) {
        if (v != 0.0f) {
            return true;
        }
    }
    return false;
}

// ---------------- DriveColor ----------------

void DriveColor::prepare(double sr) noexcept {
    const double rate = safeRate(sr);
    fade_ = 1.0 - std::exp(-1.0 / (0.01 * rate * 4.0));
    smooth_ = 1.0 - std::exp(-1.0 / (0.02 * rate));
    pole_ = 1.0 - std::exp(-2.0 * kPi * 1000.0 / rate);
    tapeTarget_ = 0.0;
    hardTarget_ = 0.0;
    toneTarget_ = 0.0;
    reset();
}

void DriveColor::setParams(float type, float tone) noexcept {
    tapeTarget_ = std::round(type) == 1.0f ? 1.0 : 0.0;
    hardTarget_ = std::round(type) == 2.0f ? 1.0 : 0.0;
    toneTarget_ = std::clamp(static_cast<double>(tone), -1.0, 1.0);
}

void DriveColor::reset() noexcept {
    low_ = 0.0;
    tape_ = tapeTarget_;
    hard_ = hardTarget_;
    tone_ = toneTarget_;
}

double DriveColor::shape(double x, double k, double norm) noexcept {
    tape_ = flushDenormal(tape_ + (tapeTarget_ - tape_) * fade_);
    hard_ = flushDenormal(hard_ + (hardTarget_ - hard_) * fade_);
    const double z = x * k;
    const double soft = std::tanh(z);
    const double tape = std::abs(z) < 1.0 ? 1.5 * z - 0.5 * z * z * z : (z > 0.0 ? 1.0 : z < 0.0 ? -1.0 : 0.0);
    const double hard = std::clamp(z, -1.0, 1.0);
    return (soft + tape_ * (tape - soft) + hard_ * (hard - soft)) * norm;
}

double DriveColor::processTone(double x) noexcept {
    tone_ = flushDenormal(tone_ + (toneTarget_ - tone_) * smooth_);
    low_ = flushDenormal(low_ + pole_ * (x - low_));
    return x + tone_ * (tone_ < 0.0 ? 0.5 : 1.0) * (x - low_);
}

// ---------------- Freeverb building blocks ----------------

void FvComb::prepare(int n) {
    buf.assign(static_cast<std::size_t>(std::max(1, n)), 0.0f);
    idx = 0;
    filt = 0.0f;
}

void FvComb::reset() noexcept {
    std::ranges::fill(buf, 0.0f);
    idx = 0;
    filt = 0.0f;
}

float FvComb::process(float in) noexcept {
    if (buf.empty()) {
        return 0.0f;
    }
    const float out = buf[static_cast<std::size_t>(idx)];
    filt = flushDenormalF(out * damp2 + filt * damp1);
    buf[static_cast<std::size_t>(idx)] = flushDenormalF(in + filt * feedback);
    if (++idx >= static_cast<int>(buf.size())) {
        idx = 0;
    }
    return out;
}

void FvAllpass::prepare(int n) {
    buf.assign(static_cast<std::size_t>(std::max(1, n)), 0.0f);
    idx = 0;
}

void FvAllpass::reset() noexcept {
    std::ranges::fill(buf, 0.0f);
    idx = 0;
}

float FvAllpass::process(float in) noexcept {
    if (buf.empty()) {
        return 0.0f;
    }
    const float bufout = buf[static_cast<std::size_t>(idx)];
    const float out = -in + bufout;
    buf[static_cast<std::size_t>(idx)] = flushDenormalF(in + bufout * feedback);
    if (++idx >= static_cast<int>(buf.size())) {
        idx = 0;
    }
    return out;
}

// ---------------- FableDriveDsp ----------------

void FableDriveDsp::prepare(double sampleRate) {
    sr_ = safeRate(sampleRate);
    colorL_.prepare(sr_);
    colorR_.prepare(sr_);
    wet_.setTime(0.02, sr_);
    dry_.setTime(0.02, sr_);
    wet_.snap(0.0f);
    dry_.snap(1.0f);
    const int steps = std::max(1, static_cast<int>(std::lround(0.015 * sr_ / static_cast<double>(kColorTimeCoefChunk))));
    amtRamp_.setSteps(steps);
    amtRamp_.snap(0.0f);
    up1L_.design(kDriveHB1Taps, 6.0);
    up2L_.design(kDriveHB2Taps, 6.0);
    dn2L_.design(kDriveHB2Taps, 6.0);
    dn1L_.design(kDriveHB1Taps, 6.0);
    up1R_.design(kDriveHB1Taps, 6.0);
    up2R_.design(kDriveHB2Taps, 6.0);
    dn2R_.design(kDriveHB2Taps, 6.0);
    dn1R_.design(kDriveHB1Taps, 6.0);
    dryL_.prepare(kDriveLatency + 4);
    dryR_.prepare(kDriveLatency + 4);
    guard_.prepare(sr_);
    primed_ = false;
    forceCoefs_ = true;
    coefSamples_ = 0;
    silent_ = false;
    reset();
}

void FableDriveDsp::reset() noexcept {
    dryL_.reset();
    dryR_.reset();
    up1L_.reset();
    up2L_.reset();
    dn2L_.reset();
    dn1L_.reset();
    up1R_.reset();
    up2R_.reset();
    dn2R_.reset();
    dn1R_.reset();
    colorL_.reset();
    colorR_.reset();
    guard_.reset();
    wet_.snap(wet_.target);
    dry_.snap(dry_.target);
    amtRamp_.snapToTarget();
    silent_ = false;
    forceCoefs_ = true;
    coefSamples_ = 0;
}

void FableDriveDsp::setParams(bool on, float amt, float mix, float type, float tone) noexcept {
    const float clampedAmt = std::clamp(amt, 0.0f, 1.0f);
    const float clampedMix = std::clamp(mix, 0.0f, 1.0f);
    amtRamp_.setTarget(clampedAmt);
    wet_.target = mixGate(on, clampedMix, true);
    dry_.target = mixGate(on, clampedMix, false);
    colorL_.setParams(type, tone);
    colorR_.setParams(type, tone);
    if (!primed_) {
        primed_ = true;
        amtRamp_.snapToTarget();
        forceCoefs_ = true;
    }
}

void FableDriveDsp::advanceCoefs(bool force) noexcept {
    if (amtRamp_.next() || force) {
        const float amt = amtRamp_.cur;
        pre_ = 1.0f + amt * 2.0f;
        k_ = 1.0f + amt * 12.0f;
        norm_ = 1.0f / (pre_ * std::tanh(k_));
    }
}

float FableDriveDsp::driveChannel(HalfBandFir& u1, HalfBandFir& u2, HalfBandFir& d2,
                                  HalfBandFir& d1, double x, DriveColor& color) noexcept {
    const auto shape = [&](float v) noexcept {
        return static_cast<float>(color.shape(static_cast<double>(v), static_cast<double>(k_), static_cast<double>(norm_)));
    };
    double a0 = 0.0;
    double a1 = 0.0;
    u1.interpolate(x, a0, a1);
    double b00 = 0.0;
    double b01 = 0.0;
    double b10 = 0.0;
    double b11 = 0.0;
    u2.interpolate(a0, b00, b01);
    u2.interpolate(a1, b10, b11);
    const double s0a = static_cast<double>(shape(static_cast<float>(b00)));
    const double s0b = static_cast<double>(shape(static_cast<float>(b01)));
    const double c0 = d2.decimate(s0a, s0b);
    const double s1a = static_cast<double>(shape(static_cast<float>(b10)));
    const double s1b = static_cast<double>(shape(static_cast<float>(b11)));
    const double c1 = d2.decimate(s1a, s1b);
    return static_cast<float>(d1.decimate(c0, c1));
}

void FableDriveDsp::process(float* L, float* R, int n) noexcept {
    if (n <= 0) {
        return;
    }
    const bool silentNow = wet_.target == 0.0f && std::abs(wet_.cur) < 1.0e-6f;
    if (silentNow && !silent_) {
        wet_.snap(0.0f);
        dry_.snap(1.0f);
        colorL_.reset();
        colorR_.reset();
        up1L_.reset();
        up2L_.reset();
        dn2L_.reset();
        dn1L_.reset();
        up1R_.reset();
        up2R_.reset();
        dn2R_.reset();
        dn1R_.reset();
    }
    silent_ = silentNow;

    int off = 0;
    if (forceCoefs_) {
        advanceCoefs(true);
        forceCoefs_ = false;
        coefSamples_ = kColorTimeCoefChunk;
    }
    while (off < n) {
        if (coefSamples_ <= 0) {
            advanceCoefs(false);
            coefSamples_ = kColorTimeCoefChunk;
        }
        const int end = std::min(off + coefSamples_, n);
        for (int i = off; i < end; ++i) {
            float l = sanitize(L[i]);
            float r = sanitize(R[i]);
            dryL_.write(l);
            dryR_.write(r);
            const float dlyL = dryL_.read(static_cast<double>(kDriveLatency + 1));
            const float dlyR = dryR_.read(static_cast<double>(kDriveLatency + 1));
            if (!silent_) {
                const float wet = wet_.next();
                const float dry = dry_.next();
                const float dl = driveChannel(up1L_, up2L_, dn2L_, dn1L_, static_cast<double>(pre_) * l, colorL_);
                const float dr = driveChannel(up1R_, up2R_, dn2R_, dn1R_, static_cast<double>(pre_) * r, colorR_);
                l = dry * dlyL + wet * static_cast<float>(colorL_.processTone(dl));
                r = dry * dlyR + wet * static_cast<float>(colorR_.processTone(dr));
            } else {
                l = dlyL;
                r = dlyR;
            }
            const double g = guard_.gainFor(static_cast<double>(l), static_cast<double>(r));
            L[i] = static_cast<float>(static_cast<double>(l) * g);
            R[i] = static_cast<float>(static_cast<double>(r) * g);
        }
        coefSamples_ -= end - off;
        off = end;
    }
}

bool FableDriveDsp::hasPendingOutput() const noexcept {
    return dryL_.hasNonZero() || dryR_.hasNonZero() || (!silent_ && (colorL_.hasState() || colorR_.hasState()));
}

// ---------------- FableChorusDsp ----------------

void FableChorusDsp::prepare(double sampleRate) {
    sr_ = safeRate(sampleRate);
    const int cap = std::max(16, static_cast<int>(0.05 * sr_));
    dl1_.prepare(cap);
    dl2_.prepare(cap);
    wet_.setTime(0.02, sr_);
    dry_.setTime(0.02, sr_);
    wet_.snap(0.0f);
    dry_.snap(1.0f);
    const int steps = std::max(1, static_cast<int>(std::lround(0.015 * sr_ / static_cast<double>(kColorTimeCoefChunk))));
    rateRamp_.setSteps(steps);
    depthRamp_.setSteps(steps);
    rateRamp_.snap(0.6f);
    depthRamp_.snap(0.5f);
    guard_.prepare(sr_);
    primed_ = false;
    forceCoefs_ = true;
    coefSamples_ = 0;
    off_ = false;
    gated_ = false;
    tailRemaining_ = 0;
    reset();
}

void FableChorusDsp::reset() noexcept {
    dl1_.reset();
    dl2_.reset();
    guard_.reset();
    phase_ = 0.0;
    wet_.snap(wet_.target);
    dry_.snap(dry_.target);
    rateRamp_.snapToTarget();
    depthRamp_.snapToTarget();
    gated_ = false;
    forceCoefs_ = true;
    coefSamples_ = 0;
    tailRemaining_ = 0;
}

void FableChorusDsp::setParams(bool on, float rate, float depth, float mix) noexcept {
    rateRamp_.setTarget(std::clamp(rate, 0.05f, 8.0f));
    depthRamp_.setTarget(std::clamp(depth, 0.0f, 1.0f));
    off_ = !on;
    const float clampedMix = std::clamp(mix, 0.0f, 1.0f);
    wet_.target = mixGate(on, clampedMix * 0.8f, true);
    dry_.target = mixGate(on, clampedMix * 0.8f, false);
    if (!primed_) {
        primed_ = true;
        rateRamp_.snapToTarget();
        depthRamp_.snapToTarget();
        forceCoefs_ = true;
    }
}

void FableChorusDsp::advanceCoefs(bool force) noexcept {
    const bool rMoved = rateRamp_.next();
    const bool dMoved = depthRamp_.next();
    if (force || rMoved || dMoved) {
        rate_ = rateRamp_.cur;
        depth_ = depthRamp_.cur;
    }
}

void FableChorusDsp::process(float* L, float* R, int n) noexcept {
    if (n <= 0) {
        return;
    }
    const bool gateNow = off_ && wet_.target == 0.0f && std::abs(wet_.cur) < 1.0e-6f;
    if (gateNow && !gated_) {
        wet_.snap(0.0f);
        dry_.snap(1.0f);
        dl1_.reset();
        dl2_.reset();
        tailRemaining_ = 0;
    }
    gated_ = gateNow;

    int off = 0;
    if (forceCoefs_) {
        advanceCoefs(true);
        forceCoefs_ = false;
        coefSamples_ = kColorTimeCoefChunk;
    }
    const int tailSamples = std::max(16, static_cast<int>(std::ceil(0.025 * sr_)));
    while (off < n) {
        if (coefSamples_ <= 0) {
            advanceCoefs(false);
            coefSamples_ = kColorTimeCoefChunk;
        }
        const int end = std::min(off + coefSamples_, n);
        for (int i = off; i < end; ++i) {
            float l = sanitize(L[i]);
            float r = sanitize(R[i]);
            if (!gated_) {
                if (l != 0.0f || r != 0.0f) {
                    tailRemaining_ = tailSamples;
                } else if (tailRemaining_ > 0) {
                    --tailRemaining_;
                }
                phase_ += static_cast<double>(rate_) / sr_;
                if (phase_ >= 1.0) {
                    phase_ -= 1.0;
                }
                const double lfo = std::sin(2.0 * kPi * phase_);
                const double depth = 0.0008 + static_cast<double>(depth_) * 0.0045;
                const float mono = 0.5f * (l + r);
                dl1_.write(mono);
                dl2_.write(mono);
                const float c1 = dl1_.readHermite((0.012 + depth * lfo) * sr_);
                const float c2 = dl2_.readHermite((0.017 - depth * 0.8 * lfo) * sr_);
                const float wet = wet_.next();
                const float dry = dry_.next();
                l = dry * l + wet * c1;
                r = dry * r + wet * c2;
            }
            const double g = guard_.gainFor(static_cast<double>(l), static_cast<double>(r));
            L[i] = static_cast<float>(static_cast<double>(l) * g);
            R[i] = static_cast<float>(static_cast<double>(r) * g);
        }
        coefSamples_ -= end - off;
        off = end;
    }
}

// ---------------- FableEchoDsp ----------------

void FableEchoDsp::prepare(double sampleRate) {
    sr_ = safeRate(sampleRate);
    const int cap = static_cast<int>(2.0 * sr_) + 4;
    dlL_.prepare(cap);
    dlR_.prepare(cap);
    dlTime_.setTime(0.08, sr_);
    dlFb_.setTime(0.02, sr_);
    dlWet_.setTime(0.02, sr_);
    dlDry_.setTime(0.02, sr_);
    dlSat_.setTime(0.03, sr_);
    dlWow_.setTime(0.03, sr_);
    dlFlutter_.setTime(0.03, sr_);
    dlWidth_.setTime(0.03, sr_);
    dlMode_.setTime(0.03, sr_);
    dlWet_.snap(0.0f);
    dlDry_.snap(1.0f);
    dlWidth_.snap(1.0f);
    dlFb_.snap(0.0f);
    dlSat_.snap(0.0f);
    dlWow_.snap(0.0f);
    dlFlutter_.snap(0.0f);
    dlMode_.snap(0.0f);
    tone_ = 4500.0f;
    toneTarget_ = 4500.0f;
    toneDirty_ = true;
    toneSamples_ = 0;
    dampL_.lowpass(4500.0, 0.707, sr_);
    dampR_.lowpass(4500.0, 0.707, sr_);
    hpL_.highpass(45.0, 0.707, sr_);
    hpR_.highpass(45.0, 0.707, sr_);
    feedbackGuard_.prepare(sr_);
    guard_.prepare(sr_);
    initialized_ = false;
    off_ = false;
    gated_ = false;
    tailRemaining_ = 0;
    reset();
}

void FableEchoDsp::reset() noexcept {
    dlL_.reset();
    dlR_.reset();
    dampL_.reset();
    dampR_.reset();
    hpL_.reset();
    hpR_.reset();
    feedbackGuard_.reset();
    guard_.reset();
    dlTime_.snap(dlTime_.target);
    dlFb_.snap(dlFb_.target);
    dlWet_.snap(dlWet_.target);
    dlDry_.snap(dlDry_.target);
    dlSat_.snap(dlSat_.target);
    dlWow_.snap(dlWow_.target);
    dlFlutter_.snap(dlFlutter_.target);
    dlWidth_.snap(dlWidth_.target);
    dlMode_.snap(dlMode_.target);
    tone_ = toneTarget_;
    toneDirty_ = true;
    toneSamples_ = 0;
    tapeClock_ = 0.0;
    driftL_ = 0.0;
    driftR_ = 0.0;
    gated_ = false;
    tailRemaining_ = 0;
}

void FableEchoDsp::setParams(bool on, float timeSec, float fb, float mix, float toneHz, float sat,
                             float wow, float flutter, float width, float mode, bool sync, int div,
                             double tempoBpm) noexcept {
    const int divIdx = std::clamp(div, 0, 5);
    const double bpm = (std::isfinite(tempoBpm) && tempoBpm > 0.0) ? std::max(1.0, tempoBpm) : 120.0;
    const double rawTime = sync
        ? (60.0 / bpm * kEchoDivisions[static_cast<std::size_t>(divIdx)])
        : static_cast<double>(timeSec);
    dlTime_.target = static_cast<float>(std::clamp(rawTime, 0.02, 1.5));
    if (!initialized_) {
        dlTime_.snap(dlTime_.target);
        initialized_ = true;
    }
    dlFb_.target = std::clamp(fb, 0.0f, 0.92f);
    const float clampedTone = std::clamp(toneHz > 0.0f ? toneHz : 4500.0f, 400.0f, 12000.0f);
    if (clampedTone != toneTarget_) {
        toneTarget_ = clampedTone;
        toneDirty_ = true;
    }
    dlSat_.target = std::clamp(sat, 0.0f, 1.0f);
    dlWow_.target = std::clamp(wow, 0.0f, 1.0f);
    dlFlutter_.target = std::clamp(flutter, 0.0f, 1.0f);
    dlWidth_.target = std::clamp(width, 0.0f, 1.0f);
    dlMode_.target = mode > 0.5f ? 1.0f : 0.0f;
    off_ = !on;
    const float clampedMix = std::clamp(mix, 0.0f, 1.0f);
    dlWet_.target = mixGate(on, clampedMix * 0.85f, true);
    dlDry_.target = mixGate(on, clampedMix * 0.85f, false);
}

void FableEchoDsp::process(float* L, float* R, int n) noexcept {
    if (n <= 0) {
        return;
    }
    const bool gateNow = off_ && dlWet_.target == 0.0f && std::abs(dlWet_.cur) < 1.0e-6f;
    if (gateNow && !gated_) {
        dlWet_.snap(0.0f);
        dlDry_.snap(1.0f);
        dlL_.reset();
        dlR_.reset();
        dampL_.reset();
        dampR_.reset();
        hpL_.reset();
        hpR_.reset();
        feedbackGuard_.reset();
        tapeClock_ = 0.0;
        driftL_ = 0.0;
        driftR_ = 0.0;
        tailRemaining_ = 0;
    }
    gated_ = gateNow;

    const double toneCoef = 1.0 - std::exp(-static_cast<double>(kColorTimeCoefChunk) / (0.03 * sr_));
    const int tailHorizon = static_cast<int>(std::ceil(static_cast<double>(std::max(dlTime_.cur, dlTime_.target)) * sr_)) + 64;

    int off = 0;
    while (off < n) {
        if (!gated_ && toneSamples_ <= 0) {
            if (toneDirty_ || tone_ != toneTarget_) {
                tone_ += static_cast<float>((static_cast<double>(toneTarget_) - static_cast<double>(tone_)) * toneCoef);
                if (std::abs(toneTarget_ - tone_) < 1.0e-2f) {
                    tone_ = toneTarget_;
                }
                dampL_.lowpass(static_cast<double>(tone_), 0.707, sr_);
                dampR_.lowpass(static_cast<double>(tone_), 0.707, sr_);
                toneDirty_ = (tone_ != toneTarget_);
            }
            toneSamples_ = kColorTimeCoefChunk;
        }
        const int end = gated_ ? n : std::min(off + toneSamples_, n);
        for (int i = off; i < end; ++i) {
            float l = sanitize(L[i]);
            float r = sanitize(R[i]);
            if (!gated_) {
                const double dt = static_cast<double>(dlTime_.next());
                const float fb = dlFb_.next();
                const float wow = dlWow_.next() * 0.0025f;
                const float flutter = dlFlutter_.next() * 0.00022f;
                const double t = tapeClock_ / sr_;
                driftL_ = static_cast<double>(wow) * (0.72 * std::sin(2.0 * kPi * 0.23 * t) + 0.28 * std::sin(2.0 * kPi * 0.37 * t))
                        + static_cast<double>(flutter) * std::sin(2.0 * kPi * 6.7 * t);
                driftR_ = static_cast<double>(wow) * (0.72 * std::sin(2.0 * kPi * 0.23 * t + 1.8) + 0.28 * std::sin(2.0 * kPi * 0.41 * t + 0.7))
                        + static_cast<double>(flutter) * std::sin(2.0 * kPi * 8.3 * t + 1.1);
                tapeClock_ += 1.0;

                const float dL = dlL_.readHermite(std::max(0.005, dt + driftL_) * sr_);
                const float dR = dlR_.readHermite(std::max(0.005, dt + driftR_) * sr_);
                if (l != 0.0f || r != 0.0f || std::max(std::abs(dL), std::abs(dR)) > 1.0e-6f) {
                    tailRemaining_ = tailHorizon;
                } else if (tailRemaining_ > 0) {
                    --tailRemaining_;
                }

                const float mono = 0.5f * (l + r);
                const float mode = dlMode_.next();
                const float sat = dlSat_.next();
                const float k = 1.0f + sat * 4.0f;
                float recL = mono + mode * (l - mono) + fb * (dR + mode * (dL - dR));
                float recR = mode * r + fb * (dL + mode * (dR - dL));
                recL += sat * (static_cast<float>(std::tanh(static_cast<double>(k * recL))) / k - recL);
                recR += sat * (static_cast<float>(std::tanh(static_cast<double>(k * recR))) / k - recR);
                const float fL = static_cast<float>(dampL_.process(hpL_.process(static_cast<double>(recL))));
                const float fR = static_cast<float>(dampR_.process(hpR_.process(static_cast<double>(recR))));
                const double gFb = feedbackGuard_.gainFor(static_cast<double>(fL), static_cast<double>(fR));
                dlL_.write(fL * static_cast<float>(gFb));
                dlR_.write(fR * static_cast<float>(gFb));

                const float wet = dlWet_.next();
                const float dry = dlDry_.next();
                const float mid = 0.5f * (dL + dR);
                const float side = 0.5f * (dL - dR) * dlWidth_.next();
                l = dry * l + wet * (mid + side);
                r = dry * r + wet * (mid - side);
            }
            const double g = guard_.gainFor(static_cast<double>(l), static_cast<double>(r));
            L[i] = static_cast<float>(static_cast<double>(l) * g);
            R[i] = static_cast<float>(static_cast<double>(r) * g);
        }
        if (!gated_) {
            toneSamples_ -= end - off;
        }
        off = end;
    }
}

// ---------------- FableReverbDsp ----------------

void FableReverbDsp::prepare(double sampleRate) {
    sr_ = safeRate(sampleRate);
    const double scale = sr_ / 44100.0;
    for (std::size_t i = 0; i < 8; ++i) {
        combL_[i].prepare(static_cast<int>(kCombTune[i] * scale));
        combR_[i].prepare(static_cast<int>((kCombTune[i] + kStereoSpread) * scale));
    }
    for (std::size_t i = 0; i < 4; ++i) {
        apL_[i].prepare(static_cast<int>(kApTune[i] * scale));
        apR_[i].prepare(static_cast<int>((kApTune[i] + kStereoSpread) * scale));
        apL_[i].feedback = 0.5f;
        apR_[i].feedback = 0.5f;
    }
    plate_.prepare(sr_);
    wet_.setTime(0.02, sr_);
    dry_.setTime(0.02, sr_);
    wet_.snap(0.0f);
    dry_.snap(1.0f);
    const int steps = std::max(1, static_cast<int>(std::lround(0.015 * sr_ / static_cast<double>(kColorTimeCoefChunk))));
    sizeRamp_.setSteps(steps);
    sizeRamp_.snap(0.5f);
    guard_.prepare(sr_);
    primed_ = false;
    forceCoefs_ = true;
    plateDirty_ = true;
    coefSamples_ = 0;
    type_ = 0;
    damp_ = 0.5f;
    off_ = false;
    gated_ = false;
    tailRemaining_ = 0;
    reset();
}

void FableReverbDsp::resetTanks() noexcept {
    for (auto& c : combL_) {
        c.reset();
    }
    for (auto& c : combR_) {
        c.reset();
    }
    for (auto& a : apL_) {
        a.reset();
    }
    for (auto& a : apR_) {
        a.reset();
    }
    plate_.reset();
    tailRemaining_ = 0;
}

void FableReverbDsp::reset() noexcept {
    resetTanks();
    guard_.reset();
    wet_.snap(wet_.target);
    dry_.snap(dry_.target);
    sizeRamp_.snapToTarget();
    gated_ = false;
    forceCoefs_ = true;
    plateDirty_ = true;
    coefSamples_ = 0;
}

void FableReverbDsp::setParams(bool on, float size, float mix, int type, float damp) noexcept {
    sizeRamp_.setTarget(std::clamp(size, 0.0f, 1.0f));
    const int nextType = type > 0 ? 1 : 0;
    if (nextType != type_) {
        type_ = nextType;
        resetTanks();
    }
    const float clampedDamp = std::clamp(damp, 0.0f, 1.0f);
    if (clampedDamp != damp_) {
        damp_ = clampedDamp;
        plateDirty_ = true;
    }
    off_ = !on;
    const float clampedMix = std::clamp(mix, 0.0f, 1.0f);
    wet_.target = mixGate(on, clampedMix * 0.9f, true);
    dry_.target = mixGate(on, clampedMix * 0.9f, false);
    if (!primed_) {
        primed_ = true;
        sizeRamp_.snapToTarget();
        forceCoefs_ = true;
    }
}

void FableReverbDsp::advanceCoefs(bool force) noexcept {
    if (sizeRamp_.next() || force || plateDirty_) {
        const float size = sizeRamp_.cur;
        const float roomSize = 0.7f + size * 0.28f;
        const float fvDamp = 0.4f - size * 0.2f;
        for (std::size_t i = 0; i < 8; ++i) {
            combL_[i].feedback = roomSize;
            combR_[i].feedback = roomSize;
            combL_[i].damp1 = fvDamp;
            combR_[i].damp1 = fvDamp;
            combL_[i].damp2 = 1.0f - fvDamp;
            combR_[i].damp2 = 1.0f - fvDamp;
        }
        plate_.setParams(static_cast<double>(size), static_cast<double>(damp_));
        plateDirty_ = false;
    }
}

void FableReverbDsp::process(float* L, float* R, int n) noexcept {
    if (n <= 0) {
        return;
    }
    const bool gateNow = off_ && wet_.target == 0.0f && std::abs(wet_.cur) < 1.0e-6f;
    if (gateNow && !gated_) {
        wet_.snap(0.0f);
        dry_.snap(1.0f);
        resetTanks();
    }
    gated_ = gateNow;

    int off = 0;
    if (forceCoefs_) {
        advanceCoefs(true);
        forceCoefs_ = false;
        coefSamples_ = kColorTimeCoefChunk;
    }
    const int tailWindow = std::max(256, static_cast<int>(std::ceil(0.25 * sr_)));
    while (off < n) {
        if (coefSamples_ <= 0) {
            advanceCoefs(false);
            coefSamples_ = kColorTimeCoefChunk;
        }
        const int end = std::min(off + coefSamples_, n);
        for (int i = off; i < end; ++i) {
            float l = sanitize(L[i]);
            float r = sanitize(R[i]);
            if (!gated_) {
                float outL = 0.0f;
                float outR = 0.0f;
                if (type_ == 1) {
                    plate_.process((static_cast<double>(l) + static_cast<double>(r)) * 0.5);
                    outL = static_cast<float>(plate_.outL) * kPlateGain;
                    outR = static_cast<float>(plate_.outR) * kPlateGain;
                } else {
                    const float input = (l + r) * 0.015f;
                    for (std::size_t c = 0; c < 8; ++c) {
                        outL += combL_[c].process(input);
                        outR += combR_[c].process(input);
                    }
                    for (std::size_t a = 0; a < 4; ++a) {
                        outL = apL_[a].process(outL);
                        outR = apR_[a].process(outR);
                    }
                }
                if (l != 0.0f || r != 0.0f || std::max(std::abs(outL), std::abs(outR)) > 1.0e-6f) {
                    tailRemaining_ = tailWindow;
                } else if (tailRemaining_ > 0) {
                    --tailRemaining_;
                }
                const float wet = wet_.next();
                const float dry = dry_.next();
                l = dry * l + wet * outL;
                r = dry * r + wet * outR;
            }
            const double g = guard_.gainFor(static_cast<double>(l), static_cast<double>(r));
            L[i] = static_cast<float>(static_cast<double>(l) * g);
            R[i] = static_cast<float>(static_cast<double>(r) * g);
        }
        coefSamples_ -= end - off;
        off = end;
    }
}

}  // namespace nt::audio::effects::fable
