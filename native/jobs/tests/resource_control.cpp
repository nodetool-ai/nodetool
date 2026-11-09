// Resource control blocks (docs/plans/graph-runner-async-host.md, section
// 4.8) on an inline executor, and session stop bridges (section 4.9). The
// graph runner's unittests/resource_control.cpp tests resource control on
// its thread pool lanes and through AsyncRun.
#include "nodetool/jobs/job_core.h"
#include "nodetool/jobs/resource_control.h"
#include "nodetool/jobs/session_stop.h"
#include "resource_test_support.h"

#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <memory>
#include <stop_token>
#include <string>
#include <thread>
#include <utility>
#include <vector>

namespace {

using nodetool::jobs::InlineExecutor;
using nodetool::jobs::ResourceControl;
using nodetool::jobs::SessionStopBridge;
using step5::Probe;
using step5::Suite;
using step5::TestBody;
using step5::TestRun;
using step5::record;
using State = ResourceControl::State;

// --- session stop bridge ----------------------------------------------------------

// Gate: the bridge's flags. A binding sets the active operation, resets the
// operation flag and registers its stop; unbinding clears both. A stop of an
// earlier operation does not reach a later one. Retirement is permanent and
// later bindings cannot clear it. The interrupt callback reads the OR.
void stopBridgeFlags(Suite& t) {
  std::atomic<int> wakes{0};
  SessionStopBridge bridge([&wakes] { ++wakes; });
  CHECK(!bridge.stopped() && bridge.activeOperation() == 0);
  std::stop_source first;
  {
    SessionStopBridge::Binding binding(bridge, 1, first.get_token());
    CHECK(bridge.activeOperation() == 1 && !bridge.operationStopped());
    first.request_stop();
    CHECK(bridge.operationStopped() && bridge.stopped() && !bridge.sessionStopped());
    CHECK(SessionStopBridge::interrupt(&bridge) == 1);
  }
  CHECK(!bridge.stopped() && bridge.activeOperation() == 0);
  std::stop_source second;
  {
    SessionStopBridge::Binding binding(bridge, 2, second.get_token());
    CHECK(bridge.activeOperation() == 2 && !bridge.stopped());
    first.request_stop();
    CHECK(!bridge.stopped());
  }
  {
    // A token that stopped before binding sets the flag at once.
    SessionStopBridge::Binding binding(bridge, 3, first.get_token());
    CHECK(bridge.operationStopped());
  }
  CHECK(wakes.load() == 2);
  bridge.retire();
  bridge.retire();
  CHECK(wakes.load() == 3);
  CHECK(bridge.sessionStopped() && bridge.stopped());
  std::stop_source fourth;
  {
    SessionStopBridge::Binding binding(bridge, 4, fourth.get_token());
    CHECK(!bridge.operationStopped() && bridge.stopped());
    CHECK(SessionStopBridge::interrupt(&bridge) == 1);
  }
  CHECK(bridge.sessionStopped() && bridge.stopped());
}

// --- inline lane --------------------------------------------------------------------

// Gate: inline mode. On the worker's InlineExecutor, operations run at
// submission and their results still go through the mailbox in order.
void inlineLane(Suite& t) {
  InlineExecutor lane;
  auto probe = std::make_shared<Probe>();
  auto control = ResourceControl::create("inline", std::make_unique<TestBody>(probe, "body"), lane);
  TestRun run;
  const uint64_t a = run.submit(control->operations(), record(control, "a"));
  const uint64_t b = run.submit(control->operations(), record(control, "b"));
  const uint64_t fin = run.submit(control->terminal(), record(control, "finish"));
  CHECK(control->state() == State::Retired);
  CHECK(probe->destroyer() == std::this_thread::get_id());
  CHECK(run.await({a, b, fin}));
  CHECK((run.order() == std::vector<uint64_t>{a, b, fin}));
}

}  // namespace

int main() {
  Suite suite;
  const std::vector<std::pair<const char*, void (*)(Suite&)>> tests = {
      {"stopBridgeFlags", stopBridgeFlags},
      {"inlineLane", inlineLane},
  };
  const char* only = std::getenv("JOBS_TEST_ONLY");
  for (const auto& [name, fn] : tests) {
    if (only && std::string(only) != name) continue;
    suite.begin(name, std::chrono::seconds(240));
    const int before = suite.failures();
    fn(suite);
    suite.end();
    std::fprintf(stderr, "%s %s\n", suite.failures() == before ? "PASS" : "FAIL", name);
  }
  std::fprintf(stderr, "%d checks, %d failed\n", suite.checks(), suite.failures());
  return suite.failures() == 0 ? 0 : 1;
}
