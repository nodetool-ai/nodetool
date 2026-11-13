#include "nodetool/realtime/offline.h"
#include <fstream>
#include <iostream>
#include <set>
#include <stdexcept>
#include <vector>

namespace {
std::filesystem::path pathFromUtf8(const std::string& value) {
    return std::filesystem::path(std::u8string(value.begin(), value.end()));
}
int run(int argc, const std::vector<std::string>& argv) {
    try {
        if (argc < 3 || std::string_view(argv[1]) != "live") {
            std::cerr << "Usage: nodetool-realtime live plan.json --duration SECONDS --fps RATE --out NEW_DIRECTORY [--null-audio]\n";
            return 2;
        }
        nt::realtime::OfflineOptions options;
        std::set<std::string_view> seen;
        for (int i = 3; i < argc; ++i) {
            const std::string_view flag(argv[i]);
            if (!seen.insert(flag).second) { throw std::runtime_error("Repeated argument: " + std::string(flag)); }
            if (flag == "--null-audio") { continue; }
            if (flag != "--duration" && flag != "--fps" && flag != "--out") {
                throw std::runtime_error("Unknown argument: " + std::string(flag));
            }
            if (++i >= argc) { throw std::runtime_error("Missing value: " + std::string(flag)); }
            if (flag == "--duration") { options.duration = argv[i]; }
            if (flag == "--fps") { options.fps = argv[i]; }
            if (flag == "--out") { options.output = pathFromUtf8(argv[i]); }
        }
        if (options.output.empty()) { throw std::runtime_error("--out is required"); }
        const auto path = pathFromUtf8(argv[2]);
        constexpr auto maxPlanBytes = 64ull * 1024 * 1024;
        const auto size = std::filesystem::file_size(path);
        if (size > maxPlanBytes) { throw std::runtime_error("Plan exceeds 64 MiB"); }
        std::ifstream stream(path, std::ios::binary);
        if (!stream) { throw std::runtime_error("Cannot open plan"); }
        std::string json(static_cast<std::size_t>(size), '\0');
        stream.read(json.data(), static_cast<std::streamsize>(json.size()));
        if (!stream || stream.peek() != std::char_traits<char>::eof()) { throw std::runtime_error("Plan changed or failed while reading"); }
        const auto result = nt::realtime::runOffline(json, options);
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
template<class Character>
int entry(int argc, Character** arguments) {
    try {
        std::vector<std::string> argv;
        argv.reserve(static_cast<std::size_t>(argc));
        for (int i = 0; i < argc; ++i) {
            const auto utf8 = std::filesystem::path(arguments[i]).u8string();
            argv.emplace_back(utf8.begin(), utf8.end());
        }
        return run(argc, argv);
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 2;
    }
}
}
#ifdef _WIN32
int wmain(int argc, wchar_t** argv) { return entry(argc, argv); }
#else
int main(int argc, char** argv) { return entry(argc, argv); }
#endif
