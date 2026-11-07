#pragma once
#include <QString>
#include <functional>
#include <optional>
#include <variant>

class QCoreApplication;
class QCommandLineParser;

namespace nt::app {
enum class CliStage { AfterServerArgs, BeforeServerArgs };
struct CliMode {
    QString flag;
    std::function<int(int, char**)> handler;
    CliStage stage = CliStage::AfterServerArgs;
};
using StartupResult = std::variant<int, QString>;
using DefaultStartup = std::function<StartupResult(QCoreApplication&, QCommandLineParser&)>;
bool registerDefaultStartup(DefaultStartup handler);
std::optional<StartupResult> dispatchDefaultStartup(QCoreApplication& app, QCommandLineParser& parser);
bool registerCliMode(CliMode mode);
// Exact flag matching, in argument order. Handlers own their application.
std::optional<int> dispatchCliMode(int argc, char** argv, CliStage stage = CliStage::AfterServerArgs);
}
