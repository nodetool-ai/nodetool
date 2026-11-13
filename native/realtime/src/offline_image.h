#pragma once
#include "nodetool/realtime/plan.h"
#include <cstddef>
#include <filesystem>
#include <span>

namespace nt::realtime {
// Offline host preparation and export helpers. No executor calls or GPU handles.
std::string loadOfflineCatalog(const std::filesystem::path& path, Registry& registry);
void writeOfflinePng(const std::filesystem::path& path, std::span<std::byte> pixels,
    unsigned width, unsigned height);
}
