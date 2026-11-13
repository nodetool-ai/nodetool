#pragma once
#include "plan.h"
#include <cstdint>
#include <filesystem>
#include <span>

namespace nt::realtime {
struct OfflineSlotFile { std::string id; std::filesystem::path path; };
struct OfflineOptions {
    std::string duration = "1";
    std::string fps = "60";
    std::filesystem::path output;
    std::filesystem::path catalog{};
    std::vector<OfflineSlotFile> slots{};
};
struct OfflineResult {
    std::optional<Diagnostic> error;
    std::uint64_t samples = 0;
    std::uint64_t frames = 0;
};
// Synchronous offline host-thread entry point. Owns executors and output streams
// until return. File I/O is outside executor calls. Creates a new output directory
// and leaves partial files on failure, without a success manifest.
// Render export requires the optional private-device GPU build. Catalog defaults
// to the build's generated shader catalog. Slots are explicitly bound local files.
OfflineResult runOffline(std::string_view json, const OfflineOptions& options);
// UTF-8 arguments after "live", starting with the plan filename. Synchronous
// host entry point shared by the standalone and graph-runner commands.
int offlineMain(std::span<const std::string> arguments);
}
