#include "nodetool/realtime/offline.h"
#include <fstream>
#include <iostream>
#include <set>
#include <stdexcept>

namespace nt::realtime {
namespace {
std::filesystem::path pathFromUtf8(const std::string& value) {
    return std::filesystem::path(std::u8string(value.begin(), value.end()));
}
}
int offlineMain(std::span<const std::string> arguments) {
    try {
        if (arguments.empty()) {
            std::cerr << "Usage: <runner> live plan.json --duration SECONDS --fps RATE --out NEW_DIRECTORY [--null-audio] [--catalog FILE] [--slot ID=FILE]...\n";
            return 2;
        }
        OfflineOptions options;
        std::set<std::string_view> seen;
        for (std::size_t i = 1; i < arguments.size(); ++i) {
            const std::string_view flag(arguments[i]);
            if (flag != "--slot" && !seen.insert(flag).second) { throw std::runtime_error("Repeated argument: " + std::string(flag)); }
            if (flag == "--null-audio") { continue; }
            if (flag != "--duration" && flag != "--fps" && flag != "--out" && flag != "--catalog" && flag != "--slot") {
                throw std::runtime_error("Unknown argument: " + std::string(flag));
            }
            if (++i >= arguments.size()) { throw std::runtime_error("Missing value: " + std::string(flag)); }
            if (flag == "--duration") { options.duration = arguments[i]; }
            if (flag == "--fps") { options.fps = arguments[i]; }
            if (flag == "--out") { options.output = pathFromUtf8(arguments[i]); }
            if (flag == "--catalog") { options.catalog = pathFromUtf8(arguments[i]); }
            if (flag == "--slot") {
                const auto equal = arguments[i].find('=');
                if (equal == std::string::npos || equal == 0 || equal + 1 == arguments[i].size()) {
                    throw std::runtime_error("Expected --slot ID=FILE");
                }
                options.slots.push_back({arguments[i].substr(0, equal), pathFromUtf8(arguments[i].substr(equal + 1))});
            }
        }
        if (options.output.empty()) { throw std::runtime_error("--out is required"); }
        const auto path = pathFromUtf8(arguments[0]);
        const auto size = std::filesystem::file_size(path);
        if (size > 64ull * 1024 * 1024) { throw std::runtime_error("Plan exceeds 64 MiB"); }
        std::ifstream stream(path, std::ios::binary);
        if (!stream) { throw std::runtime_error("Cannot open plan"); }
        std::string json(static_cast<std::size_t>(size), '\0');
        stream.read(json.data(), static_cast<std::streamsize>(json.size()));
        if (!stream || stream.peek() != std::char_traits<char>::eof()) { throw std::runtime_error("Plan changed or failed while reading"); }
        const auto result = runOffline(json, options);
        if (result.error) {
            std::cerr << result.error->node << '/' << result.error->reason << ": " << result.error->detail << '\n';
            return 1;
        }
        std::cout << "Exported " << result.samples << " samples per channel and evaluated " << result.frames << " control frames\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 2;
    }
}
}
