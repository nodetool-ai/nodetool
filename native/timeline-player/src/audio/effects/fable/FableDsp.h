// Derived from georgi/fablesynth (https://github.com/georgi/fablesynth) at
// commit af55d51 / ae9fca7 (juce/source/dsp/{Fx.h,Fx.cpp,ParametricEq.h}).
// FableSynth is published under PolyForm Noncommercial 1.0.0. Its author, who
// also maintains NodeTool, contributes this code to NodeTool under NodeTool's
// licence (AGPL-3.0).
#pragma once

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <vector>

namespace nt::audio::effects::fable {

inline constexpr double kPi = 3.14159265358979323846;

[[nodiscard]] inline double flushDenormal(double x) noexcept {
    return std::abs(x) < 1.0e-30 ? 0.0 : x;
}

[[nodiscard]] inline float flushDenormalF(float x) noexcept {
    return std::abs(x) < 1.0e-30f ? 0.0f : x;
}

// One-pole parameter smoother toward a target (setTargetAtTime equivalent).
// Thread affinity: audio render thread only (prepared on control thread).
struct Smooth {
    float cur = 0.0f;
    float target = 0.0f;
    float coef = 0.01f;

    void setTime(double tau, double sr) noexcept {
        const double rate = (std::isfinite(sr) && sr > 0.0) ? sr : 48000.0;
        const double t = (std::isfinite(tau) && tau > 0.0) ? tau : 0.005;
        coef = static_cast<float>(1.0 - std::exp(-1.0 / (t * rate)));
    }

    float next() noexcept {
        cur = flushDenormalF(cur + (target - cur) * coef);
        return cur;
    }

    float nextN(int n) noexcept {
        if (n > 0) {
            cur = flushDenormalF(cur + (target - cur) * (1.0f - std::pow(1.0f - coef, static_cast<float>(n))));
        }
        return cur;
    }

    void snap(float v) noexcept { cur = target = v; }
};

// Double-precision one-pole parameter smoother for gain/ceiling/mix control.
// Thread affinity: audio render thread only (prepared on control thread).
struct SmoothD {
    double cur = 0.0;
    double target = 0.0;
    double coef = 0.01;

    void setTime(double tau, double sr) noexcept {
        const double rate = (std::isfinite(sr) && sr > 0.0) ? sr : 48000.0;
        const double t = (std::isfinite(tau) && tau > 0.0) ? tau : 0.02;
        coef = 1.0 - std::exp(-1.0 / (t * rate));
    }

    double next() noexcept {
        cur = flushDenormal(cur + (target - cur) * coef);
        return cur;
    }

    void snap(double v) noexcept { cur = target = v; }
};

// Chunk-rate linear parameter ramp used to glide coefficient-bearing controls
// (frequency in log2, gain, Q) without per-sample trig recomputation.
// Thread affinity: audio render thread only (configured on control thread).
struct ChunkRamp {
    void setSteps(int s) noexcept { steps = s > 1 ? s : 1; }

    void setTarget(float t) noexcept {
        if (t == target) {
            return;
        }
        target = t;
        step = (t - cur) / static_cast<float>(steps);
        left = steps;
    }

    bool next() noexcept {
        if (left <= 0) {
            return false;
        }
        cur = (--left == 0) ? target : cur + step;
        return true;
    }

    void snap(float v) noexcept {
        cur = target = v;
        left = 0;
        step = 0.0f;
    }

    void snapToTarget() noexcept {
        cur = target;
        left = 0;
        step = 0.0f;
    }

    float cur = 0.0f;
    float target = 0.0f;
    float step = 0.0f;
    int left = 0;
    int steps = 8;
};

// Transposed Direct Form II RBJ biquad filter.
// Thread affinity: audio render thread only (prepared on control thread).
struct Biquad {
    double b0 = 1.0;
    double b1 = 0.0;
    double b2 = 0.0;
    double a1 = 0.0;
    double a2 = 0.0;
    double z1 = 0.0;
    double z2 = 0.0;

    void lowpass(double freq, double q, double sr) noexcept;
    void highpass(double freq, double q, double sr) noexcept;
    void lowShelf(double freq, double gainDb, double sr, double q = 0.7071067811865476) noexcept;
    void highShelf(double freq, double gainDb, double sr, double q = 0.7071067811865476) noexcept;
    void peaking(double freq, double q, double gainDb, double sr) noexcept;

    double process(double x) noexcept {
        const double y = b0 * x + z1;
        z1 = flushDenormal(b1 * x - a1 * y + z2);
        z2 = flushDenormal(b2 * x - a2 * y);
        return y;
    }

    void copyFrom(const Biquad& other) noexcept {
        b0 = other.b0;
        b1 = other.b1;
        b2 = other.b2;
        a1 = other.a1;
        a2 = other.a2;
        z1 = other.z1;
        z2 = other.z2;
    }

    void reset() noexcept {
        z1 = 0.0;
        z2 = 0.0;
    }

    [[nodiscard]] bool hasState() const noexcept {
        return z1 != 0.0 || z2 != 0.0;
    }
};

// Feed-forward stereo-linked RMS energy matcher shared by WebCompressor and OttCompressor.
// Thread affinity: audio render thread only (prepared on control thread).
class AutoGain {
public:
    explicit AutoGain(double sampleRate = 48000.0) noexcept { prepare(sampleRate); }
    void prepare(double sampleRate) noexcept;
    void reset() noexcept;
    double next(double inL, double inR, double wetL, double wetR) noexcept;

    double gain = 1.0;

private:
    double energyCoef_ = 0.0;
    double gainCoef_ = 0.0;
    double input_ = 0.0;
    double wet_ = 0.0;
    double target_ = 1.0;
    int tick_ = 0;
};

// Zero-latency stereo-linked -1 dBFS sample-peak guard with 80 ms release.
// Thread affinity: audio render thread only (prepared on control thread).
class PeakGuard {
public:
    static constexpr double kCeiling = 0.8912509381337456;  // -1 dBFS

    explicit PeakGuard(double sampleRate = 48000.0) noexcept { prepare(sampleRate); }
    void prepare(double sampleRate) noexcept;
    void reset() noexcept { gain = 1.0; }
    double gainFor(double l, double r) noexcept;
    void process(float* L, float* R, int n) noexcept;

    double gain = 1.0;

private:
    double release_ = 0.0;
};

// Odd-length Kaiser-windowed polyphase half-band FIR (cutoff = rate / 4).
// Designed once on the control thread; audio-thread calls allocate nothing.
// A given instance must be driven in one mode only: process(), or interpolate()/decimate().
// Thread affinity: design() on control thread; process/interpolate/decimate/reset on audio thread.
class HalfBandFir {
public:
    void design(int taps, double beta);
    void reset() noexcept;

    double process(double x) noexcept;
    void interpolate(double x, double& y0, double& y1) noexcept;
    double decimate(double x0, double x1) noexcept;

    [[nodiscard]] int tapCount() const noexcept { return static_cast<int>(h_.size()); }

private:
    std::vector<double> h_;
    std::vector<double> z_;
    int pos_ = 0;

    std::vector<double> nzTap_;
    std::vector<int> nzOff_;

    std::vector<double> pe_;
    std::vector<double> po_;
    int peA_ = 0;
    int peB_ = -1;
    int poA_ = 0;
    int poB_ = -1;

    std::vector<double> hx_;
    std::vector<double> he_;
    std::vector<double> ho_;
    int np_ = 1;
    int px_ = 0;
    int pd_ = 0;
};

}  // namespace nt::audio::effects::fable
