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
    if (!std::isfinite(x)) {
        x = 0.0;
    }
    tape_ = flushDenormal(tape_ + (tapeTarget_ - tape_) * fade_);
    hard_ = flushDenormal(hard_ + (hardTarget_ - hard_) * fade_);
    const double z = x * k;
    const double soft = std::tanh(z);
    const double tape = std::abs(z) < 1.0 ? 1.5 * z - 0.5 * z * z * z : (z > 0.0 ? 1.0 : z < 0.0 ? -1.0 : 0.0);
    const double hard = std::clamp(z, -1.0, 1.0);
    return (soft + tape_ * (tape - soft) + hard_ * (hard - soft)) * norm;
}

double DriveColor::processTone(double x) noexcept {
    if (!std::isfinite(x)) {
        x = 0.0;
    }
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
    const float safeIn = std::isfinite(in) ? std::clamp(in, -1.0e6f, 1.0e6f) : 0.0f;
    const float out = buf[static_cast<std::size_t>(idx)];
    filt = flushDenormalF(out * damp2 + filt * damp1);
    buf[static_cast<std::size_t>(idx)] = flushDenormalF(std::clamp(safeIn + filt * feedback, -1.0e6f, 1.0e6f));
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
    const float safeIn = std::isfinite(in) ? std::clamp(in, -1.0e6f, 1.0e6f) : 0.0f;
    const float bufout = buf[static_cast<std::size_t>(idx)];
    const float out = -safeIn + bufout;
    buf[static_cast<std::size_t>(idx)] = flushDenormalF(std::clamp(safeIn + bufout * feedback, -1.0e6f, 1.0e6f));
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
    const auto shape = [&](double v) noexcept {
        const double clamped = std::isfinite(v) ? std::clamp(v, -1.0e6, 1.0e6) : 0.0;
        return static_cast<float>(color.shape(static_cast<double>(static_cast<float>(clamped)), static_cast<double>(k_), static_cast<double>(norm_)));
    };
    const double safeX = std::isfinite(x) ? std::clamp(x, -1.0e6, 1.0e6) : 0.0;
    double a0 = 0.0;
    double a1 = 0.0;
    u1.interpolate(safeX, a0, a1);
    double b00 = 0.0;
    double b01 = 0.0;
    double b10 = 0.0;
    double b11 = 0.0;
    u2.interpolate(a0, b00, b01);
    u2.interpolate(a1, b10, b11);
    const double s0a = static_cast<double>(shape(b00));
    const double s0b = static_cast<double>(shape(b01));
    const double c0 = d2.decimate(s0a, s0b);
    const double s1a = static_cast<double>(shape(b10));
    const double s1b = static_cast<double>(shape(b11));
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
            const float lIn = sanitize(L[i]);
            const float rIn = sanitize(R[i]);
            dryL_.write(lIn);
            dryR_.write(rIn);
            const double dlyL = static_cast<double>(dryL_.read(static_cast<double>(kDriveLatency + 1)));
            const double dlyR = static_cast<double>(dryR_.read(static_cast<double>(kDriveLatency + 1)));
            double outL = dlyL;
            double outR = dlyR;
            if (!silent_) {
                const double wet = static_cast<double>(wet_.next());
                const double dry = static_cast<double>(dry_.next());
                const float dl = driveChannel(up1L_, up2L_, dn2L_, dn1L_, static_cast<double>(pre_) * static_cast<double>(lIn), colorL_);
                const float dr = driveChannel(up1R_, up2R_, dn2R_, dn1R_, static_cast<double>(pre_) * static_cast<double>(rIn), colorR_);
                outL = dry * dlyL + wet * colorL_.processTone(static_cast<double>(dl));
                outR = dry * dlyR + wet * colorR_.processTone(static_cast<double>(dr));
            }
            guard_.apply(outL, outR);
            L[i] = static_cast<float>(outL);
            R[i] = static_cast<float>(outR);
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
            const double inL = static_cast<double>(sanitize(L[i]));
            const double inR = static_cast<double>(sanitize(R[i]));
            double outL = inL;
            double outR = inR;
            if (!gated_) {
                if (inL != 0.0 || inR != 0.0) {
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
                const float mono = static_cast<float>(std::clamp(0.5 * (inL + inR), -1.0e6, 1.0e6));
                dl1_.write(mono);
                dl2_.write(mono);
                const double c1 = static_cast<double>(dl1_.readHermite((0.012 + depth * lfo) * sr_));
                const double c2 = static_cast<double>(dl2_.readHermite((0.017 - depth * 0.8 * lfo) * sr_));
                const double wet = static_cast<double>(wet_.next());
                const double dry = static_cast<double>(dry_.next());
                outL = dry * inL + wet * c1;
                outR = dry * inR + wet * c2;
            }
            guard_.apply(outL, outR);
            L[i] = static_cast<float>(outL);
            R[i] = static_cast<float>(outR);
        }
        coefSamples_ -= end - off;
        off = end;
    }
}

