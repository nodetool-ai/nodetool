#pragma once

#include "audio/loudness/Loudness.h"
#include <atomic>
#include <cstdint>
#include <memory>

namespace nt::audio {
struct LoudnessReading {
    double momentary, shortTerm, integrated, maxMomentary, maxShortTerm, truePeakDb, loudnessRange;
    std::uint64_t blocks;
};
static_assert(std::atomic<double>::is_always_lock_free);
static_assert(std::atomic<std::uint64_t>::is_always_lock_free);
// native-rules #9: written on the audio thread and read on the UI thread, no affinity comment
class LoudnessReadout {
public:
    LoudnessReading read() const noexcept;
    void requestReset() noexcept;

private:
    friend class LiveLoudness;
    static constexpr double kNone = -std::numeric_limits<double>::infinity();
    void clear() noexcept;
    std::atomic<double> momentary_{kNone}, shortTerm_{kNone}, integrated_{kNone}, maxMomentary_{kNone},
        maxShortTerm_{kNone}, truePeakDb_{kNone}, loudnessRange_{kNone};
    std::atomic<std::uint64_t> blocks_{0}, resets_{0};
};
// native-rules #9: driven by the audio callback and read from other threads, no affinity comment
class LiveLoudness {
public:
    explicit LiveLoudness(LoudnessReadout& out);
    void prepare(double sampleRate);
    // native-rules #5: raw const float* sample buffer crosses the module boundary
    void process(const float* stereo, int frames) noexcept;
    void discontinuity() noexcept;

private:
    void publish() noexcept;
    LoudnessReadout& out_;
    std::unique_ptr<LoudnessMeter> meter_;
    std::uint64_t appliedReset_ = 0, blocks_ = 0;
    int publishFrames_ = 1, framesSincePublish_ = 0;
};
}
