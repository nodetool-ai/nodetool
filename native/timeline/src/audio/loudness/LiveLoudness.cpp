#include "audio/loudness/LiveLoudness.h"

#include <algorithm>
#include <cmath>

namespace nt::audio {
LoudnessReading LoudnessReadout::read() const noexcept {
    return {momentary_.load(std::memory_order_relaxed),     shortTerm_.load(std::memory_order_relaxed),
            integrated_.load(std::memory_order_relaxed),    maxMomentary_.load(std::memory_order_relaxed),
            maxShortTerm_.load(std::memory_order_relaxed),  truePeakDb_.load(std::memory_order_relaxed),
            loudnessRange_.load(std::memory_order_relaxed), blocks_.load(std::memory_order_relaxed)};
}

void LoudnessReadout::requestReset() noexcept {
    resets_.fetch_add(1, std::memory_order_relaxed);
    // The audio thread applies the reset at its next block, but it runs only while playing. Clear the readings
    // here too, so that Reset works when paused. A block already in flight does not publish over this: see
    // LiveLoudness::publish.
    clear();
}

void LoudnessReadout::clear() noexcept {
    momentary_.store(kNone, std::memory_order_relaxed);
    shortTerm_.store(kNone, std::memory_order_relaxed);
    integrated_.store(kNone, std::memory_order_relaxed);
    maxMomentary_.store(kNone, std::memory_order_relaxed);
    maxShortTerm_.store(kNone, std::memory_order_relaxed);
    truePeakDb_.store(kNone, std::memory_order_relaxed);
    loudnessRange_.store(kNone, std::memory_order_relaxed);
}

LiveLoudness::LiveLoudness(LoudnessReadout& out) : out_(out) {}

void LiveLoudness::prepare(double sampleRate) {
    meter_ = std::make_unique<LoudnessMeter>(sampleRate, 2);
    publishFrames_ = std::max(1, static_cast<int>(std::round(sampleRate * 0.1)));
    framesSincePublish_ = 0;
    appliedReset_ = out_.resets_.load(std::memory_order_relaxed);
    publish();
}

void LiveLoudness::process(const float* stereo, int frames) noexcept {
    if (!meter_) {
        return;
    }
    const auto reset = out_.resets_.load(std::memory_order_relaxed);
    if (reset != appliedReset_) {
        meter_->reset();
        framesSincePublish_ = 0;
        appliedReset_ = reset;
    }
    ++blocks_;
    int position = 0;
    while (position < frames) {
        const int take = std::min(frames - position, publishFrames_ - framesSincePublish_);
        meter_->processInterleaved(stereo + 2 * position, take);
        position += take;
        framesSincePublish_ += take;
        if (framesSincePublish_ == publishFrames_) {
            framesSincePublish_ = 0;
            publish();
        }
    }
    if (frames <= 0 || framesSincePublish_ != 0) {
        publish();
    }
}

void LiveLoudness::discontinuity() noexcept {
    if (meter_) {
        meter_->clearWindows();
        framesSincePublish_ = 0;
        publish();
    }
}

void LiveLoudness::publish() noexcept {
    // A reset leaves the block count alone, so a pending one must not hold it back.
    out_.blocks_.store(blocks_, std::memory_order_relaxed);
    // A reset asked for and not yet applied: these readings are the ones it clears.
    if (out_.resets_.load(std::memory_order_relaxed) != appliedReset_) {
        return;
    }
    out_.momentary_.store(meter_->momentary(), std::memory_order_relaxed);
    out_.shortTerm_.store(meter_->shortTerm(), std::memory_order_relaxed);
    out_.integrated_.store(meter_->integrated(), std::memory_order_relaxed);
    out_.maxMomentary_.store(meter_->maxMomentary(), std::memory_order_relaxed);
    out_.maxShortTerm_.store(meter_->maxShortTerm(), std::memory_order_relaxed);
    out_.truePeakDb_.store(meter_->truePeakDb(), std::memory_order_relaxed);
    out_.loudnessRange_.store(meter_->loudnessRange(), std::memory_order_relaxed);
    // The request comes in before it clears, so one that came in while this stored is either seen here, and cleared
    // again, or clears after these stores.
    if (out_.resets_.load(std::memory_order_relaxed) != appliedReset_) {
        out_.clear();
    }
}
} // namespace nt::audio
