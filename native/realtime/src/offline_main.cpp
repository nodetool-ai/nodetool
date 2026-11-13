#include "nodetool/realtime/offline.h"
#include <iostream>
#include <vector>

namespace {
template<class Character>
int entry(int argc, Character** arguments) {
    try {
        if (argc < 2 || std::filesystem::path(arguments[1]) != "live") { return nt::realtime::offlineMain({}); }
        std::vector<std::string> argv;
        argv.reserve(static_cast<std::size_t>(argc - 2));
        for (int i = 2; i < argc; ++i) {
            const auto utf8 = std::filesystem::path(arguments[i]).u8string();
            argv.emplace_back(utf8.begin(), utf8.end());
        }
        return nt::realtime::offlineMain(argv);
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
