#pragma once
#include <cstdint>
#include <optional>
#include <string_view>

namespace nt::realtime {
// Offline host thread only. Immutable after preparation, with no resources or callbacks.
class OfflineClock {
public:
    struct Frame {
        double seconds;
        std::uint64_t completedQuanta;
    };
    // Positive integers, decimals (at most six places), or integer fractions.
    // Duration is bounded to 600 seconds and frame rate to 240 frames/second.
    static std::optional<OfflineClock> prepare(std::string_view duration,
        std::string_view fps, unsigned sampleRate) noexcept;
    std::uint64_t frameCount() const noexcept { return frames_; }
    std::uint64_t sampleCount() const noexcept { return samples_; }
    std::uint64_t quantumCount() const noexcept { return (samples_ + 127) / 128; }
    std::optional<Frame> frame(std::uint64_t index) const noexcept;
    // Final quantum is processed whole, but only this many samples are exported.
    unsigned exportedSamples(std::uint64_t quantum) const noexcept;
private:
    OfflineClock() = default;
    std::uint64_t fpsNumerator_ = 1;
    std::uint64_t fpsDenominator_ = 1;
    std::uint64_t frames_ = 0;
    std::uint64_t samples_ = 0;
    unsigned sampleRate_ = 0;
};
}
