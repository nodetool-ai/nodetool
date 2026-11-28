// Derived from georgi/fablesynth (https://github.com/georgi/fablesynth) at
// commit af55d51 / ae9fca7 (juce/source/dsp/{Fx.h,Fx.cpp}).
// FableSynth is published under PolyForm Noncommercial 1.0.0. Its author, who
// also maintains NodeTool, contributes this code to NodeTool under NodeTool's
// licence (AGPL-3.0).
#pragma once

#include "audio/effects/fable/FableDsp.h"

#include <array>
#include <vector>

namespace nt::audio::effects::fable {

// Stereo-linked soft-knee (9 dB) leveling compressor with feed-forward AutoGain
// and optional high-passed side-chain key input.
// Thread affinity: prepared on control thread; setParams/setKey/process/reset on audio render thread only.
class WebCompressor {
public:
    explicit WebCompressor(double sampleRate = 48000.0) noexcept { prepare(sampleRate); }
    void prepare(double sampleRate) noexcept;
    void setParams(bool on, float thresholdDb, float attack = 0.003f,
                   float release = 0.25f, float ratio = 4.0f) noexcept;
    void setKey(bool keyed, float hpHz = 20.0f) noexcept;
    [[nodiscard]] bool keyed() const noexcept { return keyed_; }
    void reset() noexcept;
    void process(float* L, float* R, int n, const float* key = nullptr) noexcept;
    void processSample(double inL, double inR, double& outL, double& outR,
                       double keyL = 0.0, double keyR = 0.0) noexcept;
    [[nodiscard]] int latencySamples() const noexcept { return 0; }

    bool wetTarget = false;
    double env = 0.0;
    double gain = 1.0;
    AutoGain autoGain;

private:
    double sr_ = 48000.0;
    double smooth_ = 0.0;
    double attack_ = 0.0;
    double release_ = 0.0;
    double attackSec_ = -1.0;
    double releaseSec_ = -1.0;
    double wet_ = 0.0;
    double threshold_ = -16.0;
    double thresholdTarget_ = -16.0;
    double ratio_ = 4.0;
    double ratioTarget_ = 4.0;
    double gainStep_ = 0.0;
    int tick_ = 0;
    bool keyed_ = false;
    double keyHpHz_ = -1.0;
    double keyCoef_ = 0.0;
    double keyLpL_ = 0.0;
    double keyLpR_ = 0.0;
};

// Three-band complementary-crossover OTT upward/downward compressor with AutoGain.
// Thread affinity: prepared on control thread; setParams/process/reset on audio render thread only.
class OttCompressor {
public:
    explicit OttCompressor(double sampleRate = 48000.0) noexcept { prepare(sampleRate); }
    void prepare(double sampleRate) noexcept;
    void setParams(bool on, float depth, float time, float up, float down) noexcept;
    void reset() noexcept;
    void process(float* L, float* R, int n) noexcept;
    void processSample(double inL, double inR, double& outL, double& outR) noexcept;
    [[nodiscard]] bool hasPendingOutput() const noexcept;
    [[nodiscard]] int latencySamples() const noexcept { return 0; }

    double depthTarget = 0.0;
    double depth = 0.0;
    std::array<double, 3> env{{0.0, 0.0, 0.0}};
    std::array<double, 3> gain{{1.0, 1.0, 1.0}};
    AutoGain autoGain;

private:
    double sr_ = 48000.0;
    double lowCoef_ = 0.0;
    double highCoef_ = 0.0;
    double smooth_ = 0.0;
    std::array<double, 4> split_{{0.0, 0.0, 0.0, 0.0}};
    std::array<double, 3> target_{{1.0, 1.0, 1.0}};
    std::array<double, 3> bandsL_{{0.0, 0.0, 0.0}};
    std::array<double, 3> bandsR_{{0.0, 0.0, 0.0}};
    std::array<double, 3> attack_{{0.0, 0.0, 0.0}};
    std::array<double, 3> release_{{0.0, 0.0, 0.0}};
    double up_ = 1.0;
    double down_ = 1.0;
    double time_ = 0.0;
    int tick_ = 0;
};

// Stereo-linked lookahead brickwall limiter with O(1) monotonic ring queue.
// Supports exact FableSynth sample-peak mode (truePeak = false) and 4x HalfBandFir
// true-peak detection mode (truePeak = true) with phase-aligned delay and PDC latency.
// Thread affinity: prepare() on control thread (allocates once); set*/process/reset on audio thread only.
class LookaheadLimiter {
public:
    static constexpr double kCeiling = 0.8912509381337456;  // -1 dBFS
    static constexpr double kLookaheadSec = 0.0015;         // ~1.5 ms lookahead
    static constexpr int kTpFir1Taps = 33;                  // 2x stage: center tap 16 -> 8 base samples
    static constexpr int kTpFir2Taps = 17;                  // 4x stage: center tap 8  -> 2 base samples
    static constexpr double kTpFirBeta = 6.0;
    static constexpr int kTruePeakFirDelay = (kTpFir1Taps - 1) / 4 + (kTpFir2Taps - 1) / 8;  // 10 samples
    static constexpr int kTruePeakHoldPad = 8;

    void prepare(double sampleRate, double makeup = 1.0, bool truePeak = false, double releaseSec = 0.2);
    void setRelease(double releaseSec) noexcept;
    void setMakeup(double makeup) noexcept { makeup_ = makeup; }
    void reset() noexcept;
    [[nodiscard]] int latencySamples() const noexcept { return totalDelay_; }
    [[nodiscard]] bool hasPendingOutput() const noexcept;
    [[nodiscard]] double currentGain() const noexcept { return env_; }

    double process(float& l, float& r, double ceiling = kCeiling) noexcept;

private:
    [[nodiscard]] int nextQ(int i) const noexcept { return i + 1 < qcap_ ? i + 1 : 0; }
    [[nodiscard]] int prevQ(int i) const noexcept { return i > 0 ? i - 1 : qcap_ - 1; }
    double detectTruePeak(double xl, double xr) noexcept;

    std::vector<float> dlL_;
    std::vector<float> dlR_;
    std::vector<double> tpDl_;
    std::vector<double> qv_;
    std::vector<long long> qi_;
    HalfBandFir up1L_;
    HalfBandFir up2L_;
    HalfBandFir up1R_;
    HalfBandFir up2R_;
    double sr_ = 48000.0;
    int la_ = 72;
    int windowSpan_ = 72;
    int totalDelay_ = 72;
    int w_ = 0;
    int tpW_ = 0;
    int qcap_ = 74;
    int qh_ = 0;
    int qt_ = 0;
    long long t_ = 0;
    double env_ = 1.0;
    double atk_ = 0.0;
    double rel_ = 0.0;
    double releaseSec_ = -1.0;
    double makeup_ = 1.0;
    bool truePeak_ = false;
};

}  // namespace nt::audio::effects::fable
