#pragma once

// Stereo-linked true-peak look-ahead master limiter (ITU-R BS.1770 4x polyphase
// FIR true-peak detector + look-ahead audio delay + smooth attack/release gain).
//
// Thread affinity:
// - prepare(): control or offline-render setup thread (allocates buffers once).
// - process() and reset(): audio callback or offline render thread only;
//   zero heap allocations, zero locks, zero logging.

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>
#include <vector>

namespace nt::audio {

class MasterLimiter final {
public:
    static constexpr double kDefaultCeilingDb = -1.0;
    // Slight margin (-1.02 dBTP) keeps ITU-R BS.1770 4x true peak at or below -1.0 dBTP
    // even under rapid gain modulation of full-scale inter-sample transients.
    static constexpr double kEffectiveCeilingDb = -1.02;
    static constexpr int kFirTaps = 32;
    static constexpr int kFirHalf = kFirTaps / 2;
    static constexpr double kAttackSec = 0.0015;  // 1.5 ms look-ahead attack
    static constexpr double kReleaseSec = 0.060;  // 60 ms smooth release
    static constexpr int kHoldPadFrames = 8;
    // Live toggle delay-slew rate (frames of delay change per audio frame) and gain blend ramp.
    // Slewing one interpolated tap avoids phase cancellation from summing dry and delayed audio.
    static constexpr double kDelaySlewPerFrame = 1.0 / 12.0;
    static constexpr double kLiveMixRampSec = 0.005;

    MasterLimiter() = default;

    // Total look-ahead latency in frames at `sampleRate`.
    [[nodiscard]] static int latencyFramesForRate(double sampleRate) noexcept;

    // Control thread: sizes all internal ring buffers and FIR coefficients for `sampleRate`.
    void prepare(double sampleRate, double ceilingDb = kEffectiveCeilingDb);

    // Audio thread: clears delay lines and resets envelope to unity (no allocation).
    void reset() noexcept;

    // Audio thread: limits interleaved stereo samples in-place (no allocation, no locks).
    void process(std::span<float> stereo) noexcept;

    // Audio thread: live-toggle limiting with phase-continuous delay slewing between 0 (bypassed)
    // and `audioDelay_` (active), keeping detector state warm while bypassed (no allocation, no locks).
    void processLive(std::span<float> stereo, bool enabled, bool hardReset) noexcept;

    // Audio thread: advances internal delay line and peak detector without modifying `stereo`,
    // keeping state warm while bypassed.
    void observe(std::span<const float> stereo) noexcept;

    // Audio thread: schedules a release-envelope reset once audio currently in the look-ahead
    // delay line has exited, preventing gain reduction from bleeding across a loop boundary.
    void markLoopBoundary() noexcept;

    [[nodiscard]] int latencySamples() const noexcept { return audioDelay_; }
    [[nodiscard]] double sampleRate() const noexcept { return sampleRate_; }

private:
    struct ChannelFir {
        std::array<float, 2 * kFirTaps> history{};
        int position = 0;
    };

    float detectTruePeak(ChannelFir& ch, float x) noexcept;
    float advanceDetector(float inL, float inR) noexcept;
    [[nodiscard]] float alignedAttackGain(int delayInt, float fullGain) const noexcept;
    [[nodiscard]] float detectCausalPeak(int delayInt) const noexcept;
    void readFractionalDelay(double delayFrames, float& outL, float& outR) const noexcept;
    void step(float* outStereo, const float* inStereo, std::size_t frames) noexcept;

    double sampleRate_ = 0.0;
    double ceiling_ = 0.8892011;
    double releaseCoeff_ = 0.0;
    int factor_ = 4;
    int firDelay_ = kFirHalf;
    int attackFrames_ = 72;
    int windowLen_ = 80;
    int audioDelay_ = 88;
    int delayCap_ = 90;
    double liveDelay_ = 88.0;
    double liveMix_ = 1.0;
    double mixStep_ = 1.0 / 240.0;

    std::vector<float> firCoeffs_;
    std::array<ChannelFir, 2> fir_{};

    // Circular stereo audio delay buffer of length `delayCap_` (`audioDelay_ + 2`) frames.
    std::vector<float> delay_;
    int delayPos_ = 0;

    // Fixed-capacity circular monotonic max-deque for O(1) sliding window true peak.
    std::vector<std::uint64_t> dequeIdx_;
    std::vector<float> dequeVal_;
    std::size_t dequeMask_ = 0;
    std::size_t dequeHead_ = 0;
    std::size_t dequeTail_ = 0;
    std::uint64_t sampleIndex_ = 0;

    // Scheduled loop-boundary release reset (audio thread only).
    bool boundaryActive_ = false;
    std::uint64_t boundaryFirIdx_ = 0;
    std::uint64_t boundaryExitIdx_ = 0;

    // Release envelope + boxcar attack smoother (length `attackFrames_`).
    double envGain_ = 1.0;
    double transEnvGain_ = 1.0;
    std::vector<double> boxcar_;
    int boxcarPos_ = 0;
    double boxcarSum_ = 0.0;
    int boxcarNonUnity_ = 0;
};

}  // namespace nt::audio
