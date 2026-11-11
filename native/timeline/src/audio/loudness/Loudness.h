// Ported from FilmCraft (https://github.com/storytold/filmcraft), crates/audio-dsp/src/loudness.rs, MIT. See licenses/FilmCraft-MIT.txt.
#pragma once

#include <array>
#include <cstdint>
#include <limits>
#include <span>
#include <vector>

namespace nt::audio {
namespace loudness_detail {
struct Coeffs {
    double b0, b1, b2, a1, a2;
    double magnitude(double frequency, double sampleRate) const noexcept;
};
Coeffs kPrefilter(double sampleRate) noexcept;
Coeffs kRlb(double sampleRate) noexcept;
}

class LoudnessMeter {
public:
    LoudnessMeter(double sampleRate, int channels);
    void reset() noexcept;
    void processPlanar(const float* const* channels, int frames) noexcept;
    // native-rules #5: raw const float* sample buffer crosses the module boundary
    void processInterleaved(const float* data, int frames) noexcept;
    double momentary() const noexcept;
    double shortTerm() const noexcept;
    double maxMomentary() const noexcept;
    double maxShortTerm() const noexcept;
    double integrated() const noexcept;
    double loudnessRange() const noexcept;
    double samplePeak() const noexcept;
    double truePeak() const noexcept;
    double truePeakDb() const noexcept;
    int channels() const noexcept;
    double sampleRate() const noexcept;
    void setChannelWeights(std::span<const double> weights);

private:
    friend class LiveLoudness;
    static constexpr int kTaps = 32;
    static constexpr double kNone = -std::numeric_limits<double>::infinity();
    struct Biquad {
        double s1 = 0, s2 = 0;
        double tick(const loudness_detail::Coeffs& c, double x) noexcept;
    };
    struct Channel {
        double weight = 1, energy = 0;
        Biquad pre, rlb;
        float samplePeak = 0, truePeak = 0;
        std::array<float, 2 * kTaps> history{};
        int position = 0;
    };
    struct Histogram {
        std::array<std::uint64_t, 9000> count{};
        std::array<double, 9000> energy{};
        void clear() noexcept;
        void add(double value) noexcept;
        double mean(int from) const noexcept;
        int relativeGate(double relative) const noexcept;
    };
    void feed(Channel& channel, float x) noexcept;
    void finishSubblock() noexcept;
    void clearWindows() noexcept;
    double window(int length) const noexcept;
    double sampleRate_;
    std::vector<Channel> channels_;
    loudness_detail::Coeffs pre_, rlb_;
    int factor_, subLength_, subPosition_ = 0, ringPosition_ = 0;
    std::uint64_t subblocksSeen_ = 0;
    std::array<double, 30> ring_{};
    std::vector<float> coefficients_;
    Histogram integratedHist_, rangeHist_;
    double momentary_ = kNone, shortTerm_ = kNone, maxMomentary_ = kNone, maxShortTerm_ = kNone;
};
double normalizeGainDb(double measuredLufs, double targetLufs);
}
