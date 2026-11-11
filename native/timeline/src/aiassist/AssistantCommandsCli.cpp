// --audit-assistant-commands checks the Assistant's command tables against what this binary registers.
#include "aiassist/AssistantCommands.h"
#include "app/CliModes.h"

#include <QCoreApplication>
#include <QTextStream>

namespace {
const bool registered = nt::app::registerCliMode({"--audit-assistant-commands", [](int argc, char** argv) {
    QCoreApplication app(argc, argv);
    const auto audit = nt::aiassist::auditCommands();
    QTextStream out(stdout);
    out << audit.allowed << " allowed, " << audit.denied << " denied\n";
    const auto report = [&out](const char* heading, const QStringList& ids) {
        if (!ids.isEmpty()) { out << heading << ": " << ids.join(", ") << "\n"; }
    };
    report("Neither allowed nor denied", audit.unlisted);
    report("In a table but not registered", audit.stale);
    report("Both allowed and denied", audit.conflicting);
    report("Allowed with nothing to run", audit.unrunnable);
    return audit.clean() ? 0 : 1;
}, nt::app::CliStage::BeforeServerArgs});
}  // namespace
