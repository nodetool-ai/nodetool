#pragma once
#include <array>
#include <atomic>
#include <memory>
#include <string>
namespace nt::automation {
// native-rules #9: written on the render thread and read on the UI thread, no affinity comment
struct MeterPeaks {
    std::atomic<float> left{0}, right{0};
    static_assert(std::atomic<float>::is_always_lock_free);
};
// Control/UI thread only. The render processor retains its own shared pointer.
void beginMeterPlan();
// native-rules #1: returns std::shared_ptr with no comment on why unique ownership is impossible
std::shared_ptr<MeterPeaks> publishMeter(const std::string& id);
std::array<float,2> takeMeter(const std::string& id);
}
