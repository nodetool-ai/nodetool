#include "audio/MasterLimiter.h"

#include <algorithm>
#include <cmath>
#include <numbers>

namespace nt::audio {
namespace {

constexpr double kPi = std::numbers::pi;

double besselI0(double x) noexcept {
    double sum = 1.0;
    double term = 1.0;
    const double q = x * x / 4.0;
    for (int k = 1; k < 50; ++k) {
        term *= q / static_cast<double>(k * k);
        sum += term;
        if (term < sum * 1e-17) {
            break;
        }
    }
    return sum;
}

int oversampleFactorFor(double sampleRate) noexcept {
    if (!std::isfinite(sampleRate) || sampleRate <= 0.0) {
        return 4;
    }
    int factor = 1;
    while (sampleRate * static_cast<double>(factor) < 176400.0 && factor < 16) {
        factor *= 2;
    }
    return factor;
}

std::size_t nextPowerOfTwo(std::size_t n) noexcept {
    std::size_t p = 1;
    while (p < n) {
        p <<= 1;
    }
    return p;
}

}  // namespace

int MasterLimiter::latencyFramesForRate(double sampleRate) noexcept {
    const double rate = (std::isfinite(sampleRate) && sampleRate >= 1000.0) ? sampleRate : 48000.0;
    const int factor = oversampleFactorFor(rate);
    const int firDelay = factor > 1 ? kFirHalf : 0;
    const int attack = std::max(1, static_cast<int>(std::llround(rate * kAttackSec)));
    return firDelay + attack;
}

void MasterLimiter::prepare(double sampleRate, double ceilingDb) {
    sampleRate_ = (std::isfinite(sampleRate) && sampleRate >= 1000.0) ? sampleRate : 48000.0;
    ceiling_ = std::pow(10.0, ceilingDb / 20.0);
    factor_ = oversampleFactorFor(sampleRate_);
    firDelay_ = factor_ > 1 ? kFirHalf : 0;
    attackFrames_ = std::max(1, static_cast<int>(std::llround(sampleRate_ * kAttackSec)));
    windowLen_ = attackFrames_ + kHoldPadFrames;
    audioDelay_ = firDelay_ + attackFrames_;
    delayCap_ = std::max(audioDelay_, kFirTaps + firDelay_) + 2;
    mixStep_ = 1.0 / std::max(1.0, sampleRate_ * kLiveMixRampSec);
    releaseCoeff_ = std::exp(-1.0 / (kReleaseSec * sampleRate_));

    // Polyphase Kaiser-windowed sinc FIR matching LoudnessMeter's 4x true-peak filter.
    const int length = factor_ * kFirTaps;
    firCoeffs_.resize(static_cast<std::size_t>(length));
    std::vector<double> prototype(static_cast<std::size_t>(length));
    const double centre = static_cast<double>(length) / 2.0;
    const double i0b = besselI0(8.0);
    for (int m = 0; m < length; ++m) {
        const double t = (static_cast<double>(m) - centre) / static_cast<double>(factor_);
        const double r = (static_cast<double>(m) - centre) / (centre + 1.0);
        const double sinc = std::abs(t) < 1e-12 ? 1.0 : std::sin(kPi * t) / (kPi * t);
        prototype[static_cast<std::size_t>(m)] = sinc * besselI0(8.0 * std::sqrt(std::max(0.0, 1.0 - r * r))) / i0b;
    }
    for (int p = 0; p < factor_; ++p) {
        double sum = 0.0;
        for (int j = 0; j < kFirTaps; ++j) {
            sum += prototype[static_cast<std::size_t>(p + factor_ * j)];
        }
        for (int j = 0; j < kFirTaps; ++j) {
            firCoeffs_[static_cast<std::size_t>(p * kFirTaps + j)] =
                static_cast<float>(prototype[static_cast<std::size_t>(p + factor_ * j)] / sum);
        }
    }

    delay_.assign(static_cast<std::size_t>(delayCap_) * 2, 0.0f);
    const std::size_t dequeCap = nextPowerOfTwo(static_cast<std::size_t>(windowLen_) + 2);
    dequeIdx_.assign(dequeCap, 0);
    dequeVal_.assign(dequeCap, 0.0f);
    dequeMask_ = dequeCap - 1;
    boxcar_.assign(static_cast<std::size_t>(attackFrames_), 1.0);
    reset();
}

void MasterLimiter::reset() noexcept {
    for (auto& ch : fir_) {
        ch.history.fill(0.0f);
        ch.position = 0;
    }
    std::ranges::fill(delay_, 0.0f);
    delayPos_ = 0;
    dequeHead_ = 0;
    dequeTail_ = 0;
    sampleIndex_ = 0;
    boundaryActive_ = false;
    boundaryFirIdx_ = 0;
    boundaryExitIdx_ = 0;
    envGain_ = 1.0;
    transEnvGain_ = 1.0;
    std::ranges::fill(boxcar_, 1.0);
    boxcarPos_ = 0;
    boxcarSum_ = static_cast<double>(attackFrames_);
    boxcarNonUnity_ = 0;
    liveDelay_ = static_cast<double>(audioDelay_);
    liveMix_ = 1.0;
}

void MasterLimiter::markLoopBoundary() noexcept {
    boundaryActive_ = true;
    boundaryFirIdx_ = sampleIndex_ + static_cast<std::uint64_t>(firDelay_);
    boundaryExitIdx_ = sampleIndex_ + static_cast<std::uint64_t>(audioDelay_);
}

float MasterLimiter::detectTruePeak(ChannelFir& ch, float x) noexcept {
    if (factor_ == 1) {
        return std::abs(x);
    }
    ch.position = ch.position == 0 ? kFirTaps - 1 : ch.position - 1;
    ch.history[static_cast<std::size_t>(ch.position)] =
        ch.history[static_cast<std::size_t>(ch.position + kFirTaps)] = x;
    const float* history = ch.history.data() + ch.position;
    // Include the centre sample (aligned at firDelay_ = kFirHalf) along with every polyphase phase.
    float peak = std::abs(history[kFirHalf]);
    for (int p = 0; p < factor_; ++p) {
        const float* c = firCoeffs_.data() + static_cast<std::size_t>(p * kFirTaps);
        std::array<float, 8> acc{};
        for (int base = 0; base < kFirTaps; base += 8) {
            for (int j = 0; j < 8; ++j) {
                acc[static_cast<std::size_t>(j)] += c[base + j] * history[base + j];
            }
        }
        const float value = (acc[0] + acc[4]) + (acc[1] + acc[5]) + (acc[2] + acc[6]) + (acc[3] + acc[7]);
        peak = std::max(peak, std::abs(value));
    }
    return peak;
}

float MasterLimiter::advanceDetector(float inL, float inR) noexcept {
    // 1. Stereo-linked true-peak detection (aligned at n - firDelay_).
    const float tp = std::max(detectTruePeak(fir_[0], inL), detectTruePeak(fir_[1], inR));

    // 2. O(1) sliding-window maximum over `windowLen_` frames.
    const auto windowSpan = static_cast<std::uint64_t>(windowLen_);
    const std::uint64_t idx = sampleIndex_++;
    while (dequeHead_ != dequeTail_ && idx - dequeIdx_[dequeHead_] >= windowSpan) {
        dequeHead_ = (dequeHead_ + 1) & dequeMask_;
    }
    while (dequeHead_ != dequeTail_) {
        const std::size_t back = (dequeTail_ - 1) & dequeMask_;
        if (dequeVal_[back] <= tp) {
            dequeTail_ = back;
        } else {
            break;
        }
    }
    dequeIdx_[dequeTail_] = idx;
    dequeVal_[dequeTail_] = tp;
    dequeTail_ = (dequeTail_ + 1) & dequeMask_;

    // At the exact frame where the new loop pass exits `delay_`, discard pre-boundary
    // peak history and release tail while preserving any peaks already seen in the new pass.
    if (boundaryActive_ && idx >= boundaryExitIdx_) {
        while (dequeHead_ != dequeTail_ && dequeIdx_[dequeHead_] < boundaryFirIdx_) {
            dequeHead_ = (dequeHead_ + 1) & dequeMask_;
        }
        const float newWindowPeak = (dequeHead_ != dequeTail_) ? dequeVal_[dequeHead_] : 0.0f;
        const double resetGain = static_cast<double>(newWindowPeak) > ceiling_
            ? ceiling_ / static_cast<double>(newWindowPeak)
            : 1.0;
        envGain_ = resetGain;
        std::ranges::fill(boxcar_, resetGain);
        boxcarPos_ = 0;
        boxcarSum_ = resetGain * static_cast<double>(attackFrames_);
        boxcarNonUnity_ = (resetGain == 1.0) ? 0 : attackFrames_;
        boundaryActive_ = false;
    }

    const float windowPeak = (dequeHead_ != dequeTail_) ? dequeVal_[dequeHead_] : 0.0f;

    // 3. Target gain + instant attack / smooth exponential release envelope.
    const double rawGain = static_cast<double>(windowPeak) > ceiling_
        ? ceiling_ / static_cast<double>(windowPeak)
        : 1.0;
    if (rawGain < envGain_) {
        envGain_ = rawGain;
    } else {
        envGain_ = rawGain + releaseCoeff_ * (envGain_ - rawGain);
        if (rawGain == 1.0 && 1.0 - envGain_ < 1e-7) {
            envGain_ = 1.0;
        }
    }

    // 4. Moving-average attack smoother of length `attackFrames_`.
    const auto pos = static_cast<std::size_t>(boxcarPos_);
    const double outgoing = boxcar_[pos];
    if (outgoing != 1.0) {
        --boxcarNonUnity_;
    }
    boxcar_[pos] = envGain_;
    if (envGain_ != 1.0) {
        ++boxcarNonUnity_;
    }
    boxcarPos_ = (boxcarPos_ + 1 == attackFrames_) ? 0 : boxcarPos_ + 1;
    boxcarSum_ += envGain_ - outgoing;
    if (boxcarNonUnity_ == 0) {
        boxcarSum_ = static_cast<double>(attackFrames_);
        return 1.0f;
    }
    return static_cast<float>(std::clamp(boxcarSum_ / static_cast<double>(attackFrames_), 0.0, 1.0));
}

float MasterLimiter::alignedAttackGain(int delayInt, float fullGain) const noexcept {
    if (boxcarNonUnity_ == 0) {
        return 1.0f;
    }
    const int avail = std::clamp(delayInt - firDelay_ + 1, 1, attackFrames_);
    if (avail >= attackFrames_) {
        return fullGain;
    }
    double sum = 0.0;
    int idx = boxcarPos_;
    for (int i = 0; i < avail; ++i) {
        idx = (idx == 0) ? (attackFrames_ - 1) : (idx - 1);
        sum += boxcar_[static_cast<std::size_t>(idx)];
    }
    return static_cast<float>(std::clamp(sum / static_cast<double>(avail), 0.0, 1.0));
}

float MasterLimiter::detectCausalPeak(int delayInt) const noexcept {
    // Runs only while liveDelay_ < firDelay_ (first ~4 ms of an enable slew).
    // Scans available un-delayed samples [n - delayInt - 1 .. n] and evaluates
    // the causal polyphase FIR centered at n - delayInt using zero for unavailable future samples.
    float peak = 0.0f;
    const int maxScanLag = std::min(delayInt + 1, delayCap_ - 1);
    for (int lag = 0; lag <= maxScanLag; ++lag) {
        const int idx = (delayPos_ + delayCap_ - lag) % delayCap_;
        const auto p = static_cast<std::size_t>(idx) * 2;
        peak = std::max(peak, std::max(std::abs(delay_[p]), std::abs(delay_[p + 1])));
    }
    if (factor_ <= 1) {
        return peak;
    }
    for (int p = 0; p < factor_; ++p) {
        const float* c = firCoeffs_.data() + static_cast<std::size_t>(p * kFirTaps);
        float sumL = 0.0f;
        float sumR = 0.0f;
        for (int j = 0; j < kFirTaps; ++j) {
            const int lag = delayInt + j - kFirHalf;
            if (lag < 0 || lag >= delayCap_) {
                continue;
            }
            const int idx = (delayPos_ + delayCap_ - lag) % delayCap_;
            const auto pos = static_cast<std::size_t>(idx) * 2;
            sumL += c[j] * delay_[pos];
            sumR += c[j] * delay_[pos + 1];
        }
        peak = std::max(peak, std::max(std::abs(sumL), std::abs(sumR)));
    }
    return peak;
}

void MasterLimiter::readFractionalDelay(double delayFrames, float& outL, float& outR) const noexcept {
    if (delayFrames <= 0.0) {
        const auto dPos = static_cast<std::size_t>(delayPos_) * 2;
        outL = delay_[dPos];
        outR = delay_[dPos + 1];
        return;
    }
    const double maxD = static_cast<double>(audioDelay_);
    if (delayFrames >= maxD) {
        const int idx = (delayPos_ + delayCap_ - audioDelay_) % delayCap_;
        const auto dPos = static_cast<std::size_t>(idx) * 2;
        outL = delay_[dPos];
        outR = delay_[dPos + 1];
        return;
    }
    const int k = static_cast<int>(delayFrames);
    const float frac = static_cast<float>(delayFrames - static_cast<double>(k));
    const int idx0 = (delayPos_ + delayCap_ - k) % delayCap_;
    const int idx1 = (idx0 == 0) ? (delayCap_ - 1) : (idx0 - 1);
    const auto p0 = static_cast<std::size_t>(idx0) * 2;
    const auto p1 = static_cast<std::size_t>(idx1) * 2;
    const float w0 = 1.0f - frac;
    outL = delay_[p0] * w0 + delay_[p1] * frac;
    outR = delay_[p0 + 1] * w0 + delay_[p1 + 1] * frac;
}

void MasterLimiter::process(std::span<float> stereo) noexcept {
    step(stereo.data(), stereo.data(), stereo.size() / 2);
}

void MasterLimiter::observe(std::span<const float> stereo) noexcept {
    step(nullptr, stereo.data(), stereo.size() / 2);
}

void MasterLimiter::processLive(std::span<float> stereo, bool enabled, bool hardReset) noexcept {
    if (audioDelay_ <= 0 || delay_.empty() || boxcar_.empty() || stereo.empty()) {
        return;
    }
    if (hardReset) {
        reset();
        liveDelay_ = enabled ? static_cast<double>(audioDelay_) : 0.0;
        liveMix_ = enabled ? 1.0 : 0.0;
    }
    const double targetDelay = enabled ? static_cast<double>(audioDelay_) : 0.0;
    const std::size_t frames = stereo.size() / 2;
    for (std::size_t f = 0; f < frames; ++f) {
        float inL = stereo[2 * f];
        float inR = stereo[2 * f + 1];
        if (!std::isfinite(inL)) inL = 0.0f;
        if (!std::isfinite(inR)) inR = 0.0f;

        const float gain = advanceDetector(inL, inR);

        const auto wPos = static_cast<std::size_t>(delayPos_) * 2;
        delay_[wPos] = inL;
        delay_[wPos + 1] = inR;

        if (liveDelay_ < targetDelay) {
            liveDelay_ = std::min(targetDelay, liveDelay_ + kDelaySlewPerFrame);
        } else if (liveDelay_ > targetDelay) {
            liveDelay_ = std::max(targetDelay, liveDelay_ - kDelaySlewPerFrame);
        }
        if (enabled) {
            // Engage ceiling protection immediately while slewing output delay so transients
            // during enable cannot exceed -1 dBTP. Quiet audio (gain == 1) has zero step.
            liveMix_ = 1.0;
        } else if (liveMix_ > 0.0) {
            liveMix_ = std::max(0.0, liveMix_ - mixStep_);
        }

        if (liveDelay_ <= 0.0 && liveMix_ <= 0.0) {
            transEnvGain_ = 1.0;
            stereo[2 * f] = inL;
            stereo[2 * f + 1] = inR;
        } else {
            float outL = 0.0f;
            float outR = 0.0f;
            readFractionalDelay(liveDelay_, outL, outR);
            const int delayInt = std::clamp(static_cast<int>(liveDelay_), 0, audioDelay_);
            float activeGain = alignedAttackGain(delayInt, gain);

            double causalRawGain = 1.0;
            if (enabled && delayInt < firDelay_) {
                const float causalPeak = std::max(detectCausalPeak(delayInt),
                                                  std::max(std::abs(outL), std::abs(outR)));
                // Conservative headroom for missing future FIR samples tapers to 1.0 at firDelay_.
                const double missingFrac = static_cast<double>(firDelay_ - delayInt) / static_cast<double>(firDelay_);
                const double effectivePeak = static_cast<double>(causalPeak) * (1.0 + 0.35 * missingFrac);
                if (effectivePeak > ceiling_) {
                    causalRawGain = ceiling_ / effectivePeak;
                }
            }
            if (causalRawGain < transEnvGain_) {
                transEnvGain_ = causalRawGain;
            } else {
                transEnvGain_ = causalRawGain + releaseCoeff_ * (transEnvGain_ - causalRawGain);
                if (causalRawGain == 1.0 && 1.0 - transEnvGain_ < 1e-7) {
                    transEnvGain_ = 1.0;
                }
            }
            activeGain = std::min(activeGain, static_cast<float>(transEnvGain_));

            const float effGain = (liveMix_ >= 1.0)
                ? activeGain
                : static_cast<float>(1.0 + liveMix_ * (static_cast<double>(activeGain) - 1.0));
            stereo[2 * f] = outL * effGain;
            stereo[2 * f + 1] = outR * effGain;
        }
        delayPos_ = (delayPos_ + 1 == delayCap_) ? 0 : delayPos_ + 1;
    }
}

void MasterLimiter::step(float* outStereo, const float* inStereo, std::size_t frames) noexcept {
    if (audioDelay_ <= 0 || delay_.empty() || boxcar_.empty() || !inStereo) {
        return;
    }
    for (std::size_t f = 0; f < frames; ++f) {
        float inL = inStereo[2 * f];
        float inR = inStereo[2 * f + 1];
        if (!std::isfinite(inL)) inL = 0.0f;
        if (!std::isfinite(inR)) inR = 0.0f;

        const float gain = advanceDetector(inL, inR);

        // 5. Write current stereo frame and read `audioDelay_` frames behind it.
        const auto wPos = static_cast<std::size_t>(delayPos_) * 2;
        delay_[wPos] = inL;
        delay_[wPos + 1] = inR;

        if (outStereo) {
            const int rIdx = (delayPos_ + delayCap_ - audioDelay_) % delayCap_;
            const auto rPos = static_cast<std::size_t>(rIdx) * 2;
            outStereo[2 * f] = delay_[rPos] * gain;
            outStereo[2 * f + 1] = delay_[rPos + 1] * gain;
        }
        delayPos_ = (delayPos_ + 1 == delayCap_) ? 0 : delayPos_ + 1;
    }
}

}  // namespace nt::audio