// ---------------- FableEchoDsp ----------------

void FableEchoDsp::resetDriftOscillators() noexcept {
    static constexpr std::array<double, 5> kInitPhase{{0.0, 0.0, 0.0, 0.7, 1.1}};
    for (std::size_t k = 0; k < 5; ++k) {
        oscC_[k] = std::cos(kInitPhase[k]);
        oscS_[k] = std::sin(kInitPhase[k]);
    }
}

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
    static constexpr std::array<double, 5> kOscHz{{0.23, 0.37, 6.7, 0.41, 8.3}};
    for (std::size_t k = 0; k < 5; ++k) {
        const double w = 2.0 * kPi * kOscHz[k] / sr_;
        oscDc_[k] = std::cos(w);
        oscDs_[k] = std::sin(w);
    }
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
    resetDriftOscillators();
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
        resetDriftOscillators();
        driftL_ = 0.0;
        driftR_ = 0.0;
        tailRemaining_ = 0;
    }
    gated_ = gateNow;

    static constexpr double kCos1_8 = -0.2272020946930871;
    static constexpr double kSin1_8 = 0.9738476308781951;
    static constexpr double kMaxModSec = 0.0025 + 0.00022;
    static constexpr double kFilterMarginSec = 0.005;  // 400 Hz LPF / 45 Hz HPF group delay + Hermite margin
    const double toneCoef = 1.0 - std::exp(-static_cast<double>(kColorTimeCoefChunk) / (0.03 * sr_));
    const double maxDelaySec = static_cast<double>(std::max(dlTime_.cur, dlTime_.target))
        + kMaxModSec + kFilterMarginSec;
    const int tailHorizon = static_cast<int>(std::ceil(maxDelaySec * sr_)) + 64;

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
            for (std::size_t k = 0; k < 5; ++k) {
                const double invR = 0.5 * (3.0 - (oscC_[k] * oscC_[k] + oscS_[k] * oscS_[k]));
                oscC_[k] *= invR;
                oscS_[k] *= invR;
            }
            toneSamples_ = kColorTimeCoefChunk;
        }
        const int end = gated_ ? n : std::min(off + toneSamples_, n);
        for (int i = off; i < end; ++i) {
            const double inL = static_cast<double>(sanitize(L[i]));
            const double inR = static_cast<double>(sanitize(R[i]));
            double outL = inL;
            double outR = inR;
            if (!gated_) {
                const double dt = static_cast<double>(dlTime_.next());
                const double fb = static_cast<double>(dlFb_.next());
                const double wow = static_cast<double>(dlWow_.next()) * 0.0025;
                const double flutter = static_cast<double>(dlFlutter_.next()) * 0.00022;
                const double s0 = oscS_[0];
                const double c0 = oscC_[0];
                driftL_ = wow * (0.72 * s0 + 0.28 * oscS_[1]) + flutter * oscS_[2];
                driftR_ = wow * (0.72 * (s0 * kCos1_8 + c0 * kSin1_8) + 0.28 * oscS_[3]) + flutter * oscS_[4];
                for (std::size_t k = 0; k < 5; ++k) {
                    const double nc = oscC_[k] * oscDc_[k] - oscS_[k] * oscDs_[k];
                    const double ns = oscS_[k] * oscDc_[k] + oscC_[k] * oscDs_[k];
                    oscC_[k] = nc;
                    oscS_[k] = ns;
                }
                tapeClock_ += 1.0;

                const double dL = static_cast<double>(dlL_.readHermite(std::max(0.005, dt + driftL_) * sr_));
                const double dR = static_cast<double>(dlR_.readHermite(std::max(0.005, dt + driftR_) * sr_));
                if (inL != 0.0 || inR != 0.0 || std::max(std::abs(dL), std::abs(dR)) > 1.0e-6) {
                    tailRemaining_ = tailHorizon;
                } else if (tailRemaining_ > 0) {
                    --tailRemaining_;
                }

                const double mono = 0.5 * (inL + inR);
                const double mode = static_cast<double>(dlMode_.next());
                const double sat = static_cast<double>(dlSat_.next());
                double recL = mono + mode * (inL - mono) + fb * (dR + mode * (dL - dR));
                double recR = mode * inR + fb * (dL + mode * (dR - dL));
                if (sat > 0.0) {
                    const double k = 1.0 + sat * 4.0;
                    recL += sat * (std::tanh(k * recL) / k - recL);
                    recR += sat * (std::tanh(k * recR) / k - recR);
                }
                recL = std::isfinite(recL) ? std::clamp(recL, -1.0e4, 1.0e4) : 0.0;
                recR = std::isfinite(recR) ? std::clamp(recR, -1.0e4, 1.0e4) : 0.0;
                double fL = dampL_.process(hpL_.process(recL));
                double fR = dampR_.process(hpR_.process(recR));
                feedbackGuard_.apply(fL, fR);
                dlL_.write(static_cast<float>(fL));
                dlR_.write(static_cast<float>(fR));

                const double wet = static_cast<double>(dlWet_.next());
                const double dry = static_cast<double>(dlDry_.next());
                const double mid = 0.5 * (dL + dR);
                const double side = 0.5 * (dL - dR) * static_cast<double>(dlWidth_.next());
                outL = dry * inL + wet * (mid + side);
                outR = dry * inR + wet * (mid - side);
            }
            guard_.apply(outL, outR);
            L[i] = static_cast<float>(outL);
            R[i] = static_cast<float>(outR);
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
    dampRamp_.setSteps(steps);
    dampRamp_.snap(0.5f);
    typeFadeSamples_ = std::max(1, static_cast<int>(std::lround(0.005 * sr_)));
    guard_.prepare(sr_);
    primed_ = false;
    forceCoefs_ = true;
    coefSamples_ = 0;
    type_ = 0;
    prevType_ = 0;
    typeXfLeft_ = 0;
    off_ = false;
    gated_ = false;
    tailRemaining_ = 0;
    reset();
}

