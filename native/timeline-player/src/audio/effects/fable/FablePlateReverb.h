// Derived from georgi/fablesynth (https://github.com/georgi/fablesynth) at
// commit af55d51 / ae9fca7 (juce/source/dsp/PlateReverb.h).
// FableSynth is published under PolyForm Noncommercial 1.0.0. Its author, who
// also maintains NodeTool, contributes this code to NodeTool under NodeTool's
// licence (AGPL-3.0).
#pragma once

#include "audio/effects/fable/FableDsp.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <vector>

namespace nt::audio::effects::fable {

namespace plate {

inline constexpr double kFs = 29761.0;
inline constexpr double kPi = 3.141592653589793;
inline constexpr std::array<int, 6> kInAp{{142, 107, 379, 277, 613, 491}};
inline constexpr std::array<double, 6> kInG{{0.75, 0.75, 0.625, 0.625, 0.6, 0.6}};
inline constexpr double kExcursion = 16.0;
inline constexpr std::array<double, 2> kModHz{{0.5, 0.31}};
inline constexpr double kDiffusion1 = 0.7;
inline constexpr std::array<int, 6> kLines{{4453, 3720, 1800, 4217, 3163, 2656}};

struct Tap {
    int line;
    int pos;
    int sign;
};

inline constexpr std::array<Tap, 7> kTapsL{{
    {3, 266, 1}, {3, 2974, 1}, {5, 1913, -1}, {4, 1996, 1},
    {0, 1990, -1}, {2, 187, -1}, {1, 1066, -1},
}};
inline constexpr std::array<Tap, 7> kTapsR{{
    {0, 353, 1}, {0, 3627, 1}, {2, 1228, -1}, {1, 2673, 1},
    {3, 2111, -1}, {5, 335, -1}, {4, 121, -1},
}};

inline constexpr double kBranchSec = (672 + 4453 + 1800 + 3720 + 908 + 4217 + 2656 + 3163) / 2.0 / kFs;

// SIZE -> RT60, matching the ROOM comb network's decay law.
[[nodiscard]] inline double decay(double size) noexcept {
    const double rt60 = (-3.0 * 0.0312) / std::log10(0.7 + 0.28 * std::clamp(size, 0.0, 1.0));
    return std::pow(10.0, (-3.0 * kBranchSec) / (2.0 * rt60));
}

// DAMP -> tank low-pass corner: 16 kHz at 0, 4 kHz at 0.5, 1 kHz at 1.
[[nodiscard]] inline double dampHz(double damp) noexcept {
    return 16000.0 * std::pow(2.0, -4.0 * std::clamp(damp, 0.0, 1.0));
}

// Ring buffer for PlateReverb allpasses and tank lines.
// Thread affinity: prepare() on control thread; tap/tapFrac/write/reset on audio thread only.
struct Line {
    std::vector<float> buf;
    int len = 2;
    int n = 6;
    int w = 0;

    void prepare(int length) {
        len = std::max(2, length);
        n = len + 4;
        buf.assign(static_cast<std::size_t>(n), 0.0f);
        w = 0;
    }

    void reset() noexcept {
        std::ranges::fill(buf, 0.0f);
        w = 0;
    }

    // Sample written `d` writes ago (1 = newest).
    [[nodiscard]] float tap(int d) const noexcept {
        if (buf.empty()) {
            return 0.0f;
        }
        const int clamped = std::clamp(d, 0, n - 1);
        int i = w - clamped;
        if (i < 0) {
            i += n;
        }
        return buf[static_cast<std::size_t>(i)];
    }

    [[nodiscard]] double tapFrac(double d) const noexcept {
        if (buf.empty()) {
            return 0.0;
        }
        const double clamped = std::clamp(std::isfinite(d) ? d : 0.0, 0.0, static_cast<double>(n - 2));
        const int i = static_cast<int>(clamped);
        const double f = clamped - static_cast<double>(i);
        const double a = static_cast<double>(tap(i));
        return a + (static_cast<double>(tap(i + 1)) - a) * f;
    }

    void write(double x) noexcept {
        if (buf.empty()) {
            return;
        }
        buf[static_cast<std::size_t>(w)] = flushDenormalF(static_cast<float>(std::isfinite(x) ? x : 0.0));
        if (++w >= n) {
            w = 0;
        }
    }
};

}  // namespace plate

// Dense allpass-loop plate reverb (Dattorro, "Effect Design, Part 1", JAES 1997).
// Six input diffusers feed a figure-eight tank of two branches with modulated allpasses,
// damping low-pass filters, and fourteen stereo output taps.
// Thread affinity: prepare() on control thread (allocates once); setParams/process/reset on audio render thread only.
class PlateReverb {
public:
    void prepare(double sampleRate) {
        sr_ = (std::isfinite(sampleRate) && sampleRate > 0.0) ? sampleRate : 48000.0;
        const double k = sr_ / plate::kFs;
        const auto len = [k](int n) { return std::max(2, static_cast<int>(std::lround(n * k))); };
        for (std::size_t i = 0; i < 6; ++i) {
            inAp_[i].prepare(len(plate::kInAp[i]));
        }
        exc_ = plate::kExcursion * k;
        modLen_[0] = len(672);
        modLen_[1] = len(908);
        for (std::size_t i = 0; i < 2; ++i) {
            modAp_[i].prepare(modLen_[i] + static_cast<int>(std::ceil(exc_)) + 2);
        }
        for (std::size_t i = 0; i < 6; ++i) {
            lines_[i].prepare(len(plate::kLines[i]));
        }
        const auto pos = [&](const plate::Tap& t) {
            return std::min(lines_[static_cast<std::size_t>(t.line)].len,
                            std::max(1, static_cast<int>(std::lround(t.pos * k))));
        };
        for (std::size_t i = 0; i < 7; ++i) {
            tapL_[i] = pos(plate::kTapsL[i]);
            tapR_[i] = pos(plate::kTapsR[i]);
        }
        for (std::size_t i = 0; i < 2; ++i) {
            modInc_[i] = 2.0 * plate::kPi * plate::kModHz[i] / sr_;
        }
        hpK_ = 1.0 - std::exp(-2.0 * plate::kPi * 120.0 / sr_);  // input low cut, 120 Hz
        setParams(0.5, 0.5);
        reset();
    }

