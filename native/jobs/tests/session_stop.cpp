// Session stop bridges (docs/plans/graph-runner-async-host.md, section 4.9)
// on their own: the flags, the wake, the binding's lifetime and retirement
// across threads. resource_lanes.cpp tests bridges bound by resource
// operations.
#include "nodetool/jobs/session_stop.h"
#include "resource_test_support.h"

#include <atomic>
#include <barrier>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <latch>
#include <mutex>
#include <stop_token>
#include <string>
#include <thread>
#include <utility>
#include <vector>

namespace {

using nodetool::jobs::SessionStopBridge;
using step5::Suite;

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

// Gate: the wake runs on the thread that requested the stop or retired the
// bridge, after the flag it reports is set. A bridge without a wake still
// sets its flags, and interrupt() returns 0 until a flag is set.
void wakeRunsOnTheStoppingThread(Suite& t) {
  // Thread affinity: thread-safe, `mutex` guards both lists.
  struct Seen {
    std::mutex mutex;
    std::vector<std::thread::id> threads;  // guarded by mutex
    std::vector<bool> flagSet;             // guarded by mutex
  };
  Seen seen;
  // The wake reads the bridge it belongs to, which outlives every thread
  // below.
  SessionStopBridge bridge([&seen, &bridge] {
    std::lock_guard lock(seen.mutex);
    seen.threads.push_back(std::this_thread::get_id());
    seen.flagSet.push_back(bridge.stopped());
  });
  CHECK(SessionStopBridge::interrupt(&bridge) == 0);
  std::stop_source stop;
  std::thread::id stopper;
  std::thread::id retirer;
  {
    SessionStopBridge::Binding binding(bridge, 9, stop.get_token());
    std::thread requester([&] {
      stopper = std::this_thread::get_id();
      stop.request_stop();
    });
    requester.join();
    CHECK(bridge.operationStopped());
  }
  std::thread retiring([&] {
    retirer = std::this_thread::get_id();
    bridge.retire();
  });
  retiring.join();
  std::lock_guard lock(seen.mutex);
  CHECK((seen.threads == std::vector<std::thread::id>{stopper, retirer}));
  CHECK((seen.flagSet == std::vector<bool>{true, true}));

  SessionStopBridge quiet;
  std::stop_source quietStop;
  {
    SessionStopBridge::Binding binding(quiet, 1, quietStop.get_token());
    quietStop.request_stop();
    CHECK(quiet.operationStopped() && SessionStopBridge::interrupt(&quiet) == 1);
  }
  quiet.retire();
  CHECK(quiet.sessionStopped());
}

// Gate: unbinding waits for a stop callback that runs on another thread,
// and only then clears the flag and the active id. The wake blocks inside
// the callback until the binding's thread has started to unbind, and then
// records what the bridge shows. A binding that cleared its state first, or
// that did not wait, would show a cleared bridge, or finish unbinding, while
// the callback still runs. A waiting binding can do neither, so the test
// watches for a bounded time, which only a broken binding can end early,
// then lets the callback return.
void unbindingWaitsForTheCallback(Suite& t) {
  // Thread affinity: thread-safe, `mutex` guards every field and `changed`
  // signals each change.
  struct Sync {
    std::mutex mutex;
    std::condition_variable changed;
    bool callbackEntered = false;          // guarded by mutex
    bool unbinding = false;                // guarded by mutex
    bool unbound = false;                  // guarded by mutex
    bool callbackMayReturn = false;        // guarded by mutex
    bool unboundWhileCallbackRan = false;  // guarded by mutex
    bool stoppedWhileCallbackRan = false;  // guarded by mutex
    uint64_t activeWhileCallbackRan = 0;   // guarded by mutex
  };
  Sync sync;
  // The wake reads the bridge it belongs to, which outlives every thread
  // below.
  SessionStopBridge bridge([&] {
    std::unique_lock lock(sync.mutex);
    sync.callbackEntered = true;
    sync.changed.notify_all();
    sync.changed.wait(lock, [&] { return sync.callbackMayReturn; });
    sync.unboundWhileCallbackRan = sync.unbound;
    sync.stoppedWhileCallbackRan = bridge.operationStopped();
    sync.activeWhileCallbackRan = bridge.activeOperation();
  });
  std::stop_source stop;
  std::latch bound(1);
  std::thread executor([&] {
    {
      SessionStopBridge::Binding binding(bridge, 5, stop.get_token());
      bound.count_down();
      std::unique_lock lock(sync.mutex);
      sync.changed.wait(lock, [&] { return sync.callbackEntered; });
      sync.unbinding = true;
      sync.changed.notify_all();
    }
    std::lock_guard lock(sync.mutex);
    sync.unbound = true;
    sync.changed.notify_all();
  });
  bound.wait();
  std::thread requester([&] { stop.request_stop(); });
  {
    std::unique_lock lock(sync.mutex);
    sync.changed.wait(lock, [&] { return sync.unbinding; });
    // Only a binding that does not wait for the callback can finish here.
    (void)sync.changed.wait_for(lock, std::chrono::milliseconds(200), [&] { return sync.unbound; });
    sync.callbackMayReturn = true;
    sync.changed.notify_all();
  }
  requester.join();
  executor.join();
  std::lock_guard lock(sync.mutex);
  CHECK(!sync.unboundWhileCallbackRan);
  CHECK(sync.stoppedWhileCallbackRan && sync.activeWhileCallbackRan == 5);
  CHECK(!bridge.operationStopped() && bridge.activeOperation() == 0);
}

// Gate: retirement wakes once, also when several threads retire the bridge
// at the same moment, many times over.
void concurrentRetireWakesOnce(Suite& t) {
  constexpr int kThreads = 8;
  constexpr int kRounds = 500;
  int wrong = 0;
  for (int round = 0; round < kRounds; ++round) {
    std::atomic<int> wakes{0};
    SessionStopBridge bridge([&wakes] { ++wakes; });
    std::barrier together(kThreads);
    std::vector<std::thread> threads;
    for (int n = 0; n < kThreads; ++n) {
      threads.emplace_back([&] {
        together.arrive_and_wait();
        bridge.retire();
      });
    }
    for (auto& thread : threads) thread.join();
    if (wakes.load() != 1 || !bridge.sessionStopped()) ++wrong;
  }
  CHECK(wrong == 0);
}

}  // namespace

int main() {
  Suite suite;
  const std::vector<std::pair<const char*, void (*)(Suite&)>> tests = {
      {"stopBridgeFlags", stopBridgeFlags},
      {"wakeRunsOnTheStoppingThread", wakeRunsOnTheStoppingThread},
      {"unbindingWaitsForTheCallback", unbindingWaitsForTheCallback},
      {"concurrentRetireWakesOnce", concurrentRetireWakesOnce},
  };
  const char* only = std::getenv("JOBS_TEST_ONLY");
  for (const auto& [name, fn] : tests) {
    if (only && std::string(only) != name) continue;
    suite.begin(name, std::chrono::seconds(60));
    const int before = suite.failures();
    fn(suite);
    suite.end();
    std::fprintf(stderr, "%s %s\n", suite.failures() == before ? "PASS" : "FAIL", name);
  }
  std::fprintf(stderr, "%d checks, %d failed\n", suite.checks(), suite.failures());
  return suite.failures() == 0 ? 0 : 1;
}
