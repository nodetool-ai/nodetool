// Rollout step 5 infrastructure of docs/plans/graph-runner-async-host.md:
// resource control blocks (section 4.8) on the process lanes' timed
// shutdown and through AsyncRun. No host function is converted; the bodies
// here are test objects. The cases that need no process lane or engine are
// in native/jobs/tests/: resource_control.cpp, resource_lanes.cpp and
// session_stop.cpp.
#include "js/engine.h"
#include "kernel/async_jobs.h"
#include "kernel/cancel_state.h"
#include "kernel/host_lanes.h"
#include "kernel/run_control.h"
#include "kernel/task.h"
#include "nodetool/jobs/resource_control.h"
#include "nodetool/jobs/session_stop.h"
#include "resource_test_support.h"

#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <future>
#include <memory>
#include <stdexcept>
#include <stop_token>
#include <string>
#include <thread>
#include <utility>
#include <vector>

namespace {

using gr::ThreadPoolExecutor;
using nodetool::jobs::JobOutcome;
using nodetool::jobs::ResourceControl;
using step5::BlockingBody;
using step5::Clock;
using step5::Gate;
using step5::Probe;
using step5::Suite;
using step5::TestBody;
using step5::TestRun;
using step5::eventually;
using step5::milliseconds;
using step5::record;
using step5::returnsPromptly;
using State = ResourceControl::State;

// --- the lane's timed shutdown -------------------------------------------------------

// The thread of `lane`'s reaper: starts the lane with a job, then relays a
// stop whose callback reports the thread it runs on.
std::thread::id reaperOf(ThreadPoolExecutor& lane) {
  auto started = std::make_shared<Gate>();
  lane.submit(nodetool::jobs::SubmittedJob(0, nodetool::jobs::makeJob([started](std::stop_token) {
                                             started->release();
                                             return JobOutcome::value(nullptr);
                                           }),
                                           nullptr, {}, nodetool::jobs::RunnerTracker::Ticket{}));
  started->wait();
  std::stop_source source;
  auto seen = std::make_shared<std::promise<std::thread::id>>();
  std::future<std::thread::id> reaper = seen->get_future();
  std::stop_callback report(source.get_token(), [seen] { seen->set_value(std::this_thread::get_id()); });
  lane.stopRelay()->relay(source, nullptr);
  return reaper.get();
}

// Gate: a destruction lane whose reaper is blocked in a body's destructor
// shuts down by its deadline with TimedOut, without joining the blocked
// thread, and completes once the destructor returns.
void blockedDestructionTimesOutShutdown(Suite& t) {
  auto lane = std::make_unique<ThreadPoolExecutor>("owner", 1);
  (void)reaperOf(*lane);
  auto probe = std::make_shared<Probe>();
  auto gate = std::make_shared<Gate>();
  auto entered = std::make_shared<Gate>();
  auto control = ResourceControl::create("encoder", std::make_unique<BlockingBody>(probe, gate, entered), *lane);
  CHECK(returnsPromptly([held = control] { held->abort("run cleanup"); }, std::make_shared<Gate>()));
  entered->wait();
  control.reset();
  const auto start = Clock::now();
  CHECK(lane->shutdown(Clock::now() + milliseconds(200)) == gr::HostShutdownStatus::TimedOut);
  const auto waited = Clock::now() - start;
  CHECK(waited >= milliseconds(150) && waited < std::chrono::seconds(2));
  CHECK(lane->liveThreads() > 0);
  CHECK(probe->destroyed.load() == 0);
  gate->release();
  CHECK(lane->awaitShutdown(Clock::now() + std::chrono::seconds(10)) == gr::HostShutdownStatus::Complete);
  CHECK(probe->destroyed.load() == 1);
  lane.reset();
}

// --- through AsyncRun ----------------------------------------------------------------

// Gate: host functions submit through AsyncRun::submit to a control's
// ports. Promises settle in queue order, and an operation after finish
// rejects as closed. The run attaches to the port, keeping the
// control alive after the test drops it until the run is destroyed.
void throughAsyncRun(Suite& t) {
  ThreadPoolExecutor lane("async", 2);
  auto engine = gr::js::createQuickJsEngine();
  gr::Loop& loop = gr::Loop::current();
  gr::CancelState state;
  const uint64_t generation = state.beginRun();
  auto tracker = std::make_shared<nodetool::jobs::RunnerTracker>();
  auto probe = std::make_shared<Probe>();
  std::weak_ptr<ResourceControl> weak;
  {
    // A shared pointer only so the host functions can hold weak references.
    // The test owns it alone, and destroying it here detaches the run.
    auto async = std::make_shared<gr::AsyncRun>(*engine, loop, tracker, generation, lane);
    auto control = ResourceControl::create("encoder", std::make_unique<TestBody>(probe, "body"), lane);
    weak = control;
    gr::Converter convert = [](gr::js::Engine& e, nodetool::jobs::JobPayload* payload) {
      return e.string(static_cast<TestRun::TextPayload*>(payload)->text);
    };
    auto bind = [&](const char* name, bool terminal) {
      std::weak_ptr<gr::AsyncRun> weakRun = async;
      engine->set(engine->global(), name,
                  engine->function(name, 1,
                                   [weakRun, weak, convert, terminal](gr::js::Engine& e,
                                                                      const std::vector<gr::js::Value>& a) {
                                     auto run = weakRun.lock();
                                     auto target = weak.lock();
                                     if (!run || !target) throw std::runtime_error("the test run ended");
                                     const std::string tag = e.toString(a.at(0));
                                     nodetool::jobs::JobExecutor& port =
                                         terminal ? target->terminal() : target->operations();
                                     return run->submit(port, record(target, tag), convert);
                                   }));
    };
    bind("op", false);
    bind("finish", true);
    engine->evaluateScript(
        "globalThis.out = [];"
        "op('a').then((v) => out.push(v));"
        "op('b').then((v) => out.push(v));"
        "finish('f').then((v) => out.push(v));"
        "op('late').catch((e) => out.push('late: ' + e.message));",
        "async.js");
    gr::EngineRunControl run(*engine, *async, state, generation, [&] {
      return engine->toString(engine->evaluateScript("String(out.length === 4)", "check.js")) == "true";
    });
    CHECK(loop.run(run) == gr::RunExit::Done);
    // a, b and f settle in queue order. The refusal settles at its own
    // macrotask, which can come after a when a finished before late was
    // submitted.
    const std::string settled = engine->toString(engine->evaluateScript(
        "out.filter((v) => !v.startsWith('late')).join(',') + '|' + out.filter((v) => v.startsWith('late')).join()",
        "out.js"));
    CHECK(settled == "a,b,f|late: encoder is closed");
    CHECK(eventually([&] { return control->state() == State::Retired; }));
    CHECK(eventually([&] { return probe->destroyed.load() == 1; }));
    async->teardown();
    control.reset();
    // The run still holds the port, so the control lives on.
    CHECK(!weak.expired());
    async.reset();
  }
  // The refused job goes to the process disposer, which destroys it, and
  // its reference to the control, later.
  CHECK(tracker->waitIdle(Clock::now() + std::chrono::seconds(10)));
  CHECK(weak.expired());
  loop.abandon();
}

}  // namespace

int main() {
  Suite suite;
  Suite& t = suite;
  const std::vector<std::pair<const char*, void (*)(Suite&)>> tests = {
      {"blockedDestructionTimesOutShutdown", blockedDestructionTimesOutShutdown},
      {"throughAsyncRun", throughAsyncRun},
  };
  const char* only = std::getenv("GR_RESOURCE_ONLY");
  for (const auto& [name, fn] : tests) {
    if (only && std::string(only) != name) continue;
    suite.begin(name, std::chrono::seconds(240));
    const int before = suite.failures();
    fn(suite);
    suite.end();
    std::fprintf(stderr, "%s %s\n", suite.failures() == before ? "PASS" : "FAIL", name);
  }
  (void)t;
  std::fprintf(stderr, "%d checks, %d failed\n", suite.checks(), suite.failures());
  return suite.failures() == 0 ? 0 : 1;
}
