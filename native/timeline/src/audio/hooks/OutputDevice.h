#pragma once
#include <functional>
#include <span>
#include <string>
#include <optional>

namespace nt::audio {
// Called on the control thread before the device starts. Return an exact
// playback name, or an empty/unmatched name for the backend's default.
using OutputDeviceProvider = std::function<std::string(std::span<const std::string>)>;
void registerOutputDeviceProvider(OutputDeviceProvider provider);
void clearOutputDeviceProvider();
bool hasOutputDeviceProvider();
std::optional<std::size_t> selectedOutputDevice(std::span<const std::string> names);
}