void FableReverbDsp::resetRoomTank() noexcept {
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
}

void FableReverbDsp::resetPlateTank() noexcept {
    plate_.reset();
}

void FableReverbDsp::resetTanks() noexcept {
    resetRoomTank();
    resetPlateTank();
    tailRemaining_ = 0;
}

void FableReverbDsp::reset() noexcept {
    resetTanks();
    guard_.reset();
    wet_.snap(wet_.target);
    dry_.snap(dry_.target);
    sizeRamp_.snapToTarget();
    dampRamp_.snapToTarget();
    prevType_ = type_;
    typeXfLeft_ = 0;
    gated_ = false;
    forceCoefs_ = true;
    coefSamples_ = 0;
}

void FableReverbDsp::setParams(bool on, float size, float mix, int type, float damp) noexcept {
    sizeRamp_.setTarget(std::clamp(size, 0.0f, 1.0f));
    dampRamp_.setTarget(std::clamp(damp, 0.0f, 1.0f));
    const int nextType = type > 0 ? 1 : 0;
    if (!primed_) {
        type_ = nextType;
        prevType_ = nextType;
        typeXfLeft_ = 0;
    } else if (nextType != type_) {
        if (typeXfLeft_ > 0 && nextType == prevType_) {
            std::swap(prevType_, type_);
            typeXfLeft_ = typeFadeSamples_ - typeXfLeft_;
        } else {
            if (nextType == 1) {
                resetPlateTank();
            } else {
                resetRoomTank();
            }
            prevType_ = type_;
            type_ = nextType;
            typeXfLeft_ = typeFadeSamples_;
        }
    }
    off_ = !on;
    const float clampedMix = std::clamp(mix, 0.0f, 1.0f);
    wet_.target = mixGate(on, clampedMix * 0.9f, true);
    dry_.target = mixGate(on, clampedMix * 0.9f, false);
    if (!primed_) {
        primed_ = true;
        sizeRamp_.snapToTarget();
        dampRamp_.snapToTarget();
        forceCoefs_ = true;
    }
}

