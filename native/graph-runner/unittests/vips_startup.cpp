// libvips startup (docs/plans/graph-runner-async-host-evidence.md, Q1.6):
// libvips starts once per process, before the first pool thread, and a
// failure is never retried.
//
//   gr_vips_startup_tests failure      first start fails through the seam
//   gr_vips_startup_tests throwing     first start throws through the seam
//   gr_vips_startup_tests lanes-first  a lane is created before anything else
//
// Each mode needs a fresh process, since the outcome is the process's.
// Callbacks share state with the test through shared pointers they capture
// by value (native/AGENTS.md rule 12).
#include "host/capabilities.h"
#include "host/image_vips.h"
#include "js/engine.h"
#include "kernel/async_jobs.h"
#include "kernel/cancel_state.h"
#include "kernel/host_lanes.h"
#include "kernel/run_control.h"
#include "kernel/task.h"
#include "nodetool/graph_runner.h"
#include "nodetool/jobs/admission.h"

#include <vips/vips.h>

#include <atomic>
#include <cstdio>
#include <memory>
#include <optional>
#include <stdexcept>
#include <string>

namespace {

using gr::ThreadPoolExecutor;
namespace js = gr::js;

// Check counters for one process. Thread affinity: main thread only.
struct Checks {
  int checks = 0;
  int failures = 0;
  void check(bool ok, int line, const char* expression) {
    ++checks;
    if (ok) return;
    ++failures;
    std::fprintf(stderr, "%s:%d: CHECK failed: %s\n", __FILE__, line, expression);
  }
};

#define CHECK(cond) t.check(static_cast<bool>(cond), __LINE__, #cond)

// A starter that counts its calls and fails or succeeds as told.
std::function<bool(std::string&)> counting(std::shared_ptr<std::atomic<int>> calls, bool succeed) {
  return [calls, succeed](std::string& why) {
    ++*calls;
    if (!succeed) why = "simulated vips_init failure";
    return succeed;
  };
}

// An engine with __host.image installed, as the runner installs it.
std::unique_ptr<js::Engine> imageEngine() {
  auto engine = js::createQuickJsEngine();
  js::Value host = engine->object();
  for (const auto& capability : gr::host::capabilities()) {
    if (std::string(capability.name) != "image") continue;
    js::Value object = engine->object();
    capability.install(*engine, object, gr::HostOptions{});
    engine->set(host, capability.name, object);
  }
  engine->set(engine->global(), "__host", host);
  engine->evaluateScript(
      "globalThis.attempt = (f) => { try { const v = f(); return v instanceof Promise ? 'promise' : 'value'; }"
      "  catch (e) { return 'error: ' + e.message; } };"
      "globalThis.png = __host.image.encodePng(new Uint8Array(16).fill(200), 2, 2);",
      "setup.js");
  return engine;
}

// Gate: the first start fails. Later calls, a lane's creation, installing
// the capability and image calls never start libvips again. metadata and
// transform reject at the call with the recorded reason, inside a run before
// anything is charged, while the stb functions keep working.
void failureIsRecordedOnce(Checks& t) {
  auto calls = std::make_shared<std::atomic<int>>(0);
  const auto& outcome = gr::host::vipsStartup(counting(calls, false));
  CHECK(outcome && *outcome == "simulated vips_init failure");
  CHECK(*calls == 1);

  auto later = std::make_shared<std::atomic<int>>(0);
  CHECK(&gr::host::vipsStartup(counting(later, true)) == &outcome);
  CHECK(*later == 0);

  // Creating a lane starts the process job disposer, which asks again.
  ThreadPoolExecutor cpu("cpu", 1);
  const std::string unavailable =
      "error: Native sharp is unavailable: libvips failed to start: simulated vips_init failure";

  auto engine = imageEngine();
  auto attempt = [&](const char* body) {
    return engine->toString(engine->evaluateScript(std::string("attempt(() => ") + body + ")", "test.js"));
  };
  CHECK(attempt("__host.image.metadata(png, '{}')") == unavailable);
  CHECK(attempt("__host.image.transform(png, '{\"format\":\"png\"}')") == unavailable);
  CHECK(attempt("__host.image.decode(png)") == "value");
  CHECK(attempt("__host.image.encodePngAsync(new Uint8Array(16), 2, 2)") == "value");

  // Inside a run, the rejection comes before any reservation.
  {
    auto ledger = std::make_shared<nodetool::jobs::AdmissionLedger>();
    auto identity = gr::host::newRunIdentity("job", ledger->openRunner()->openRun());
    gr::CancelState cancel;
    const uint64_t generation = cancel.beginRun();
    auto tracker = std::make_shared<nodetool::jobs::RunnerTracker>();
    gr::Loop& loop = gr::Loop::current();
    gr::AsyncRun run(*engine, loop, tracker, generation, cpu, identity);
    {
      gr::RunBinding::Scope bound(*engine, run, cpu);
      CHECK(attempt("__host.image.metadata(png, '{}')") == unavailable);
      CHECK(attempt("__host.image.transform(png, '{\"format\":\"png\"}')") == unavailable);
      CHECK(identity->account->usage().bytes == 0);
      CHECK(identity->account->usage().operations == 0);
      CHECK(run.inFlight() == 0);
      CHECK(cpu.queued() == 0);
      // A PNG still encodes on the lane.
      engine->evaluateScript(
          "globalThis.done = ''; __host.image.encodePngAsync(new Uint8Array(16), 2, 2)"
          "  .then((b) => { done = 'ok:' + (b.length > 0); }, (e) => { done = e.message; });",
          "test.js");
      gr::EngineRunControl control(*engine, run, cancel, generation, [&] {
        return !engine->toString(engine->evaluateScript("done", "test.js")).empty();
      });
      loop.run(control);
      CHECK(engine->toString(engine->evaluateScript("done", "test.js")) == "ok:true");
    }
    run.teardown();
    loop.abandon();
  }

  // libvips's own start, which empties the operation cache, never ran.
  CHECK(vips_cache_get_max() != 0);
  CHECK(*calls == 1);
  CHECK(&gr::host::vipsStartup() == &outcome);
}

// Gate: a starter that throws is a failure like any other. The local
// static's initialization completes, so no later call starts libvips again.
void throwingStarterIsRecordedOnce(Checks& t) {
  auto calls = std::make_shared<std::atomic<int>>(0);
  std::string thrown;
  const std::optional<std::string>* outcome = nullptr;
  try {
    outcome = &gr::host::vipsStartup([calls](std::string&) -> bool {
      ++*calls;
      throw std::runtime_error("simulated vips_init exception");
    });
  } catch (const std::exception& e) {
    thrown = e.what();
  }
  CHECK(thrown.empty());
  CHECK(outcome && *outcome && **outcome == "simulated vips_init exception");
  auto later = std::make_shared<std::atomic<int>>(0);
  const auto& again = gr::host::vipsStartup(counting(later, true));
  CHECK(&again == outcome);
  CHECK(*later == 0);
  CHECK(*calls == 1);
  ThreadPoolExecutor cpu("cpu", 1);
  CHECK(*later == 0);
  CHECK(vips_cache_get_max() != 0);
}

// Gate: a lane created before any image code starts libvips first, so the
// image capability installed afterwards finds it started and starts nothing.
void lanesStartLibvipsFirst(Checks& t) {
  ThreadPoolExecutor cpu("cpu", 1);
  auto calls = std::make_shared<std::atomic<int>>(0);
  const auto& outcome = gr::host::vipsStartup(counting(calls, false));
  CHECK(*calls == 0);
  CHECK(!outcome);
  CHECK(vips_cache_get_max() == 0);
  auto engine = imageEngine();
  CHECK(engine->toString(engine->evaluateScript("JSON.stringify(__host.image.metadata(png, '{}'))", "test.js")) ==
        R"({"width":2,"height":2,"channels":4,"format":"png","hasAlpha":true})");
}

}  // namespace

int main(int argc, char** argv) {
  const std::string mode = argc > 1 ? argv[1] : "";
  Checks t;
  if (mode == "failure") {
    failureIsRecordedOnce(t);
  } else if (mode == "throwing") {
    throwingStarterIsRecordedOnce(t);
  } else if (mode == "lanes-first") {
    lanesStartLibvipsFirst(t);
  } else {
    std::fprintf(stderr, "usage: gr_vips_startup_tests failure|throwing|lanes-first\n");
    return 2;
  }
  std::fprintf(stderr, "%s: %d checks, %d failures\n", mode.c_str(), t.checks, t.failures);
  return t.failures == 0 ? 0 : 1;
}
