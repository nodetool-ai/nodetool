#pragma once
#include <array>
#include <atomic>
#include <memory>
#include <string>
namespace nt::automation {
struct MeterPeaks {
    std::atomic<float> left{0}, right{0};
    static_assert(std::atomic<float>::is_always_lock_free);
};
// Control/UI thread only. The render processor retains its own shared pointer.
void beginMeterPlan();
std::shared_ptr<MeterPeaks> publishMeter(const std::string& id);
std::array<float,2> takeMeter(const std::string& id);
}
