// Worker thread ownership checks (invariant I5 of
// docs/plans/graph-runner-async-host.md). Engine values, the kernel loop and
// the settler registry belong to the thread that created them. Debug builds,
// and builds that define GR_THREAD_CHECKS=1, abort when another thread uses
// them. Release builds compile the check and the owner field out:
// ThreadOwner is then empty, and members declare it [[no_unique_address]].
//
// The two modes give those classes different layouts, so one binary must
// not mix objects built in both. Every object file that includes this
// header references a symbol named after its mode, and quickjs_engine.cpp
// defines the symbol for the mode it was built in, together with one symbol
// both modes define. Mixing modes therefore fails to link: either a mode
// symbol is undefined, or the shared symbol is defined twice.
#pragma once

#include <cstdio>
#include <cstdlib>
#include <thread>

#ifndef GR_THREAD_CHECKS
#ifdef NDEBUG
#define GR_THREAD_CHECKS 0
#else
#define GR_THREAD_CHECKS 1
#endif
#endif

#if GR_THREAD_CHECKS
#define GR_THREAD_CHECK_MODE_SYMBOL gr_thread_checks_on
#else
#define GR_THREAD_CHECK_MODE_SYMBOL gr_thread_checks_off
#endif

extern "C" int GR_THREAD_CHECK_MODE_SYMBOL;

#if defined(_MSC_VER)
#if GR_THREAD_CHECKS
#pragma detect_mismatch("gr_thread_checks", "1")
#else
#pragma detect_mismatch("gr_thread_checks", "0")
#endif
#else
namespace gr::detail {
// One internal copy per object file, so every object file carries a
// relocation against its mode symbol. (An inline variable would be merged
// into one copy, which could hide the other mode.) `used` keeps the compiler
// from dropping it. `retain` keeps the linker from discarding its section
// under --gc-sections, which would drop the relocation with it.
#if defined(__has_attribute) && __has_attribute(retain)
#define GR_THREAD_CHECK_GUARD_ATTRS [[gnu::used, gnu::retain]]
#else
#define GR_THREAD_CHECK_GUARD_ATTRS [[gnu::used]]
#endif
GR_THREAD_CHECK_GUARD_ATTRS static int* const threadCheckModeGuard = &GR_THREAD_CHECK_MODE_SYMBOL;
#undef GR_THREAD_CHECK_GUARD_ATTRS
}  // namespace gr::detail
#endif

namespace gr {

class ThreadOwner {
public:
  void check([[maybe_unused]] const char* what) const {
#if GR_THREAD_CHECKS
    if (std::this_thread::get_id() != owner_) {
      std::fprintf(stderr, "%s used off its owner thread\n", what);
      std::abort();
    }
#endif
  }

#if GR_THREAD_CHECKS
private:
  std::thread::id owner_ = std::this_thread::get_id();
#endif
};

}  // namespace gr
