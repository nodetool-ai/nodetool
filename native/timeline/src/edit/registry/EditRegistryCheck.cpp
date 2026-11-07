#include "app/CliModes.h"
#include "app/EditRegistry.h"
#include <QCoreApplication>
#include <cstdio>

namespace {
int checkEditRegistry(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    for (const auto& record : nt::app::editRegistrations()) {
        std::printf("%s: %s registrar: %s\n", record.override ? "Override" : "Edit",
                    qPrintable(record.name), qPrintable(record.registrar));
    }
    for (const auto& refusal : nt::app::editRefusals()) {
        std::printf("Refused %s: %s registrar: %s existing: %s reason: %s\n",
                    refusal.attempted.override ? "override" : "edit", qPrintable(refusal.attempted.name),
                    qPrintable(refusal.attempted.registrar), qPrintable(refusal.existingRegistrar),
                    qPrintable(refusal.reason));
    }
    std::printf("Edit registry: %lld registrations, %lld refusals\n",
                static_cast<long long>(nt::app::editRegistrations().size()),
                static_cast<long long>(nt::app::editRefusals().size()));
    return nt::app::editRefusals().isEmpty() ? 0 : 1;
}
const bool registered = nt::app::registerCliMode(
    {"--check-edit-registry", checkEditRegistry, nt::app::CliStage::BeforeServerArgs});
} // namespace
