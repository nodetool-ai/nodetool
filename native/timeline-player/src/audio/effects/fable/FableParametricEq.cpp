// Derived from georgi/fablesynth (https://github.com/georgi/fablesynth) at
// commit af55d51 / ae9fca7 (juce/source/dsp/{Fx.h,Fx.cpp,ParametricEq.h}).
// FableSynth is published under PolyForm Noncommercial 1.0.0. Its author, who
// also maintains NodeTool, contributes this code to NodeTool under NodeTool's
// licence (AGPL-3.0).

#include "audio/effects/fable/FableParametricEq.h"

#include <algorithm>
#include <cmath>

namespace nt::audio::effects::fable {

void ParametricEq::prepare(double sr) noexcept {
    sr_ = (std::isfinite(sr) && sr > 0.0) ? sr : 48000.0;
    wet_.setTime(0.005, sr_);
    guard_.prepare(sr_);
    typeFadeSamples_ = std::max(1, static_cast<int>(std::lround(0.003 * sr_)));
    const int steps = std::max(1, static_cast<int>(sr_ * 0.015 / 32.0));
    for (auto& b : bands_) {
        b.freq.setSteps(steps);
        b.gain.setSteps(steps);
        b.q.setSteps(steps);
    }
    primed_ = false;
    reset();
}

void ParametricEq::reset() noexcept {
    for (auto& b : bands_) {
        b.l.reset();
        b.r.reset();
        b.oldL.reset();
        b.oldR.reset();
        b.freq.snapToTarget();
        b.gain.snapToTarget();
        b.q.snapToTarget();
        b.type = b.pendingType;
        b.xfLeft = 0;
        b.dirty = true;
    }
    wet_.snap(wet_.target);
    guard_.reset();
    left_ = 0;
}

void ParametricEq::setParams(const std::array<float, kParamCount>& p) noexcept {
    static constexpr int kKeys[4][5] = {
        {5, 1, 9, 10, 11},
        {3, 2, 12, 13, 14},
        {6, 8, 15, 16, 17},
        {7, 4, 18, 19, 20},
    };
    wet_.target = p[0] > 0.5f ? 1.0f : 0.0f;
    if (!primed_) {
        wet_.snap(wet_.target);
    }
    for (std::size_t i = 0; i < 4; ++i) {
        auto& b = bands_[i];
        const auto& k = kKeys[i];
        const float f = std::log2(std::clamp(p[static_cast<std::size_t>(k[0])], 20.0f, 20000.0f));
        const float g = p[static_cast<std::size_t>(k[4])] > 0.5f
            ? std::clamp(p[static_cast<std::size_t>(k[1])], -15.0f, 15.0f)
            : 0.0f;
        const float q = std::clamp(p[static_cast<std::size_t>(k[2])], 0.2f, 12.0f);
        const int type = std::clamp(static_cast<int>(std::lround(p[static_cast<std::size_t>(k[3])])), 0, 2);
        if (!primed_) {
            b.freq.snap(f);
            b.gain.snap(g);
            b.q.snap(q);
            b.type = type;
            b.pendingType = type;
            b.xfLeft = 0;
            b.dirty = true;
        } else {
            b.freq.setTarget(f);
            b.gain.setTarget(g);
            b.q.setTarget(q);
            b.dirty = b.dirty || (b.pendingType != type);
            b.pendingType = type;
        }
    }
    primed_ = true;
}

void ParametricEq::process(float* L, float* R, int n) noexcept {
    for (int i = 0; i < n; ++i) {
        if (!std::isfinite(L[i])) {
            L[i] = 0.0f;
        }
        if (!std::isfinite(R[i])) {
            R[i] = 0.0f;
        }
        if (left_-- <= 0) {
            left_ = 31;
            for (auto& b : bands_) {
                bool changed = b.freq.next();
                changed |= b.gain.next();
                changed |= b.q.next();
                const bool wantTypeSwitch = (b.type != b.pendingType) && (b.xfLeft == 0);
                if (!(changed || b.dirty || wantTypeSwitch)) {
                    continue;
                }
                const double f = std::exp2(static_cast<double>(b.freq.cur));
                const double q = static_cast<double>(b.q.cur);
                const double g = static_cast<double>(b.gain.cur);
                if (wantTypeSwitch) {
                    b.oldL.copyFrom(b.l);
                    b.oldR.copyFrom(b.r);
                    b.type = b.pendingType;
                    b.xfLeft = typeFadeSamples_;
                }
                for (Biquad* filter : {&b.l, &b.r}) {
                    if (b.type == 0) {
                        filter->lowShelf(f, g, sr_, q);
                    } else if (b.type == 2) {
                        filter->highShelf(f, g, sr_, q);
                    } else {
                        filter->peaking(f, q, g, sr_);
                    }
                }
                // Remain dirty if a rapid type switch is waiting for the active crossfade to finish.
                b.dirty = (b.type != b.pendingType);
            }
        }
        const float wet = wet_.next();
        if (wet_.target == 0.0f && wet < 1.0e-6f) {
            if (wet != 0.0f) {
                wet_.snap(0.0f);
                for (auto& b : bands_) {
                    b.l.reset();
                    b.r.reset();
                    b.oldL.reset();
                    b.oldR.reset();
                    b.xfLeft = 0;
                }
            }
            continue;
        }
        const double dryL = static_cast<double>(L[i]);
        const double dryR = static_cast<double>(R[i]);
        double l = dryL;
        double r = dryR;
        for (auto& b : bands_) {
            const double inL = l;
            const double inR = r;
            const double newL = b.l.process(inL);
            const double newR = b.r.process(inR);
            if (b.xfLeft > 0) {
                const double oldL = b.oldL.process(inL);
                const double oldR = b.oldR.process(inR);
                const double mix = 1.0 - static_cast<double>(b.xfLeft) / static_cast<double>(typeFadeSamples_);
                l = oldL + mix * (newL - oldL);
                r = oldR + mix * (newR - oldR);
                --b.xfLeft;
            } else {
                l = newL;
                r = newR;
            }
        }
        double outL = dryL + static_cast<double>(wet) * (l - dryL);
        double outR = dryR + static_cast<double>(wet) * (r - dryR);
        guard_.apply(outL, outR);
        L[i] = static_cast<float>(outL);
        R[i] = static_cast<float>(outR);
    }
}

bool ParametricEq::hasPendingOutput() const noexcept {
    constexpr double kTailFloor = 1.0e-6;
    for (const auto& b : bands_) {
        if (b.l.hasState(kTailFloor) || b.r.hasState(kTailFloor) || b.xfLeft > 0) {
            return true;
        }
    }
    return false;
}

}  // namespace nt::audio::effects::fable
