#pragma once

// WSOLA keeps pitch by construction, without discarding the upper spectrum
// or imposing a 12-semitone limit, including at 8x. Stereo shares one offset.
// Grains use complementary sine-squared windows with 50% overlap: 40 ms at
// <= 1x, shortened above 1x to keep their timeline footprint within 40 ms.
// Search is +/- 10 ms (5 ms above 1x), using 64 mono correlation samples.
// Integer candidate offsets preserve even near-Nyquist tones. Grain centres
// follow absolute output hops, not render-call boundaries. Only the bounded
// search and input extension run on grain boundaries. All storage is allocated
// in the constructor. Discontinuous output starts a new overlap with a 5 ms fade.

#include <cmath>
#include <cstdint>
#include <vector>

namespace nt::audio {
inline constexpr double kShuttleMinRate = 0.1;
inline constexpr double kShuttleMaxRate = 8.0;
// Finite, supported and different from 1 by more than 1e-9.
inline bool shuttleKeepsPitch(double rate) noexcept {
    return std::isfinite(rate) && rate >= kShuttleMinRate && rate <= kShuttleMaxRate && std::abs(rate - 1) > 1e-9;
}
inline constexpr int kShuttleMaxRequestFrames = 4096;

class ShuttleSource {
public:
    virtual ~ShuttleSource() = default;
    // Overwrites interleaved stereo with the 1x mix. Requests never precede
    // the anchor, never decrease, and contain at most kShuttleMaxRequestFrames.
    // native-rules #5: raw float* sample buffer crosses the module boundary
    virtual void mix(double timelineMs, int frames, float* out) = 0;
};

class ShuttleStretcher {
public:
    explicit ShuttleStretcher(double sampleRate);
    void begin(double rate, double anchorMs) noexcept;
    // native-rules #5: raw float* sample buffer crosses the module boundary
    void render(ShuttleSource& source, std::int64_t outFrame, int frames, float* out) noexcept;
private:
    void grain(ShuttleSource& source, std::int64_t centre, bool match) noexcept;
    void input(ShuttleSource& source, std::int64_t first, std::int64_t end) noexcept;
    float sample(std::int64_t frame, int channel) const noexcept;
    double m_sampleRate;
    double m_rate = 1;
    double m_anchorMs = 0;
    int m_hop = 1;
    int m_search = 1;
    int m_fade = 0;
    int m_fadeLength = 1;
    std::int64_t m_next = -1;
    std::int64_t m_centre = -1;
    std::int64_t m_inputFirst = 0;
    std::int64_t m_inputEnd = 0;
    std::vector<float> m_input;
    std::vector<float> m_mono;
    std::vector<float> m_previous;
    std::vector<float> m_grain;
    std::vector<float> m_window;
};
}  // namespace nt::audio
