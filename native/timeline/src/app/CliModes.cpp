#include "app/CliModes.h"
#include <algorithm>
#include <vector>

namespace nt::app {
namespace {
std::vector<CliMode>& modes() {
    static std::vector<CliMode> value;
    return value;
}
}
bool registerCliMode(CliMode mode) {
    if (mode.flag.isEmpty() || !mode.handler || std::any_of(modes().begin(), modes().end(),
            [&](const auto& m) { return m.flag == mode.flag; })) {
        return false;
    }
    modes().push_back(std::move(mode));
    return true;
}
std::optional<int> dispatchCliMode(int argc, char** argv, CliStage stage) {
    for (int i = 1; i < argc; ++i) {
        for (const auto& mode : modes()) {
            if (mode.stage == stage && mode.flag == QString::fromLocal8Bit(argv[i])) {
                return mode.handler(argc, argv);
            }
        }
    }
    return std::nullopt;
}
}
