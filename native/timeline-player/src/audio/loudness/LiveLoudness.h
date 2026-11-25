#pragma once

#include "audio/loudness/Loudness.h"
#include <atomic>
#include <cstdint>
#include <memory>

namespace nt::audio {
struct LoudnessReading {
    double momentary, shortTerm, integrated, maxMomentary, maxShortTerm, truePeakDb, loudnessRange;
    std::uint64_t blocks;
    bool clipped = false;
};
static_assert(std::atomic<double>::is_always_lock_free);
static_assert(std::atomic<std::uint64_t>::is_always_lock_free);
static_assert(std::atomic<bool>::is_always_lock_free);
// Thread-safe atomic handoff: written on the audio callback thread (and cleared on reset),
// read on the UI thread without locks.
class LoudnessReadout {
public:
    LoudnessReading read() const noexcept;
    void requestReset() noexcept;
    void requestClipReset() noexcept;

private:
    friend class LiveLoudness;
    static constexpr double kNone = -std::numeric_limits<double>::infinity();
    void clear() noexcept;
    std::atomic<double> momentary_{kNone}, shortTerm_{kNone}, integrated_{kNone}, maxMomentary_{kNone},
        maxShortTerm_{kNone}, truePeakDb_{kNone}, loudnessRange_{kNone};
    std::atomic<std::uint64_t> blocks_{0}, resets_{0}, clipResets_{0};
    std::atomic<bool> clipped_{false};
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
    std::uint64_t appliedReset_ = 0, appliedClipReset_ = 0, blocks_ = 0;
    int publishFrames_ = 1, framesSincePublish_ = 0;
};
}
