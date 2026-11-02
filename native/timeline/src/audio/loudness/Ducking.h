// Ported from FilmCraft (https://github.com/storytold/filmcraft), crates/audio-dsp/src/ducking.rs, MIT. See licenses/FilmCraft-MIT.txt.
#pragma once

#include <span>
#include <vector>

namespace nt::audio::ducking {
inline constexpr float kFloorDb = -120.f;
struct Region {
    double startS = 0, endS = 0;
};
struct Keyframe {
    double timeS = 0, valueDb = 0;
};
class EnvelopeBuilder {
public:
    EnvelopeBuilder(double sampleRate, double hopS = 0.01, int windowHops = 5);
    void feed(const float* stereo, int frames);
    std::vector<float> finish();
    double hopS() const;

private:
    double hopS_;
    int hopFrames_, windowHops_, position_ = 0;
    double sum_ = 0;
    std::vector<double> power_;
};
std::vector<float> envelopeDb(std::span<const std::span<const float>> channels, double sampleRate, double hopS,
                              double windowS);
std::vector<Region> activity(std::span<const float> envDb, double hopS, double thresholdDb, double minOnS,
                             double bridgeS);
double sensitivityThresholdDb(double sensitivity);
std::vector<Keyframe> duckKeyframes(std::span<const Region> regions, double clipStartS, double clipEndS, double baseDb,
                                    double reduceDb, double fadeS);
inline constexpr double kHopS = 0.01, kMinOnS = 0.1, kBridgeS = 0.25;
}
