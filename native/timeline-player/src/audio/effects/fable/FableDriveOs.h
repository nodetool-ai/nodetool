// Derived from georgi/fablesynth (https://github.com/georgi/fablesynth) at
// commit af55d51 / ae9fca7 (juce/source/dsp/DriveOs.h).
// FableSynth is published under PolyForm Noncommercial 1.0.0. Its author, who
// also maintains NodeTool, contributes this code to NodeTool under NodeTool's
// licence (AGPL-3.0).
#pragma once

#include "audio/effects/fable/FableDsp.h"

#include <algorithm>
#include <array>
#include <cmath>

namespace nt::audio::effects::fable {

inline constexpr std::array<double, 5> kDriveOsCoef{{
    0.058131122888383423,
    0.21191463147606193,
    0.4170395803350932,
    0.63844438482644794,
    0.87095859811277021,
}};
inline constexpr double kDriveOsInputLimit = 16.0;
inline constexpr double kDriveOsRampSec = 0.004;

// First-order allpass section for the 2x polyphase IIR half-band oversampler.
// Thread affinity: audio render thread only.
struct DriveOsAllpass {
    double x1 = 0.0;
    double y1 = 0.0;

    [[nodiscard]] double process(double a, double x) noexcept {
        const double y = flushDenormal(a * (x - y1) + x1);
        x1 = x;
        y1 = y;
        return y;
    }
};

// 2x polyphase IIR half-band oversampler for drive saturators (Valenzuela/Constantinides
// 11th-order elliptic half-band: flat within 1e-6 dB to 16 kHz, 83 dB image rejection,
// low-frequency group delay 2.74 samples).
// Thread affinity: audio render thread only.
struct DriveOs2 {
    std::array<DriveOsAllpass, 3> u0{};
    std::array<DriveOsAllpass, 2> u1{};
    std::array<DriveOsAllpass, 3> d0{};
    std::array<DriveOsAllpass, 2> d1{};
    double dprev = 0.0;  // decimator branch 1 output, one sample late
    double xp = 0.0;     // previous high-rate ADAA input
    double w = 0.0;      // stage weight: 0 = bypass, 1 = stage

    void reset() noexcept { *this = DriveOs2{}; }

    [[nodiscard]] static double clampIn(double x) noexcept {
        return std::isfinite(x) ? std::clamp(x, -kDriveOsInputLimit, kDriveOsInputLimit) : 0.0;
    }

    // One base-rate sample in, two high-rate samples out.
    void interpolate(double x, double& y0, double& y1) noexcept {
        y0 = u0[2].process(kDriveOsCoef[4], u0[1].process(kDriveOsCoef[2], u0[0].process(kDriveOsCoef[0], x)));
        y1 = u1[1].process(kDriveOsCoef[3], u1[0].process(kDriveOsCoef[1], x));
    }

    // Two high-rate samples in, one base-rate sample out.
    [[nodiscard]] double decimate(double e, double o) noexcept {
        const double a = d0[2].process(kDriveOsCoef[4], d0[1].process(kDriveOsCoef[2], d0[0].process(kDriveOsCoef[0], e)));
        const double b = d1[1].process(kDriveOsCoef[3], d1[0].process(kDriveOsCoef[1], o));
        const double out = 0.5 * (a + dprev);
        dprev = b;
        return out;
    }

    // One base-rate sample. `engage`: stage is in path (ramps by `wStep` per sample).
    // `satOn`: saturator runs with dry/wet mix `m`. `sat(a, xpPrev)` returns shaped `a`.
    template <class Sat>
    [[nodiscard]] double run(double x, bool engage, bool satOn, double m, double wStep, Sat&& sat) noexcept {
        const double target = engage ? 1.0 : 0.0;
        if (w < target) {
            w = std::min(target, w + wStep);
        } else if (w > target) {
            w = std::max(target, w - wStep);
        }
        if (w <= 0.0 && !engage) {
            xp = clampIn(x);
            return x;
        }
        double up0 = 0.0;
        double up1 = 0.0;
        interpolate(x, up0, up1);
        const double a0 = clampIn(up0);
        const double a1 = clampIn(up1);
        double o0 = a0;
        double o1 = a1;
        if (satOn) {
            o0 = a0 + m * (sat(a0, xp) - a0);
            o1 = a1 + m * (sat(a1, a0) - a1);
        }
        xp = a1;
        const double y = decimate(o0, o1);
        return w >= 1.0 ? y : x + w * (y - x);
    }
};

}  // namespace nt::audio::effects::fable