    void reset() noexcept {
        for (auto& l : inAp_) {
            l.reset();
        }
        for (auto& l : modAp_) {
            l.reset();
        }
        for (auto& l : lines_) {
            l.reset();
        }
        hp_ = 0.0;
        lpL_ = 0.0;
        lpR_ = 0.0;
        ph0_ = 0.0;
        ph1_ = plate::kPi / 2.0;
        outL = 0.0;
        outR = 0.0;
    }

    void setParams(double size, double damp) noexcept {
        decay_ = plate::decay(size);
        diffusion2_ = std::clamp(decay_ + 0.15, 0.25, 0.5);
        damp_ = std::exp(-2.0 * plate::kPi * plate::dampHz(damp) / sr_);
    }

    // One mono input sample; stereo result is stored in outL / outR.
    void process(double x) noexcept {
        if (!std::isfinite(x)) {
            x = 0.0;
        }
        hp_ = flushDenormal(hp_ + hpK_ * (x - hp_));
        x -= hp_;
        for (std::size_t i = 0; i < 6; ++i) {
            auto& line = inAp_[i];
            const double g = plate::kInG[i];
            const double d = static_cast<double>(line.tap(line.len));
            const double v = x - g * d;
            line.write(v);
            x = d + g * v;
        }
        auto& ln = lines_;
        const double decay = decay_;
        const double g2 = diffusion2_;
        const double damp = damp_;
        const double endL = static_cast<double>(ln[1].tap(ln[1].len));
        const double endR = static_cast<double>(ln[4].tap(ln[4].len));
        ph0_ += modInc_[0];
        if (ph0_ > 2.0 * plate::kPi) {
            ph0_ -= 2.0 * plate::kPi;
        }
        ph1_ += modInc_[1];
        if (ph1_ > 2.0 * plate::kPi) {
            ph1_ -= 2.0 * plate::kPi;
        }

        // Left branch, fed by input and end of right branch.
        double a = x + decay * endR;
        double d = modAp_[0].tapFrac(static_cast<double>(modLen_[0]) + exc_ * std::sin(ph0_));
        double v = a + plate::kDiffusion1 * d;
        modAp_[0].write(v);
        a = d - plate::kDiffusion1 * v;
        d = static_cast<double>(ln[0].tap(ln[0].len));
        ln[0].write(a);
        lpL_ = flushDenormal(d + damp * (lpL_ - d));
        a = lpL_ * decay;
        d = static_cast<double>(ln[2].tap(ln[2].len));
        v = a - g2 * d;
        ln[2].write(v);
        ln[1].write(d + g2 * v);

        // Right branch, fed by input and end of left branch.
        a = x + decay * endL;
        d = modAp_[1].tapFrac(static_cast<double>(modLen_[1]) + exc_ * std::sin(ph1_));
        v = a + plate::kDiffusion1 * d;
        modAp_[1].write(v);
        a = d - plate::kDiffusion1 * v;
        d = static_cast<double>(ln[3].tap(ln[3].len));
        ln[3].write(a);
        lpR_ = flushDenormal(d + damp * (lpR_ - d));
        a = lpR_ * decay;
        d = static_cast<double>(ln[5].tap(ln[5].len));
        v = a - g2 * d;
        ln[5].write(v);
        ln[4].write(d + g2 * v);

        double l = 0.0;
        double r = 0.0;
        for (std::size_t i = 0; i < 7; ++i) {
            l += static_cast<double>(plate::kTapsL[i].sign) *
                 static_cast<double>(ln[static_cast<std::size_t>(plate::kTapsL[i].line)].tap(tapL_[i]));
            r += static_cast<double>(plate::kTapsR[i].sign) *
                 static_cast<double>(ln[static_cast<std::size_t>(plate::kTapsR[i].line)].tap(tapR_[i]));
        }
        outL = 0.6 * l;
        outR = 0.6 * r;
    }

    double outL = 0.0;
    double outR = 0.0;

private:
    double sr_ = 48000.0;
    std::array<plate::Line, 6> inAp_{};
    std::array<plate::Line, 6> lines_{};
    std::array<plate::Line, 2> modAp_{};
    std::array<int, 2> modLen_{{2, 2}};
    std::array<int, 7> tapL_{};
    std::array<int, 7> tapR_{};
    double exc_ = 0.0;
    std::array<double, 2> modInc_{{0.0, 0.0}};
    double hpK_ = 0.0;
    double decay_ = 0.5;
    double diffusion2_ = 0.5;
    double damp_ = 0.0;
    double hp_ = 0.0;
    double lpL_ = 0.0;
    double lpR_ = 0.0;
    double ph0_ = 0.0;
    double ph1_ = 0.0;
};

}  // namespace nt::audio::effects::fable
