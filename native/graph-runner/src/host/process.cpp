// Capability "process": facts about the host process that Node's `process`
// exposes and node code reads at load time (guest/host/process.mjs).
//
//   platform   Node's process.platform for the OS this runner was built for
//   arch       Node's process.arch for the CPU this runner was built for
//
// Nothing else crosses: the guest's process.env is always empty.
#include "host/capabilities.h"

namespace gr::host {
namespace {

constexpr const char* kPlatform =
#if defined(_WIN32)
    "win32";
#elif defined(__APPLE__)
    "darwin";
#elif defined(__linux__)
    "linux";
#elif defined(__FreeBSD__)
    "freebsd";
#elif defined(__OpenBSD__)
    "openbsd";
#else
    "";
#endif

constexpr const char* kArch =
#if defined(__x86_64__) || defined(_M_X64)
    "x64";
#elif defined(__aarch64__) || defined(_M_ARM64)
    "arm64";
#elif defined(__i386__) || defined(_M_IX86)
    "ia32";
#elif defined(__arm__) || defined(_M_ARM)
    "arm";
#else
    "";
#endif

static_assert(kPlatform[0] != '\0', "add this OS to the process capability");
static_assert(kArch[0] != '\0', "add this CPU to the process capability");

}  // namespace

void installProcess(js::Engine& engine, const js::Value& object, const HostOptions&) {
  engine.set(object, "platform", engine.string(kPlatform));
  engine.set(object, "arch", engine.string(kArch));
}

}  // namespace gr::host
