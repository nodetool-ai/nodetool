// Capability "timers": the host half of setTimeout, setInterval and their
// clear functions (guest/host/timers.mjs). Timers live on the worker
// thread's kernel loop (kernel/task.h), which fires them as macrotasks.
//
//   set(callback, delayMs, repeat) -> id   callback is called with no arguments
//   clear(id) -> boolean                   false for a fired or unknown timer
//   pending() -> number                    timers waiting to fire
//
// The guest wrapper validates and clamps the delay. Timers outlive neither a
// run nor the bundle load: the runner clears them when either ends.
#include "host/capabilities.h"
#include "kernel/task.h"

#include <cmath>
#include <cstdio>
#include <stdexcept>

namespace gr::host {

namespace {
constexpr size_t kMaxTimers = 10000;
}

void installTimers(js::Engine& engine, const js::Value& object, const HostOptions&) {
  using Args = const std::vector<js::Value>&;
  engine.set(object, "set", engine.function("set", 3, [](js::Engine& e, Args a) {
    if (a.empty() || !e.isFunction(a[0])) {
      throw std::runtime_error("timers.set: the callback must be a function");
    }
    const double ms = a.size() > 1 ? e.toNumber(a[1]) : 0;
    if (!std::isfinite(ms) || ms < 0 || ms > 2147483647) {
      throw std::runtime_error("timers.set: the delay must be between 0 and 2147483647 milliseconds");
    }
    // A guest that sets timers without end would grow the loop without bound.
    if (Loop::current().pendingTimers() >= kMaxTimers) {
      throw std::runtime_error("timers.set: too many pending timers");
    }
    const bool repeat = a.size() > 2 && e.toBoolean(a[2]);
    js::Engine* engine = &e;
    js::Value callback = a[0];
    const uint64_t id = Loop::current().setTimer(
        std::chrono::milliseconds(static_cast<int64_t>(ms)),
        // native-rules #12: timer lambda captures a raw Engine pointer and runs later
        [engine, callback] {
          try {
            engine->call(callback, engine->undefined(), {});
          } catch (const js::JsError& err) {
            // Node would report an uncaught exception; the run goes on.
            std::fprintf(stderr, "[guest] uncaught timer error: %s\n", err.what());
          }
        },
        repeat);
    return e.number(static_cast<double>(id));
  }));
  engine.set(object, "clear", engine.function("clear", 1, [](js::Engine& e, Args a) {
    if (a.empty() || !e.isNumber(a[0])) return e.boolean(false);
    const double id = e.toNumber(a[0]);
    if (!std::isfinite(id) || id < 1 || id > 9007199254740991.0 || std::floor(id) != id) {
      return e.boolean(false);
    }
    return e.boolean(Loop::current().clearTimer(static_cast<uint64_t>(id)));
  }));
  engine.set(object, "pending", engine.function("pending", 0, [](js::Engine& e, Args) {
    return e.number(static_cast<double>(Loop::current().pendingTimers()));
  }));
}

}  // namespace gr::host
