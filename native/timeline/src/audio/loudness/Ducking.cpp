// Ported from FilmCraft (https://github.com/storytold/filmcraft), crates/audio-dsp/src/ducking.rs, MIT. See licenses/FilmCraft-MIT.txt.
// Ported from FilmCraft (https://github.com/storytold/filmcraft), crates/engine/src/essential_sound.rs, MIT. See licenses/FilmCraft-MIT.txt.
#include "audio/loudness/Ducking.h"

#include <algorithm>
#include <cmath>

namespace nt::audio::ducking {
namespace {
float powerDb(double power) {
    return static_cast<float>(std::max(static_cast<double>(kFloorDb), 10 * std::log10(std::max(1e-12, power))));
}
}

EnvelopeBuilder::EnvelopeBuilder(double sampleRate, double hopS, int windowHops)
    : hopS_(hopS), hopFrames_(std::max(1, static_cast<int>(std::round(sampleRate * hopS)))),
      windowHops_(std::max(1, windowHops)) {}

void EnvelopeBuilder::feed(const float* stereo, int frames) {
    for (int i = 0; i < frames; ++i) {
        const double l = stereo[2 * i], r = stereo[2 * i + 1];
        sum_ += 0.5 * (l * l + r * r);
        if (++position_ == hopFrames_) {
            power_.push_back(sum_ / position_);
            sum_ = 0;
            position_ = 0;
        }
    }
}

std::vector<float> EnvelopeBuilder::finish() {
    if (position_ > 0) {
        power_.push_back(sum_ / position_);
    }
    std::vector<float> out;
    out.reserve(power_.size());
    const auto half = static_cast<std::size_t>(windowHops_ / 2);
    for (std::size_t k = 0; k < power_.size(); ++k) {
        const auto lo = k < half ? 0 : k - half, hi = std::min(k + half + 1, power_.size());
        double sum = 0;
        for (auto j = lo; j < hi; ++j) {
            sum += power_[j];
        }
        out.push_back(powerDb(sum / (hi - lo)));
    }
    power_.clear();
    sum_ = 0;
    position_ = 0;
    return out;
}

double EnvelopeBuilder::hopS() const {
    return hopS_;
}

std::vector<float> envelopeDb(std::span<const std::span<const float>> channels, double sampleRate, double hopS,
                              double windowS) {
    if (channels.empty()) {
        return {};
    }
    auto length = channels.front().size();
    for (const auto channel : channels) {
        length = std::min(length, channel.size());
    }
    if (!length) {
        return {};
    }
    const auto hop = std::max(std::size_t{1}, static_cast<std::size_t>(std::max(0., std::round(hopS * sampleRate))));
    const auto half =
        std::max(std::size_t{1}, static_cast<std::size_t>(std::max(0., std::round(windowS * sampleRate / 2))));
    std::vector<double> prefix(length + 1, 0);
    for (std::size_t i = 0; i < length; ++i) {
        double power = 0;
        for (const auto channel : channels) {
            power += static_cast<double>(channel[i]) * channel[i];
        }
        prefix[i + 1] = prefix[i] + power / channels.size();
    }
    std::vector<float> out;
    out.reserve(1 + (length - 1) / hop);
    for (std::size_t centre = 0; centre < length; centre += hop) {
        const auto lo = centre < half ? 0 : centre - half, hi = std::min(centre + half, length);
        out.push_back(powerDb(std::max(0., prefix[hi] - prefix[lo]) / std::max(std::size_t{1}, hi - lo)));
    }
    return out;
}

std::vector<Region> activity(std::span<const float> envDb, double hopS, double thresholdDb, double minOnS,
                             double bridgeS) {
    const double hop = std::round(hopS * 1e6) / 1e6;
    std::vector<Region> merged;
    std::size_t start = 0;
    bool on = false;
    const auto close = [&](std::size_t end) {
        const Region region{start * hop, end * hop};
        if (!merged.empty() && region.startS - merged.back().endS < bridgeS - 1e-9) {
            merged.back().endS = region.endS;
        } else {
            merged.push_back(region);
        }
    };
    for (std::size_t k = 0; k < envDb.size(); ++k) {
        if (envDb[k] > thresholdDb && !on) {
            start = k;
            on = true;
        } else if (!(envDb[k] > thresholdDb) && on) {
            close(k);
            on = false;
        }
    }
    if (on) {
        close(envDb.size());
    }
    std::erase_if(merged, [minOnS](Region r) { return r.endS - r.startS < minOnS - 1e-9; });
    return merged;
}

double sensitivityThresholdDb(double sensitivity) {
    return -20 - 4 * std::clamp(sensitivity, 0., 10.);
}

std::vector<Keyframe> duckKeyframes(std::span<const Region> regions, double clipStartS, double clipEndS, double baseDb,
                                    double reduceDb, double fadeS) {
    const double fade = std::max(fadeS, 1e-3), ducked = baseDb - std::abs(reduceDb);
    std::vector<Region> sorted;
    for (const auto r : regions) {
        if (r.endS > r.startS && r.endS > clipStartS && r.startS < clipEndS) {
            sorted.push_back(r);
        }
    }
    std::sort(sorted.begin(), sorted.end(), [](Region a, Region b) { return a.startS < b.startS; });
    std::vector<Region> groups;
    for (const auto r : sorted) {
        if (!groups.empty() && r.startS - fade <= groups.back().endS + fade) {
            groups.back().endS = std::max(groups.back().endS, r.endS);
        } else {
            groups.push_back(r);
        }
    }
    std::vector<Keyframe> out;
    const auto push = [&](double time, double value) {
        if (time < clipStartS || time > clipEndS) {
            return;
        }
        if (!out.empty() && time <= out.back().timeS + 1e-9) {
            out.back().valueDb = value;
        } else {
            out.push_back({time, value});
        }
    };
    for (const auto [a, b] : groups) {
        if (a - fade >= clipStartS) {
            push(a - fade, baseDb);
        } else {
            push(clipStartS, baseDb + (ducked - baseDb) * std::clamp((clipStartS - (a - fade)) / fade, 0., 1.));
        }
        push(std::max(a, clipStartS), ducked);
        if (b < clipEndS) {
            push(b, ducked);
            if (b + fade <= clipEndS) {
                push(b + fade, baseDb);
            } else {
                push(clipEndS, ducked + (baseDb - ducked) * std::clamp((clipEndS - b) / fade, 0., 1.));
            }
        } else {
            push(clipEndS, ducked);
        }
    }
    return out;
}
} // namespace nt::audio::ducking
