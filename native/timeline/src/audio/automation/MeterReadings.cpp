#include "MeterReadings.h"
#include <mutex>
#include <unordered_map>
namespace nt::automation {
namespace {
struct Registry {
    std::mutex mutex;
    std::unordered_map<std::string,std::weak_ptr<MeterPeaks>> channels;
};
Registry& registry() { static Registry r; return r; }
}
void beginMeterPlan() {
    auto& r=registry();
    const std::scoped_lock lock(r.mutex);
    r.channels.clear();
}
std::shared_ptr<MeterPeaks> publishMeter(const std::string& id) {
    auto peaks=std::make_shared<MeterPeaks>();
    auto& r=registry();
    const std::scoped_lock lock(r.mutex);
    r.channels[id]=peaks;
    return peaks;
}
std::array<float,2> takeMeter(const std::string& id) {
    auto& r=registry();
    const std::scoped_lock lock(r.mutex);
    const auto it=r.channels.find(id);
    if (it==r.channels.end()) { return {}; }
    const auto peaks=it->second.lock();
    if (!peaks) { return {}; }
    return {peaks->left.exchange(0,std::memory_order_relaxed),peaks->right.exchange(0,std::memory_order_relaxed)};
}
}
