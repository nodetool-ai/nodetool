// The runner tracker and the run mailbox of the job core
// (docs/plans/graph-runner-async-host.md, rollout step 1). The graph runner's
// unittests/async_host.cpp tests the rest of step 1, which needs an engine
// or the runner's loop.
#include "nodetool/jobs/job_core.h"
#include "nodetool/jobs/wake_target.h"
#include "resource_test_support.h"

#include <atomic>
#include <barrier>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <functional>
#include <memory>
#include <random>
#include <string>
#include <thread>
#include <utility>
#include <vector>

namespace {

using nodetool::jobs::JobOutcome;
using nodetool::jobs::JobPayload;
using nodetool::jobs::JobResult;
using nodetool::jobs::RunMailbox;
using nodetool::jobs::RunnerTracker;
using nodetool::jobs::WakeTarget;
using std::chrono::milliseconds;
using step5::Clock;
using step5::Suite;

double msSince(Clock::time_point start) {
  return std::chrono::duration<double, std::milli>(Clock::now() - start).count();
}

// A mailbox's wake target that a test destroys right after closing the
// mailbox, so a wake after close touches freed memory, which the sanitizers
// report.
//
// Thread affinity: thread-safe, `wakes` is atomic.
struct CountingWake final : WakeTarget {
  void wake() override { ++wakes; }
  std::atomic<int> wakes{0};
};

// --- mailbox ------------------------------------------------------------------

// Gate: deliver/close races. Every result is destroyed exactly once: by the
// worker when it took the result or closed the mailbox, or by the delivering
// thread, before deliver returns, when the mailbox was already closed. The
// wake target is destroyed right after close, so a wake after close would
// touch freed memory (reported under ThreadSanitizer).
void mailboxDeliverCloseRaces(Suite& t) {
  constexpr int kThreads = 8;
  constexpr int kPerThread = 32;
  constexpr int kRounds = 300;
  constexpr int kTotal = kThreads * kPerThread;
  auto tracker = std::make_shared<RunnerTracker>();
  std::mt19937 random(7);
  int wrongThread = 0, notOnce = 0, lost = 0, earlyRejectsSeen = 0, acceptedAfterClose = 0;
  for (int round = 0; round < kRounds; ++round) {
    struct Slot {
      std::atomic<int> destroyed{0};
      std::atomic<std::thread::id> where{};
      std::atomic<bool> accepted{false};
      std::atomic<bool> rejectedInline{false};
    };
    struct Probe final : JobPayload {
      explicit Probe(Slot& s) : slot(s) {}
      ~Probe() override {
        slot.where = std::this_thread::get_id();
        ++slot.destroyed;
      }
      Slot& slot;
    };
    std::vector<Slot> slots(kTotal);
    auto wake = std::make_unique<CountingWake>();
    auto mailbox = std::make_shared<RunMailbox>(*wake);
    std::barrier start(kThreads + 1);
    std::vector<std::thread> threads;
    for (int n = 0; n < kThreads; ++n) {
      threads.emplace_back([&, n] {
        start.arrive_and_wait();
        for (int k = 0; k < kPerThread; ++k) {
          const int index = n * kPerThread + k;
          JobResult result;
          result.ticket = tracker->acquire(static_cast<uint64_t>(round));
          result.id = static_cast<uint64_t>(index);
          result.outcome = JobOutcome::value(std::make_unique<Probe>(slots[index]));
          const bool accepted = mailbox->deliver(std::move(result));
          slots[index].accepted = accepted;
          if (!accepted) {
            slots[index].rejectedInline =
                slots[index].destroyed == 1 && slots[index].where.load() == std::this_thread::get_id();
          }
        }
      });
    }
    const int closeAfter = std::uniform_int_distribution<int>(0, kTotal)(random);
    start.arrive_and_wait();
    int taken = 0;
    while (taken < closeAfter) {
      if (auto result = mailbox->take()) ++taken;
    }
    (void)mailbox->close();
    wake.reset();
    for (auto& thread : threads) thread.join();
    JobResult late;
    late.outcome = step5::text("late");
    if (mailbox->deliver(std::move(late))) ++acceptedAfterClose;
    if (mailbox->take()) ++lost;
    const auto worker = std::this_thread::get_id();
    int accepted = 0;
    for (auto& slot : slots) {
      if (slot.destroyed != 1) ++notOnce;
      if (slot.accepted) {
        ++accepted;
        if (slot.where.load() != worker) ++wrongThread;
      } else {
        if (!slot.rejectedInline) ++wrongThread;
        ++earlyRejectsSeen;
      }
    }
    if (accepted < taken) ++lost;
    if (tracker->outstanding(static_cast<uint64_t>(round)) != 0) ++lost;
  }
  CHECK(notOnce == 0);
  CHECK(wrongThread == 0);
  CHECK(lost == 0);
  CHECK(acceptedAfterClose == 0);
  CHECK(tracker->outstanding() == 0);
  // The races happened: some deliveries met a closed mailbox.
  CHECK(earlyRejectsSeen > 0);
}

// --- runner tracker -------------------------------------------------------------

void trackerCountsAndWaits(Suite& t) {
  auto tracker = std::make_shared<RunnerTracker>();
  CHECK(tracker->waitIdle(Clock::now()));
  auto a = tracker->acquire(1);
  auto b = tracker->acquire(2);
  CHECK(tracker->outstanding() == 2 && tracker->outstanding(1) == 1);
  CHECK(!tracker->waitIdle(Clock::now() + milliseconds(10)));
  std::thread releaser([a = std::move(a), b = std::move(b)]() mutable {
    std::this_thread::sleep_for(milliseconds(30));
    a = {};
    b = {};
  });
  const auto waitStart = Clock::now();
  CHECK(tracker->waitIdle(Clock::now() + std::chrono::seconds(3)));
  // The last release wakes the waiter. It does not wait out the deadline.
  CHECK(msSince(waitStart) < 1000);
  releaser.join();
  CHECK(tracker->outstanding() == 0);
  // A ticket keeps the tracker alive after its owner lets go.
  std::weak_ptr<RunnerTracker> weak = tracker;
  auto held = tracker->acquire(3);
  tracker.reset();
  CHECK(!weak.expired());
  held = {};
  CHECK(weak.expired());
}

}  // namespace

int main() {
  Suite suite;
  const std::vector<std::pair<const char*, void (*)(Suite&)>> tests = {
      {"trackerCountsAndWaits", trackerCountsAndWaits},
      {"mailboxDeliverCloseRaces", mailboxDeliverCloseRaces},
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
