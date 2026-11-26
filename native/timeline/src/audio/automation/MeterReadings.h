#pragma once
#include <array>
#include <atomic>
#include <memory>
#include <string>
namespace nt::automation {
// Thread-safe atomic handoff. The renderer publishes peaks and the UI exchanges them.
struct MeterPeaks {
    std::atomic<float> left{0}, right{0};
    static_assert(std::atomic<float>::is_always_lock_free);
};
// Control/UI thread only. The render processor retains its own shared pointer.
void beginMeterPlan();
// native-rules #1: returns std::shared_ptr with no comment on why unique ownership is impossible
std::shared_ptr<MeterPeaks> publishMeter(const std::string& id);
std::array<float,2> takeMeter(const std::string& id);
bool metersHaveSignal();
bool hasMeter(const std::string& id);
}
