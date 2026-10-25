#pragma once
#include <QString>
#include <functional>
#include <optional>

namespace nt::app {
enum class CliStage { AfterServerArgs, BeforeServerArgs };
struct CliMode {
    QString flag;
    std::function<int(int, char**)> handler;
    CliStage stage = CliStage::AfterServerArgs;
};
bool registerCliMode(CliMode mode);
// Exact flag matching, in argument order. Handlers own their application.
std::optional<int> dispatchCliMode(int argc, char** argv, CliStage stage = CliStage::AfterServerArgs);
}
