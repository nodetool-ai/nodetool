// Linux and Windows (M6), and macOS with NT_PORTABLE_PLATFORM: the macOS
// process activity (App Nap) and window occlusion diagnostics have no
// counterpart, so they do nothing. macOS builds ProcessActivity.mm and
// SchedulingDiagnostics.mm instead.

#include "platform/ProcessActivity.h"
#include "platform/SchedulingDiagnostics.h"

namespace nt {

ProcessActivity::ProcessActivity(const char*) {}

ProcessActivity::~ProcessActivity() {
    (void)m_token;  // the macOS activity token; nothing to end here
}

}  // namespace nt

namespace nt::diag {

std::string watchOcclusion(QWindow*) {
    return "unsupported";
}

}  // namespace nt::diag