void FableReverbDsp::advanceCoefs(bool force) noexcept {
    const bool sizeMoved = sizeRamp_.next();
    const bool dampMoved = dampRamp_.next();
    if (sizeMoved || dampMoved || force) {
        const float size = sizeRamp_.cur;
        const float damp = dampRamp_.cur;
        const float roomSize = 0.7f + size * 0.28f;
        const double baseDamp = 0.4 - static_cast<double>(size) * 0.2;
        const double fvDamp48 = damp <= 0.5f
            ? baseDamp * (static_cast<double>(damp) * 2.0)
            : baseDamp + (0.85 - baseDamp) * ((static_cast<double>(damp) - 0.5) * 2.0);
        const double scaledDamp = (fvDamp48 > 0.0)
            ? (std::abs(sr_ - 48000.0) < 1.0e-6 ? fvDamp48 : std::pow(fvDamp48, 48000.0 / sr_))
            : 0.0;
        const float fvDamp = static_cast<float>(std::clamp(scaledDamp, 0.0, 0.995));
        for (std::size_t i = 0; i < 8; ++i) {
            combL_[i].feedback = roomSize;
            combR_[i].feedback = roomSize;
            combL_[i].damp1 = fvDamp;
            combR_[i].damp1 = fvDamp;
            combL_[i].damp2 = 1.0f - fvDamp;
            combR_[i].damp2 = 1.0f - fvDamp;
        }
        plate_.setParams(static_cast<double>(size), static_cast<double>(damp));
    }
}

void FableReverbDsp::processRoomSample(double inL, double inR, double& outL, double& outR) noexcept {
    const float input = static_cast<float>(std::clamp((inL + inR) * 0.015, -1.0e4, 1.0e4));
    float rL = 0.0f;
    float rR = 0.0f;
    for (std::size_t c = 0; c < 8; ++c) {
        rL += combL_[c].process(input);
        rR += combR_[c].process(input);
    }
    for (std::size_t a = 0; a < 4; ++a) {
        rL = apL_[a].process(rL);
        rR = apR_[a].process(rR);
    }
    outL = static_cast<double>(rL);
    outR = static_cast<double>(rR);
}

void FableReverbDsp::processPlateSample(double inL, double inR, double& outL, double& outR) noexcept {
    const double mono = std::clamp((inL + inR) * 0.5, -1.0e4, 1.0e4);
    plate_.process(mono);
    outL = static_cast<double>(static_cast<float>(plate_.outL) * kPlateGain);
    outR = static_cast<double>(static_cast<float>(plate_.outR) * kPlateGain);
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
        typeXfLeft_ = 0;
        prevType_ = type_;
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
            const double inL = static_cast<double>(sanitize(L[i]));
            const double inR = static_cast<double>(sanitize(R[i]));
            double outL = inL;
            double outR = inR;
            if (!gated_) {
                double wetL = 0.0;
                double wetR = 0.0;
                if (typeXfLeft_ > 0) {
                    double prevL = 0.0;
                    double prevR = 0.0;
                    double nextL = 0.0;
                    double nextR = 0.0;
                    if (prevType_ == 1) {
                        processPlateSample(inL, inR, prevL, prevR);
                        processRoomSample(inL, inR, nextL, nextR);
                    } else {
                        processRoomSample(inL, inR, prevL, prevR);
                        processPlateSample(inL, inR, nextL, nextR);
                    }
                    const double alpha = 1.0 - static_cast<double>(typeXfLeft_) / static_cast<double>(typeFadeSamples_);
                    wetL = prevL + alpha * (nextL - prevL);
                    wetR = prevR + alpha * (nextR - prevR);
                    if (--typeXfLeft_ == 0) {
                        if (prevType_ == 1) {
                            resetPlateTank();
                        } else {
                            resetRoomTank();
                        }
                        prevType_ = type_;
                    }
                } else if (type_ == 1) {
                    processPlateSample(inL, inR, wetL, wetR);
                } else {
                    processRoomSample(inL, inR, wetL, wetR);
                }
                if (inL != 0.0 || inR != 0.0 || std::max(std::abs(wetL), std::abs(wetR)) > 1.0e-6) {
                    tailRemaining_ = tailWindow;
                } else if (tailRemaining_ > 0) {
                    --tailRemaining_;
                }
                const double wet = static_cast<double>(wet_.next());
                const double dry = static_cast<double>(dry_.next());
                outL = dry * inL + wet * wetL;
                outR = dry * inR + wet * wetR;
            }
            guard_.apply(outL, outR);
            L[i] = static_cast<float>(outL);
            R[i] = static_cast<float>(outR);
        }
        coefSamples_ -= end - off;
        off = end;
    }
}

}  // namespace nt::audio::effects::fable
