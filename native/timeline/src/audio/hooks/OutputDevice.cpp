#include "audio/hooks/OutputDevice.h"
#include <algorithm>
#include <mutex>

namespace nt::audio {
namespace {
struct Registry {
    std::mutex mutex;
    OutputDeviceProvider provider;
};
Registry& registry() { static Registry value; return value; }
}
void registerOutputDeviceProvider(OutputDeviceProvider provider) {
    auto& value = registry();
    const std::scoped_lock lock(value.mutex);
    value.provider = std::move(provider);
}
void clearOutputDeviceProvider() { registerOutputDeviceProvider({}); }
bool hasOutputDeviceProvider() {
    auto& value = registry();
    const std::scoped_lock lock(value.mutex);
    return bool(value.provider);
}
std::optional<std::size_t> selectedOutputDevice(std::span<const std::string> names) {
    OutputDeviceProvider provider;
    {
        auto& value = registry();
        const std::scoped_lock lock(value.mutex);
        provider = value.provider;
    }
    if (!provider) { return {}; }
    const auto name = provider(names);
    if (name.empty()) { return {}; }
    const auto found = std::ranges::find(names, name);
    if (found == names.end()) { return {}; }
    return static_cast<std::size_t>(found - names.begin());
}
}
