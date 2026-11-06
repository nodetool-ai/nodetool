#pragma once
#include <array>
#include <span>

namespace nt::audio::effects {
// 2x band-limited interpolation and decimation. The finite kernels match
// rubato's 128-frame BlackmanHarris2 FFT resampler used by the oracle.
// Streaming FIR evaluation preserves those kernels for arbitrary block sizes.
class Oversampler {
    std::array<float, 512> up_{}, down_{};
    std::array<std::array<float, 256>, 2> input_{};
    std::array<std::array<float, 512>, 2> shaped_{};
    std::size_t cursor_ = 0;
public:
    void prepare();
    void reset() noexcept;
    void tick(std::span<float, 2> stereo, std::span<const float, 4096> curve, float gain) noexcept;
};
}
