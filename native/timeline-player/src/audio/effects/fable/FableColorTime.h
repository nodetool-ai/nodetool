// Derived from georgi/fablesynth (https://github.com/georgi/fablesynth) at
// commit af55d51 / ae9fca7 (juce/source/dsp/{Fx.h,Fx.cpp,DriveOs.h,PlateReverb.h}).
// FableSynth is published under PolyForm Noncommercial 1.0.0. Its author, who
// also maintains NodeTool, contributes this code to NodeTool under NodeTool's
// licence (AGPL-3.0).
#pragma once

#include "audio/effects/fable/FableDriveOs.h"
#include "audio/effects/fable/FableDsp.h"
#include "audio/effects/fable/FablePlateReverb.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <vector>

namespace nt::audio::effects::fable {

inline constexpr int kDriveHB1Taps = 63;
inline constexpr int kDriveHB2Taps = 17;
inline constexpr int kDriveLatency = (kDriveHB1Taps - 1) / 2 + (kDriveHB2Taps - 1) / 4;  // 35 samples
inline constexpr float kPlateGain = 0.66f;
inline constexpr int kColorTimeCoefChunk = 32;
inline constexpr std::array<double, 6> kEchoDivisions{{1.0, 1.5, 0.5, 0.75, 1.0 / 3.0, 0.25}};

// Fractional-read circular delay line with linear and 4-point Catmull-Rom Hermite reads.
// Thread affinity: prepare() on control thread (allocates once); write/read/readHermite/reset on audio thread only.
class DelayLine {
public:
    void prepare(int maxSamples);
    void reset() noexcept;
    void write(float x) noexcept;
    [[nodiscard]] float read(double delaySamples) const noexcept;
    [[nodiscard]] float readHermite(double delaySamples) const noexcept;
    [[nodiscard]] bool hasNonZero() const noexcept;
    [[nodiscard]] int capacity() const noexcept { return static_cast<int>(buf_.size()); }

private:
    std::vector<float> buf_;
    int w_ = 0;
};

// Per-channel drive color: crossfading SOFT / TAPE / HARD waveshaper (at 4x) plus
// one-pole 1 kHz +/-6 dB high-shelf tone (at 1x).
// Thread affinity: prepared on control thread; setParams/shape/processTone/reset on audio thread only.
class DriveColor {
public:
    void prepare(double sr) noexcept;
    void setParams(float type, float tone) noexcept;
    void reset() noexcept;
    [[nodiscard]] double shape(double x, double k, double norm) noexcept;
    [[nodiscard]] double processTone(double x) noexcept;
    [[nodiscard]] bool hasState() const noexcept { return std::abs(low_) > 1.0e-12; }

private:
    double fade_ = 0.0;
    double smooth_ = 0.0;
    double pole_ = 0.0;
    double low_ = 0.0;
    double tape_ = 0.0;
    double hard_ = 0.0;
    double tone_ = 0.0;
    double tapeTarget_ = 0.0;
    double hardTarget_ = 0.0;
    double toneTarget_ = 0.0;
};

// Freeverb damped comb filter (denormal-safe).
// Thread affinity: prepare() on control thread; process/reset on audio thread only.
struct FvComb {
    std::vector<float> buf;
    int idx = 0;
    float filt = 0.0f;
    float damp1 = 0.2f;
    float damp2 = 0.8f;
    float feedback = 0.84f;

    void prepare(int n);
    void reset() noexcept;
    [[nodiscard]] float process(float in) noexcept;
};

// Freeverb Schroeder allpass diffuser (denormal-safe).
// Thread affinity: prepare() on control thread; process/reset on audio thread only.
struct FvAllpass {
    std::vector<float> buf;
    int idx = 0;
    float feedback = 0.5f;

    void prepare(int n);
    void reset() noexcept;
    [[nodiscard]] float process(float in) noexcept;
};

// 4x HalfBandFir oversampled stereo waveshaper with DriveColor and latency-aligned dry path.
// Thread affinity: prepare() on control thread (allocates once); setParams/process/reset on audio thread only.
class FableDriveDsp {
public:
    void prepare(double sampleRate);
    void reset() noexcept;
    void setParams(bool on, float amt, float mix, float type, float tone) noexcept;
    void process(float* L, float* R, int n) noexcept;
    [[nodiscard]] int latencySamples() const noexcept { return kDriveLatency; }
    [[nodiscard]] bool hasPendingOutput() const noexcept;

private:
    void advanceCoefs(bool force) noexcept;
    [[nodiscard]] float driveChannel(HalfBandFir& u1, HalfBandFir& u2, HalfBandFir& d2,
                                     HalfBandFir& d1, double x, DriveColor& color) noexcept;

    double sr_ = 48000.0;
    ChunkRamp amtRamp_{};
    int coefSamples_ = 0;
    bool primed_ = false;
    bool forceCoefs_ = true;
    float pre_ = 1.0f;
    float k_ = 1.0f;
    float norm_ = 1.0f;
    Smooth wet_{};
    Smooth dry_{};
    HalfBandFir up1L_{};
    HalfBandFir up2L_{};
    HalfBandFir dn2L_{};
    HalfBandFir dn1L_{};
    HalfBandFir up1R_{};
    HalfBandFir up2R_{};
    HalfBandFir dn2R_{};
    HalfBandFir dn1R_{};
    DelayLine dryL_{};
    DelayLine dryR_{};
    DriveColor colorL_{};
    DriveColor colorR_{};
    PeakGuard guard_{};
    bool silent_ = false;
};

// Dual modulated-tap stereo chorus with Hermite interpolation.
// Thread affinity: prepare() on control thread (allocates once); setParams/process/reset on audio thread only.
class FableChorusDsp {
public:
    void prepare(double sampleRate);
    void reset() noexcept;
    void setParams(bool on, float rate, float depth, float mix) noexcept;
    void process(float* L, float* R, int n) noexcept;
    [[nodiscard]] int latencySamples() const noexcept { return 0; }
    [[nodiscard]] bool hasPendingOutput() const noexcept { return !gated_ && tailRemaining_ > 0; }

private:
    void advanceCoefs(bool force) noexcept;

