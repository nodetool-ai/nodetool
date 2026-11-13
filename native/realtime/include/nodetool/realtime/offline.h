#pragma once
#include "plan.h"
#include <cstdint>
#include <filesystem>

namespace nt::realtime {
struct OfflineOptions {
    std::string duration = "1";
    std::string fps = "60";
    std::filesystem::path output;
    std::filesystem::path catalog;
};
struct OfflineResult {
    std::optional<Diagnostic> error;
    std::uint64_t samples = 0;
    std::uint64_t frames = 0;
};
// Synchronous offline host-thread entry point. Owns executors and output streams
// until return. File I/O is outside executor calls. Creates a new output directory
// and leaves partial files on failure, without a success manifest.
// Render export requires the optional private-device GPU build. External slots
// remain unsupported. Catalog defaults to the build's generated shader catalog.
OfflineResult runOffline(std::string_view json, const OfflineOptions& options);
}
