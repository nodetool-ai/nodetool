// Ported from FilmCraft (https://github.com/storytold/filmcraft), crates/audio-dsp/src/loudness.rs, MIT. See licenses/FilmCraft-MIT.txt.
// Ported from FilmCraft (https://github.com/storytold/filmcraft), crates/audio-dsp/src/oversample.rs, MIT. See licenses/FilmCraft-MIT.txt.
// Ported from FilmCraft (https://github.com/storytold/filmcraft), crates/audio-dsp/src/biquad.rs, MIT. See licenses/FilmCraft-MIT.txt.
#include "audio/loudness/Loudness.h"

#include <algorithm>
#include <cmath>
#include <numbers>
#include <stdexcept>

namespace nt::audio {
namespace {
constexpr double pi = std::numbers::pi;
double energyToLufs(double energy) noexcept {
    return energy <= 0 ? -std::numeric_limits<double>::infinity() : -0.691 + 10 * std::log10(energy);
}
int binOf(double loudness) noexcept {
    return static_cast<int>(std::clamp(std::floor((loudness + 70) / 0.01), 0., 8999.));
}
double binCentre(int bin) noexcept {
    return -70 + (bin + 0.5) * 0.01;
}
double flush(double x) noexcept {
    return std::isfinite(x) && std::abs(x) >= 1e-30 ? x : 0;
}
double checkedRate(double rate) {
    if (!std::isfinite(rate) || rate < 1 || rate > std::numeric_limits<int>::max()) {
        throw std::invalid_argument("Loudness sample rate must be finite and positive");
    }
    return rate;
}
double besselI0(double x) noexcept {
    double sum = 1, term = 1;
    const double q = x * x / 4;
    for (int k = 1; k < 50; ++k) {
        term *= q / (k * k);
        sum += term;
        if (term < sum * 1e-17) {
            break;
        }
    }
    return sum;
}
}

namespace loudness_detail {
Coeffs kPrefilter(double sampleRate) noexcept {
    const double k = std::tan(pi * 1681.974450955533 / sampleRate);
    const double vh = std::pow(10., 3.999843853973347 / 20), vb = std::pow(vh, 0.4996667741545416);
    const double q = 0.7071752369554196, a0 = 1 + k / q + k * k;
    return {(vh + vb * k / q + k * k) / a0, 2 * (k * k - vh) / a0, (vh - vb * k / q + k * k) / a0, 2 * (k * k - 1) / a0,
            (1 - k / q + k * k) / a0};
}
Coeffs kRlb(double sampleRate) noexcept {
    const double k = std::tan(pi * 38.13547087602444 / sampleRate), q = 0.5003270373238773;
    const double a0 = 1 + k / q + k * k;
    return {1, -2, 1, 2 * (k * k - 1) / a0, (1 - k / q + k * k) / a0};
}
double Coeffs::magnitude(double frequency, double sampleRate) const noexcept {
    const double w = 2 * pi * frequency / sampleRate;
    const double c1 = std::cos(w), s1 = std::sin(w), c2 = std::cos(2 * w), s2 = std::sin(2 * w);
    const double nr = b0 + b1 * c1 + b2 * c2, ni = -(b1 * s1 + b2 * s2);
    const double dr = 1 + a1 * c1 + a2 * c2, di = -(a1 * s1 + a2 * s2);
    return std::sqrt((nr * nr + ni * ni) / (dr * dr + di * di));
}
} // namespace loudness_detail

double LoudnessMeter::Biquad::tick(const loudness_detail::Coeffs& c, double x) noexcept {
    const double y = c.b0 * x + s1;
    s1 = flush(c.b1 * x - c.a1 * y + s2);
    s2 = flush(c.b2 * x - c.a2 * y);
    return y;
}

void LoudnessMeter::Histogram::clear() noexcept {
    count.fill(0);
    energy.fill(0);
}
void LoudnessMeter::Histogram::add(double value) noexcept {
    const double loudness = energyToLufs(value);
    if (loudness >= -70) {
        const int bin = binOf(loudness);
        ++count[bin];
        energy[bin] += value;
    }
}
double LoudnessMeter::Histogram::mean(int from) const noexcept {
    double sum = 0;
    std::uint64_t n = 0;
    for (int i = from; i < 9000; ++i) {
        sum += energy[i];
        n += count[i];
    }
    return n ? sum / n : 0;
}
int LoudnessMeter::Histogram::relativeGate(double relative) const noexcept {
    const double value = mean(0);
    return value > 0 ? binOf(energyToLufs(value) + relative) : -1;
}

LoudnessMeter::LoudnessMeter(double sampleRate, int channels)
    : sampleRate_(checkedRate(sampleRate)), channels_(static_cast<std::size_t>(std::max(1, channels))),
      pre_(loudness_detail::kPrefilter(sampleRate_)), rlb_(loudness_detail::kRlb(sampleRate_)), factor_(1),
      subLength_(std::max(1, static_cast<int>(std::round(sampleRate_ * 0.1)))) {
    // Also cover rates below 44.1 kHz while retaining FilmCraft's power-of-two phases.
    while (sampleRate_ * factor_ < 176400) {
        factor_ *= 2;
    }
    if (channels == 5 || channels == 6 || channels == 8) {
        for (int ch = channels == 5 ? 3 : 4; ch < channels; ++ch) {
            channels_[ch].weight = 1.41;
        }
        if (channels != 5) {
            channels_[3].weight = 0;
        }
    }
    const int length = factor_ * kTaps;
    coefficients_.resize(length);
    std::vector<double> prototype(length);
    // Longer, sample-aligned phases retain intersample peaks in wideband signals
    // and at 2x oversampling, where FilmCraft's half-phase offset under-reads.
    const double centre = length / 2., i0b = besselI0(8);
    for (int m = 0; m < length; ++m) {
        const double t = (m - centre) / factor_, r = (m - centre) / (centre + 1);
        const double sinc = std::abs(t) < 1e-12 ? 1 : std::sin(pi * t) / (pi * t);
        prototype[m] = sinc * besselI0(8 * std::sqrt(std::max(0., 1 - r * r))) / i0b;
    }
    for (int p = 0; p < factor_; ++p) {
        double sum = 0;
        for (int j = 0; j < kTaps; ++j) {
            sum += prototype[p + factor_ * j];
        }
        for (int j = 0; j < kTaps; ++j) {
            coefficients_[p * kTaps + j] = static_cast<float>(prototype[p + factor_ * j] / sum);
        }
    }
}

void LoudnessMeter::setChannelWeights(std::span<const double> weights) {
    for (std::size_t i = 0; i < channels_.size(); ++i) {
        channels_[i].weight = i < weights.size() ? weights[i] : 1;
    }
}

void LoudnessMeter::clearWindows() noexcept {
    for (auto& channel : channels_) {
        channel.pre = {};
        channel.rlb = {};
        channel.energy = 0;
        channel.history.fill(0);
        channel.position = 0;
    }
    subPosition_ = ringPosition_ = 0;
    subblocksSeen_ = 0;
    ring_.fill(0);
    momentary_ = shortTerm_ = kNone;
}
void LoudnessMeter::reset() noexcept {
    clearWindows();
    integratedHist_.clear();
    rangeHist_.clear();
    for (auto& channel : channels_) {
        channel.samplePeak = channel.truePeak = 0;
    }
    maxMomentary_ = maxShortTerm_ = kNone;
}

void LoudnessMeter::feed(Channel& channel, float x) noexcept {
    if (!std::isfinite(x)) {
        x = 0;
    }
    const double y = channel.rlb.tick(rlb_, channel.pre.tick(pre_, x));
    channel.energy += y * y;
    const float absolute = std::abs(x);
    channel.samplePeak = std::max(channel.samplePeak, absolute);
    float peak = absolute;
    if (factor_ != 1) {
        channel.position = channel.position == 0 ? kTaps - 1 : channel.position - 1;
        channel.history[channel.position] = channel.history[channel.position + kTaps] = x;
        const float* history = channel.history.data() + channel.position;
        for (int p = 0; p < factor_; ++p) {
            const float* c = coefficients_.data() + p * kTaps;
            std::array<float, 8> acc{};
            for (int base = 0; base < kTaps; base += 8) {
                for (int j = 0; j < 8; ++j) {
                    acc[j] += c[base + j] * history[base + j];
                }
            }
            const float value = (acc[0] + acc[4]) + (acc[1] + acc[5]) + (acc[2] + acc[6]) + (acc[3] + acc[7]);
            peak = std::max(peak, std::abs(value));
        }
    }
    channel.truePeak = std::max(channel.truePeak, peak);
}

void LoudnessMeter::processPlanar(const float* const* channels, int frames) noexcept {
    int position = 0;
    while (position < frames) {
        const int take = std::min(frames - position, subLength_ - subPosition_);
        for (std::size_t ch = 0; ch < channels_.size(); ++ch) {
            const float* data = channels ? channels[ch] : nullptr;
            for (int i = position; i < position + take; ++i) {
                feed(channels_[ch], data ? data[i] : 0);
            }
        }
        position += take;
        subPosition_ += take;
        if (subPosition_ == subLength_) {
            finishSubblock();
        }
    }
}
void LoudnessMeter::processInterleaved(const float* data, int frames) noexcept {
    int position = 0;
    while (position < frames) {
        const int take = std::min(frames - position, subLength_ - subPosition_);
        for (int i = position; i < position + take; ++i) {
            for (std::size_t ch = 0; ch < channels_.size(); ++ch) {
                feed(channels_[ch], data[static_cast<std::size_t>(i) * channels_.size() + ch]);
            }
        }
        position += take;
        subPosition_ += take;
        if (subPosition_ == subLength_) {
            finishSubblock();
        }
    }
}

double LoudnessMeter::window(int length) const noexcept {
    double sum = 0;
    for (int i = 0; i < length; ++i) {
        sum += ring_[(ringPosition_ + 30 - 1 - i) % 30];
    }
    return sum / (static_cast<double>(length) * subLength_);
}
void LoudnessMeter::finishSubblock() noexcept {
    double energy = 0;
    for (auto& channel : channels_) {
        energy += channel.weight * channel.energy;
        channel.energy = 0;
    }
    ring_[ringPosition_] = energy;
    ringPosition_ = (ringPosition_ + 1) % 30;
    subPosition_ = 0;
    ++subblocksSeen_;
    const double em = window(4), es = window(30);
    momentary_ = energyToLufs(em);
    shortTerm_ = energyToLufs(es);
    if (subblocksSeen_ >= 4) {
        integratedHist_.add(em);
        maxMomentary_ = std::max(maxMomentary_, momentary_);
    }
    if (subblocksSeen_ >= 30) {
        rangeHist_.add(es);
        maxShortTerm_ = std::max(maxShortTerm_, shortTerm_);
    }
}

double LoudnessMeter::momentary() const noexcept {
    return momentary_;
}
double LoudnessMeter::shortTerm() const noexcept {
    return shortTerm_;
}
double LoudnessMeter::maxMomentary() const noexcept {
    return maxMomentary_;
}
double LoudnessMeter::maxShortTerm() const noexcept {
    return maxShortTerm_;
}
double LoudnessMeter::integrated() const noexcept {
    const int start = integratedHist_.relativeGate(-10);
    return start < 0 ? kNone : energyToLufs(integratedHist_.mean(start));
}
double LoudnessMeter::loudnessRange() const noexcept {
    const int start = rangeHist_.relativeGate(-20);
    if (start < 0) {
        return 0;
    }
    std::uint64_t n = 0;
    for (int i = start; i < 9000; ++i) {
        n += rangeHist_.count[i];
    }
    if (!n) {
        return 0;
    }
    const auto percentile = [&](double p) noexcept {
        const auto rank = std::min(static_cast<std::uint64_t>(std::round(p * (n - 1))), n - 1);
        std::uint64_t count = 0;
        for (int i = start; i < 9000; ++i) {
            count += rangeHist_.count[i];
            if (count > rank) {
                return binCentre(i);
            }
        }
        return binCentre(8999);
    };
    return std::max(0., percentile(0.95) - percentile(0.10));
}
double LoudnessMeter::samplePeak() const noexcept {
    float peak = 0;
    for (const auto& channel : channels_) {
        peak = std::max(peak, channel.samplePeak);
    }
    return peak;
}
double LoudnessMeter::truePeak() const noexcept {
    float peak = 0;
    for (const auto& channel : channels_) {
        peak = std::max(peak, channel.truePeak);
    }
    return peak;
}
double LoudnessMeter::truePeakDb() const noexcept {
    return 20 * std::log10(truePeak());
}
int LoudnessMeter::channels() const noexcept {
    return static_cast<int>(channels_.size());
}
double LoudnessMeter::sampleRate() const noexcept {
    return sampleRate_;
}
double normalizeGainDb(double measuredLufs, double targetLufs) {
    return std::isfinite(measuredLufs) && std::isfinite(targetLufs) ? targetLufs - measuredLufs : 0;
}
} // namespace nt::audio