    double sr_ = 48000.0;
    double phase_ = 0.0;
    ChunkRamp rateRamp_{};
    ChunkRamp depthRamp_{};
    int coefSamples_ = 0;
    bool primed_ = false;
    bool forceCoefs_ = true;
    float rate_ = 0.6f;
    float depth_ = 0.5f;
    Smooth wet_{};
    Smooth dry_{};
    DelayLine dl1_{};
    DelayLine dl2_{};
    PeakGuard guard_{};
    bool off_ = false;
    bool gated_ = false;
    int tailRemaining_ = 0;
};

// Stereo / ping-pong tape echo with tempo sync, wow/flutter drift, saturation,
// 45 Hz HP + tone LP damping, stereo width, and feedback PeakGuard.
// Thread affinity: prepare() on control thread (allocates once); setParams/process/reset on audio thread only.
class FableEchoDsp {
public:
    void prepare(double sampleRate);
    void reset() noexcept;
    void setParams(bool on, float timeSec, float fb, float mix, float toneHz, float sat,
                   float wow, float flutter, float width, float mode, bool sync, int div,
                   double tempoBpm) noexcept;
    void process(float* L, float* R, int n) noexcept;
    [[nodiscard]] int latencySamples() const noexcept { return 0; }
    [[nodiscard]] bool hasPendingOutput() const noexcept { return !gated_ && tailRemaining_ > 0; }
    [[nodiscard]] double currentDelaySec() const noexcept { return static_cast<double>(dlTime_.cur); }
    [[nodiscard]] double targetDelaySec() const noexcept { return static_cast<double>(dlTime_.target); }

private:
    double sr_ = 48000.0;
    Smooth dlTime_{};
    Smooth dlFb_{};
    Smooth dlWet_{};
    Smooth dlDry_{};
    Smooth dlSat_{};
    Smooth dlWow_{};
    Smooth dlFlutter_{};
    Smooth dlWidth_{};
    Smooth dlMode_{};
    DelayLine dlL_{};
    DelayLine dlR_{};
    Biquad dampL_{};
    Biquad dampR_{};
    Biquad hpL_{};
    Biquad hpR_{};
    PeakGuard feedbackGuard_{};
    PeakGuard guard_{};
    float tone_ = 4500.0f;
    float toneTarget_ = 4500.0f;
    bool toneDirty_ = true;
    int toneSamples_ = 0;
    double tapeClock_ = 0.0;
    std::array<double, 5> oscC_{{1.0, 1.0, 1.0, 1.0, 1.0}};
    std::array<double, 5> oscS_{{0.0, 0.0, 0.0, 0.0, 0.0}};
    std::array<double, 5> oscDc_{{1.0, 1.0, 1.0, 1.0, 1.0}};
    std::array<double, 5> oscDs_{{0.0, 0.0, 0.0, 0.0, 0.0}};
    double driftL_ = 0.0;
    double driftR_ = 0.0;
    bool initialized_ = false;
    bool off_ = false;
    bool gated_ = false;
    int tailRemaining_ = 0;

    void resetDriftOscillators() noexcept;
};

// Dual-algorithm stereo reverb: ROOM (Freeverb 8-comb/4-allpass) and PLATE (Dattorro PlateReverb).
// Thread affinity: prepare() on control thread (allocates once); setParams/process/reset on audio thread only.
class FableReverbDsp {
public:
    void prepare(double sampleRate);
    void reset() noexcept;
    void setParams(bool on, float size, float mix, int type, float damp) noexcept;
    void process(float* L, float* R, int n) noexcept;
    [[nodiscard]] int latencySamples() const noexcept { return 0; }
    [[nodiscard]] bool hasPendingOutput() const noexcept { return !gated_ && tailRemaining_ > 0; }

private:
    void resetRoomTank() noexcept;
    void resetPlateTank() noexcept;
    void resetTanks() noexcept;
    void advanceCoefs(bool force) noexcept;
    void processRoomSample(double inL, double inR, double& outL, double& outR) noexcept;
    void processPlateSample(double inL, double inR, double& outL, double& outR) noexcept;

    double sr_ = 48000.0;
    std::array<FvComb, 8> combL_{};
    std::array<FvComb, 8> combR_{};
    std::array<FvAllpass, 4> apL_{};
    std::array<FvAllpass, 4> apR_{};
    PlateReverb plate_{};
    ChunkRamp sizeRamp_{};
    ChunkRamp dampRamp_{};
    int coefSamples_ = 0;
    bool primed_ = false;
    bool forceCoefs_ = true;
    int type_ = 0;
    int prevType_ = 0;
    int typeXfLeft_ = 0;
    int typeFadeSamples_ = 240;
    Smooth wet_{};
    Smooth dry_{};
    PeakGuard guard_{};
    bool off_ = false;
    bool gated_ = false;
    int tailRemaining_ = 0;
};

}  // namespace nt::audio::effects::fable
