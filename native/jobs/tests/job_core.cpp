// The job core (docs/plans/graph-runner-async-host.md, rollout step 1):
// the runner tracker, the run mailbox, submitted jobs and their deliveries,
// the executor defaults, the inline executor and stop relays, and the test
// executor the other suites run jobs on. The graph runner's
// unittests/async_host.cpp tests the rest of step 1, which needs an engine
// or the runner's loop.
#include "nodetool/jobs/admission.h"
#include "nodetool/jobs/job_core.h"
#include "nodetool/jobs/wake_target.h"
#include "resource_test_support.h"
#include "test_executor.h"

#include <atomic>
#include <barrier>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <deque>
#include <functional>
#include <latch>
#include <map>
#include <memory>
#include <optional>
#include <random>
#include <stdexcept>
#include <stop_token>
#include <string>
#include <thread>
#include <utility>
#include <vector>

namespace {

using jobs_test::TestExecutor;
using nodetool::jobs::AdmissionLedger;
using nodetool::jobs::InlineExecutor;
using nodetool::jobs::JobDelivery;
using nodetool::jobs::JobExecutor;
using nodetool::jobs::JobOutcome;
using nodetool::jobs::JobPayload;
using nodetool::jobs::JobResult;
using nodetool::jobs::NativeJob;
using nodetool::jobs::Reservation;
using nodetool::jobs::RunAccount;
using nodetool::jobs::RunMailbox;
using nodetool::jobs::RunnerTracker;
using nodetool::jobs::StopRelay;
using nodetool::jobs::SubmittedJob;
using nodetool::jobs::WakeTarget;
using nodetool::jobs::makeJob;
using std::chrono::milliseconds;
using step5::Clock;
using step5::Suite;
using step5::TestRun;
using Kind = JobOutcome::Kind;

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
    // Thread affinity: thread-safe, every field is atomic.
    struct Slot {
      std::atomic<int> destroyed{0};
      std::atomic<std::thread::id> where{};
      std::atomic<bool> accepted{false};
      std::atomic<bool> rejectedInline{false};
    };
    // Thread affinity: one thread at a time. It moves with its result
    // through the mailbox, and the thread that takes, refuses or disposes
    // of it destroys it. `slot` outlives it: the round joins every thread
    // and drains the mailbox before the slots go.
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


// Gate: the mailbox wakes its target on every delivery and wake() while it
// is open, hands results back in delivery order, and after close() neither
// wakes nor accepts. close() returns what still waited, once.
void mailboxWakesAndOrder(Suite& t) {
  CountingWake wake;
  RunMailbox mailbox(wake);
  CHECK(!mailbox.pending() && !mailbox.closed());
  CHECK(!mailbox.take());
  for (uint64_t id : {3, 1, 2}) {
    JobResult result;
    result.id = id;
    CHECK(mailbox.deliver(std::move(result)));
  }
  CHECK(wake.wakes.load() == 3);
  mailbox.wake();
  CHECK(wake.wakes.load() == 4);
  CHECK(mailbox.pending());
  CHECK(mailbox.take()->id == 3);
  CHECK(mailbox.take()->id == 1);
  std::deque<JobResult> waiting = mailbox.close();
  CHECK(waiting.size() == 1 && waiting.front().id == 2);
  CHECK(mailbox.closed() && !mailbox.pending());
  CHECK(mailbox.close().empty());
  JobResult late;
  late.id = 9;
  CHECK(!mailbox.deliver(std::move(late)));
  mailbox.wake();
  CHECK(wake.wakes.load() == 4);
  CHECK(!mailbox.take());
}

// Gate: tickets across threads. Threads take tickets for their own runs and
// a shared one, share and move-assign them, and the counts per run and in
// total are exact at every barrier phase. Move-assigning releases the
// ticket it replaces, an empty ticket shares nothing, and waitIdle()
// returns as soon as the last ticket goes on another thread.
void trackerTicketsAcrossThreads(Suite& t) {
  constexpr int kThreads = 6;
  constexpr int kPerThread = 50;
  auto tracker = std::make_shared<RunnerTracker>();
  RunnerTracker::Ticket empty;
  CHECK(!empty && !empty.share());
  std::barrier phase(kThreads + 1);
  std::latch release(1);
  std::vector<std::thread> threads;
  for (int n = 0; n < kThreads; ++n) {
    threads.emplace_back([&, n] {
      const uint64_t own = 100 + static_cast<uint64_t>(n);
      std::vector<RunnerTracker::Ticket> held;
      for (int i = 0; i < kPerThread; ++i) held.push_back(tracker->acquire(own));
      held.push_back(tracker->acquire(1));
      phase.arrive_and_wait();  // 1: counted
      phase.arrive_and_wait();  // 2: checked
      // Sharing adds one per ticket, then move-assigning each share over its
      // original releases the original.
      for (int i = 0; i < kPerThread; ++i) {
        RunnerTracker::Ticket copy = held[i].share();
        CHECK(copy.run() == own);
        held[i] = std::move(copy);
        CHECK(!copy);
      }
      phase.arrive_and_wait();  // 3: still counted once each
      phase.arrive_and_wait();  // 4: checked
      release.wait();
      held.clear();
    });
  }
  phase.arrive_and_wait();
  CHECK(tracker->outstanding() == kThreads * (kPerThread + 1));
  CHECK(tracker->outstanding(1) == kThreads);
  for (int n = 0; n < kThreads; ++n) CHECK(tracker->outstanding(100 + n) == kPerThread);
  phase.arrive_and_wait();
  phase.arrive_and_wait();
  CHECK(tracker->outstanding() == kThreads * (kPerThread + 1));
  for (int n = 0; n < kThreads; ++n) CHECK(tracker->outstanding(100 + n) == kPerThread);
  phase.arrive_and_wait();
  CHECK(!tracker->waitIdle(Clock::now()));
  release.count_down();
  CHECK(tracker->waitIdle(Clock::now() + std::chrono::seconds(30)));
  for (auto& thread : threads) thread.join();
  CHECK(tracker->outstanding() == 0 && tracker->outstanding(1) == 0 && tracker->outstanding(100) == 0);
}

// What a test job or payload reports about itself, shared between the test
// and the objects that report.
//
// Thread affinity: thread-safe, every field is atomic.
struct Witness {
  std::atomic<int> runs{0};
  std::atomic<int> destroyed{0};
  std::atomic<std::thread::id> destroyedOn{};
  // What the job's input saw when it was destroyed.
  std::atomic<int> resultsWaitingAtDestruction{-1};
  std::atomic<bool> stopSeen{false};
};

// A Value payload that reports where it is destroyed.
//
// Thread affinity: one thread at a time. It moves with its result through
// the mailbox, from the delivering thread to the thread that takes or
// disposes of it, and that thread destroys it. The witness is thread-safe.
struct WitnessPayload final : JobPayload {
  explicit WitnessPayload(std::shared_ptr<Witness> w) : witness(std::move(w)) {}
  ~WitnessPayload() override {
    witness->destroyedOn = std::this_thread::get_id();
    ++witness->destroyed;
  }
  std::shared_ptr<Witness> witness;
};

// One run's side of hand-made submitted jobs: a mailbox, a tracker, an
// admission account and a stop source. Results are taken by the test.
//
// Thread affinity: the test's thread. The mailbox, tracker and ledger are
// thread-safe, so jobs and deliveries may use them from other threads.
struct RunSide {
  static constexpr uint64_t kRun = 7;

  RunSide() = default;
  ~RunSide() { (void)mailbox->close(); }
  RunSide(const RunSide&) = delete;
  RunSide& operator=(const RunSide&) = delete;

  Reservation charge(uint64_t bytes) {
    Reservation reservation(account);
    reservation.reserveSnapshot(bytes);
    return reservation;
  }
  SubmittedJob submitted(uint64_t id, std::unique_ptr<NativeJob> job, uint64_t bytes = 0) {
    return SubmittedJob(id, std::move(job), mailbox, stop.get_token(), tracker->acquire(kRun),
                        bytes ? charge(bytes) : Reservation{});
  }
  uint64_t charged() const { return ledger->usage().bytes; }

  // Declared before the mailbox, which holds it until the destructor
  // closes the mailbox.
  CountingWake wake;
  // Shared with every job, as AsyncRun shares them.
  std::shared_ptr<RunMailbox> mailbox = std::make_shared<RunMailbox>(wake);
  std::shared_ptr<RunnerTracker> tracker = std::make_shared<RunnerTracker>();
  std::shared_ptr<AdmissionLedger> ledger = std::make_shared<AdmissionLedger>();
  std::shared_ptr<RunAccount> account = ledger->openRunner()->openRun();
  std::stop_source stop;
};

// A job input that records, when destroyed, how many results its run's
// mailbox held. A weak reference, so the input never keeps the mailbox.
//
// Thread affinity: one thread at a time. It moves into its job, and the
// thread that runs, cancels or disposes of the job destroys it. The witness
// is thread-safe and RunMailbox::pending() takes the mailbox mutex.
struct Input {
  Input(std::shared_ptr<Witness> w, std::weak_ptr<RunMailbox> m) : witness(std::move(w)), mailbox(std::move(m)) {}
  Input(Input&&) = default;
  ~Input() {
    if (!witness) return;
    auto box = mailbox.lock();
    witness->resultsWaitingAtDestruction = box && box->pending() ? 1 : 0;
    ++witness->destroyed;
  }
  std::shared_ptr<Witness> witness;
  std::weak_ptr<RunMailbox> mailbox;
};

std::string textOf(const JobResult& result) {
  auto* payload = dynamic_cast<const TestRun::TextPayload*>(result.outcome.payload.get());
  return payload ? payload->text : std::string();
}

// Gate: execute() runs the job with the token it is given, destroys the
// job's inputs before its result reaches the mailbox, and delivers a Value
// under the job's id that carries the job's ticket and reservation until
// the result is destroyed.
void executeDeliversAfterTheInputs(Suite& t) {
  RunSide side;
  auto witness = std::make_shared<Witness>();
  std::stop_source other;
  other.request_stop();
  SubmittedJob job = side.submitted(
      41,
      makeJob([witness, input = Input(witness, side.mailbox)](std::stop_token stop) {
        ++witness->runs;
        witness->stopSeen = stop.stop_requested();
        return step5::text("done");
      }),
      64);
  CHECK(side.tracker->outstanding(RunSide::kRun) == 1);
  CHECK(side.charged() == 64);
  CHECK(job.execute(other.get_token()));
  CHECK(witness->runs.load() == 1 && witness->stopSeen.load());
  CHECK(witness->destroyed.load() == 1);
  CHECK(witness->resultsWaitingAtDestruction.load() == 0);
  CHECK(side.wake.wakes.load() == 1);
  std::optional<JobResult> result = side.mailbox->take();
  CHECK(result && result->id == 41 && result->outcome.kind == Kind::Value && textOf(*result) == "done");
  CHECK(side.tracker->outstanding(RunSide::kRun) == 1);
  CHECK(side.charged() == 64);
  CHECK(result->reservation && result->ticket);
  result.reset();
  CHECK(side.tracker->outstanding() == 0);
  CHECK(side.charged() == 0);
  // execute() without a token runs the job with the run's stop.
  side.stop.request_stop();
  SubmittedJob second = side.submitted(42, makeJob([witness](std::stop_token stop) {
                                         witness->stopSeen = stop.stop_requested();
                                         return JobOutcome::value(nullptr);
                                       }));
  witness->stopSeen = false;
  CHECK(second.execute());
  CHECK(witness->stopSeen.load());
}

// Gate: a job that throws fails with the exception's message, or with a
// generic message for something that is not a std::exception. The result
// still carries the ticket.
void throwingJobsFail(Suite& t) {
  RunSide side;
  SubmittedJob thrower = side.submitted(1, makeJob([](std::stop_token) -> JobOutcome {
                                          throw std::runtime_error("the codec broke");
                                        }));
  SubmittedJob other = side.submitted(2, makeJob([](std::stop_token) -> JobOutcome { throw 42; }));
  CHECK(thrower.execute());
  CHECK(other.execute());
  std::optional<JobResult> first = side.mailbox->take();
  std::optional<JobResult> second = side.mailbox->take();
  CHECK(first && first->outcome.kind == Kind::Error && first->outcome.error == "the codec broke");
  CHECK(second && second->outcome.kind == Kind::Error && second->outcome.error == "native job failed");
  CHECK(first->ticket && side.tracker->outstanding() == 2);
}

// A job whose start() returns nothing and leaves its delivery.
//
// Thread affinity: the thread that executes it. It holds no state.
struct SilentJob final : NativeJob {
  JobOutcome run(std::stop_token) override { return JobOutcome::failure("run() is not called"); }
  std::optional<JobOutcome> start(std::stop_token, JobDelivery&) override { return std::nullopt; }
};

// Gate: a job that returns no outcome without taking its delivery fails
// with an Error, so its promise still settles.
void startWithoutResultFails(Suite& t) {
  RunSide side;
  SubmittedJob job = side.submitted(5, std::make_unique<SilentJob>(), 8);
  CHECK(job.execute());
  std::optional<JobResult> result = side.mailbox->take();
  CHECK(result && result->id == 5 && result->outcome.kind == Kind::Error);
  CHECK(result && result->outcome.error == "the native job delivered no result");
  CHECK(side.charged() == 8);
  result.reset();
  CHECK(side.charged() == 0 && side.tracker->outstanding() == 0);
}

// A job that takes its delivery and hands it to the test, which delivers
// through it later from another thread.
//
// Thread affinity: the executor thread. `slot` is shared with the test,
// which reads it only after execute() returned.
struct LateJob final : NativeJob {
  explicit LateJob(std::shared_ptr<std::optional<JobDelivery>> s) : slot(std::move(s)) {}
  JobOutcome run(std::stop_token) override { return JobOutcome::failure("run() is not called"); }
  std::optional<JobOutcome> start(std::stop_token, JobDelivery& delivery) override {
    slot->emplace(std::move(delivery));
    return std::nullopt;
  }
  std::shared_ptr<std::optional<JobDelivery>> slot;
};

// Gate: a job that takes its JobDelivery finishes later. execute() returns
// true and delivers nothing. The delivery keeps the job's ticket and
// reservation, sees the run's stop, and delivers once from another thread
// under the job's id. retain() and retainReservation() keep the ticket and
// the charge after the result is gone, until they are dropped.
void lateDeliveryFromAnotherThread(Suite& t) {
  RunSide side;
  auto slot = std::make_shared<std::optional<JobDelivery>>();
  SubmittedJob job = side.submitted(77, std::make_unique<LateJob>(slot), 32);
  CHECK(job.execute());
  CHECK(slot->has_value() && static_cast<bool>(**slot));
  CHECK(!side.mailbox->pending());
  CHECK(side.tracker->outstanding(RunSide::kRun) == 1);
  CHECK(side.charged() == 32);
  RunnerTracker::Ticket extra = (*slot)->retain();
  Reservation keep = (*slot)->retainReservation();
  CHECK(side.tracker->outstanding(RunSide::kRun) == 2);
  CHECK(!(*slot)->runStop().stop_requested());
  side.stop.request_stop();
  CHECK((*slot)->runStop().stop_requested());
  std::latch go(1);
  std::atomic<bool> accepted{false};
  std::thread deliverer([&] {
    go.wait();
    accepted = (*slot)->deliver(step5::text("late"));
    // Empty now: destroying it delivers nothing more.
    slot->reset();
  });
  CHECK(!side.mailbox->pending());
  go.count_down();
  deliverer.join();
  CHECK(accepted.load());
  std::optional<JobResult> result = side.mailbox->take();
  CHECK(result && result->id == 77 && result->outcome.kind == Kind::Value && textOf(*result) == "late");
  CHECK(!side.mailbox->take());
  result.reset();
  CHECK(side.tracker->outstanding(RunSide::kRun) == 1);
  CHECK(side.charged() == 32);
  extra = {};
  CHECK(side.tracker->outstanding() == 0);
  keep = {};
  CHECK(side.charged() == 0);
}

// Gate: a delivery destroyed without delivering delivers an Error, on the
// destroying thread, and a moved-from delivery delivers nothing.
void undeliveredDeliveryFails(Suite& t) {
  RunSide side;
  auto slot = std::make_shared<std::optional<JobDelivery>>();
  SubmittedJob job = side.submitted(8, std::make_unique<LateJob>(slot), 16);
  CHECK(job.execute());
  std::optional<JobDelivery> moved(std::move(**slot));
  CHECK(!**slot && static_cast<bool>(*moved));
  slot->reset();
  CHECK(!side.mailbox->pending());
  std::thread dropper([&] { moved.reset(); });
  dropper.join();
  std::optional<JobResult> result = side.mailbox->take();
  CHECK(result && result->id == 8 && result->outcome.kind == Kind::Error);
  CHECK(result && result->outcome.error == "the native job delivered no result");
  CHECK(!side.mailbox->take());
  result.reset();
  CHECK(side.charged() == 0 && side.tracker->outstanding() == 0);
}

// Gate: a result delivered to a closed mailbox is refused and destroyed on
// the delivering thread before deliver() returns, with its ticket and
// reservation: by execute(), by a late JobDelivery on another thread and by
// cancel().
void closedMailboxDestroysOnTheDeliveringThread(Suite& t) {
  RunSide side;
  auto executed = std::make_shared<Witness>();
  auto late = std::make_shared<Witness>();
  auto slot = std::make_shared<std::optional<JobDelivery>>();
  SubmittedJob running = side.submitted(1, std::make_unique<LateJob>(slot), 10);
  CHECK(running.execute());
  SubmittedJob direct = side.submitted(2, makeJob([executed](std::stop_token) {
                                         return JobOutcome::value(std::make_unique<WitnessPayload>(executed));
                                       }),
                                       20);
  SubmittedJob cancelled = side.submitted(3, makeJob([](std::stop_token) { return JobOutcome::value(nullptr); }), 30);
  CHECK(side.charged() == 60);
  CHECK(side.mailbox->close().empty());
  const int wakes = side.wake.wakes.load();
  CHECK(!direct.execute());
  CHECK(executed->destroyed.load() == 1 && executed->destroyedOn.load() == std::this_thread::get_id());
  CHECK(side.charged() == 40);
  std::thread::id lateThread;
  std::atomic<bool> accepted{true};
  std::thread deliverer([&] {
    lateThread = std::this_thread::get_id();
    accepted = (*slot)->deliver(JobOutcome::value(std::make_unique<WitnessPayload>(late)));
    // Destroyed before deliver() returned.
    CHECK(late->destroyed.load() == 1);
  });
  deliverer.join();
  CHECK(!accepted.load());
  CHECK(late->destroyedOn.load() == lateThread);
  CHECK(side.charged() == 30);
  CHECK(!cancelled.cancel());
  CHECK(side.charged() == 0);
  CHECK(side.tracker->outstanding() == 0);
  CHECK(side.wake.wakes.load() == wakes);
}

// Gate: cancel() destroys the job without running it and delivers a
// Stopped outcome, or the outcome it is given, in its place. The result
// carries the job's ticket and reservation.
void cancelDeliversInPlace(Suite& t) {
  RunSide side;
  auto witness = std::make_shared<Witness>();
  auto job = [&] {
    return makeJob([witness, input = Input(witness, side.mailbox)](std::stop_token) {
      ++witness->runs;
      return JobOutcome::value(nullptr);
    });
  };
  SubmittedJob first = side.submitted(1, job(), 10);
  SubmittedJob second = side.submitted(2, job(), 20);
  CHECK(first.cancel());
  CHECK(witness->destroyed.load() == 1 && witness->resultsWaitingAtDestruction.load() == 0);
  CHECK(second.cancel(JobOutcome::failure("the host is closed")));
  CHECK(witness->destroyed.load() == 2 && witness->runs.load() == 0);
  std::optional<JobResult> stopped = side.mailbox->take();
  std::optional<JobResult> failed = side.mailbox->take();
  CHECK(stopped && stopped->id == 1 && stopped->outcome.kind == Kind::Stopped && stopped->outcome.error.empty());
  CHECK(failed && failed->id == 2 && failed->outcome.kind == Kind::Error &&
        failed->outcome.error == "the host is closed");
  CHECK(side.tracker->outstanding() == 2 && side.charged() == 30);
  stopped.reset();
  CHECK(side.tracker->outstanding() == 1 && side.charged() == 20);
  failed.reset();
  CHECK(side.tracker->outstanding() == 0 && side.charged() == 0);
}

// Gate: refuse() delivers its outcome without the job's ticket or
// reservation, and keeps the job, so its inputs can be destroyed on another
// thread. The ticket and the charge go only with the job.
void refuseKeepsTheJob(Suite& t) {
  RunSide side;
  auto witness = std::make_shared<Witness>();
  std::optional<SubmittedJob> job(side.submitted(
      4, makeJob([witness, input = Input(witness, side.mailbox)](std::stop_token) { return JobOutcome::value(nullptr); }),
      12));
  CHECK(!job->detached());
  CHECK(job->refuse(JobOutcome{Kind::Stopped, nullptr, "the lane is shut down"}));
  CHECK(witness->destroyed.load() == 0);
  std::optional<JobResult> result = side.mailbox->take();
  CHECK(result && result->id == 4 && result->outcome.kind == Kind::Stopped &&
        result->outcome.error == "the lane is shut down");
  CHECK(result && !result->ticket && !result->reservation);
  result.reset();
  CHECK(side.tracker->outstanding() == 1 && side.charged() == 12);
  std::thread disposer([&] { job.reset(); });
  disposer.join();
  CHECK(witness->destroyed.load() == 1);
  CHECK(side.tracker->outstanding() == 0 && side.charged() == 0);
}

// A detached job that reports its refusal, or throws from refused().
//
// Thread affinity: the thread that refuses it. `seen` is shared with the
// test.
struct ReportingJob final : NativeJob {
  ReportingJob(std::shared_ptr<std::vector<std::string>> s, bool t) : seen(std::move(s)), throws(t) {}
  JobOutcome run(std::stop_token) override { return JobOutcome::value(nullptr); }
  void refused(const JobOutcome& outcome) override {
    seen->push_back(outcome.error);
    if (throws) throw std::runtime_error("the report failed");
  }
  std::shared_ptr<std::vector<std::string>> seen;
  bool throws;
};

// Gate: a job without a mailbox is detached. Refusing it calls
// NativeJob::refused() with the outcome and returns false, and an exception
// from refused() stays inside refuse(). What execute() produces is
// destroyed on the calling thread, and cancel() returns false. The ticket
// is released with whatever holds it last.
void detachedJobs(Suite& t) {
  auto tracker = std::make_shared<RunnerTracker>();
  auto seen = std::make_shared<std::vector<std::string>>();
  for (bool throws : {false, true}) {
    SubmittedJob job(1, std::make_unique<ReportingJob>(seen, throws), nullptr, {}, tracker->acquire(1));
    CHECK(job.detached());
    CHECK(!job.refuse(JobOutcome::failure(throws ? "second" : "first")));
  }
  CHECK((*seen == std::vector<std::string>{"first", "second"}));
  CHECK(tracker->outstanding() == 0);
  // The default refused() does nothing.
  SubmittedJob quiet(2, makeJob([](std::stop_token) { return JobOutcome::value(nullptr); }), nullptr, {},
                     tracker->acquire(1));
  CHECK(!quiet.refuse(JobOutcome::failure("ignored")));
  auto witness = std::make_shared<Witness>();
  SubmittedJob run(3, makeJob([witness](std::stop_token) {
                     ++witness->runs;
                     return JobOutcome::value(std::make_unique<WitnessPayload>(witness));
                   }),
                   nullptr, {}, tracker->acquire(1));
  CHECK(tracker->outstanding() == 2);
  CHECK(run.execute());
  CHECK(witness->runs.load() == 1 && witness->destroyed.load() == 1);
  CHECK(witness->destroyedOn.load() == std::this_thread::get_id());
  CHECK(tracker->outstanding() == 1);
  SubmittedJob cancelled(4, makeJob([](std::stop_token) { return JobOutcome::value(nullptr); }), nullptr, {},
                         tracker->acquire(1));
  CHECK(!cancelled.cancel());
  CHECK(tracker->outstanding() == 2);
}

// An executor that keeps only the defaults of JobExecutor.
//
// Thread affinity: the test's thread.
struct DefaultExecutor final : JobExecutor {
  void submit(SubmittedJob job) override { (void)job; }
};

// Gate: the JobExecutor defaults and the inline executor. The default stop
// relay requests stop and releases what it keeps on the calling thread
// before relay() returns. dispose() and disposeUnrun() destroy on the
// calling thread, discardStopped() discards nothing, and attach()/detach()
// do nothing. InlineExecutor runs a job at submission and delivers through
// the mailbox.
void executorDefaultsAndStopRelay(Suite& t) {
  DefaultExecutor executor;
  std::shared_ptr<StopRelay> relay = executor.stopRelay();
  std::stop_source source;
  std::atomic<std::thread::id> callbackThread{};
  std::stop_callback onStop(source.get_token(), [&] { callbackThread = std::this_thread::get_id(); });
  auto kept = std::make_shared<int>(1);
  std::weak_ptr<int> watch = kept;
  relay->relay(source, std::move(kept));
  CHECK(source.stop_requested());
  CHECK(callbackThread.load() == std::this_thread::get_id());
  CHECK(watch.expired());
  CHECK(executor.discardStopped() == 0);
  executor.attach();
  executor.detach();

  RunSide side;
  auto witness = std::make_shared<Witness>();
  std::deque<JobResult> results;
  results.emplace_back();
  results.back().outcome = JobOutcome::value(std::make_unique<WitnessPayload>(witness));
  results.back().ticket = side.tracker->acquire(RunSide::kRun);
  executor.dispose(std::move(results));
  CHECK(witness->destroyed.load() == 1 && witness->destroyedOn.load() == std::this_thread::get_id());
  executor.disposeUnrun(side.submitted(1, makeJob([witness, input = Input(witness, side.mailbox)](std::stop_token) {
                                         return JobOutcome::value(nullptr);
                                       }),
                                       5));
  CHECK(witness->destroyed.load() == 2);
  CHECK(side.tracker->outstanding() == 0 && side.charged() == 0);

  InlineExecutor inlineJobs;
  std::atomic<std::thread::id> ranOn{};
  inlineJobs.submit(side.submitted(9, makeJob([&ranOn](std::stop_token) {
                                     ranOn = std::this_thread::get_id();
                                     return step5::text("inline");
                                   })));
  CHECK(ranOn.load() == std::this_thread::get_id());
  std::optional<JobResult> result = side.mailbox->take();
  CHECK(result && result->id == 9 && textOf(*result) == "inline");
}

// Gate: the test executor the other suites depend on. Jobs run on its
// workers in FIFO order, see their run's stop, and are counted.
// discardStopped() drops queued jobs whose run stopped without a result.
// dispose(), disposeUnrun() and relayed stops run on the reaper. Shutdown
// cancels what is still queued with a Stopped outcome, and a relay that
// outlives the executor relays on the calling thread.
void testExecutorContract(Suite& t) {
  std::shared_ptr<StopRelay> relay;
  RunSide side;
  auto order = std::make_shared<std::vector<uint64_t>>();
  auto threads = std::make_shared<std::vector<std::thread::id>>();
  auto hold = std::make_shared<step5::Gate>();
  auto first = std::make_shared<step5::Gate>();
  std::stop_source stopped;
  stopped.request_stop();
  {
    TestExecutor lane(1);
    relay = lane.stopRelay();
    // The first job holds the only worker while the test queues more.
    lane.submit(side.submitted(1, makeJob([hold, first, order, threads](std::stop_token) {
                                 first->release();
                                 hold->wait();
                                 order->push_back(1);
                                 threads->push_back(std::this_thread::get_id());
                                 return JobOutcome::value(nullptr);
                               })));
    for (uint64_t id : {2, 3, 4}) {
      lane.submit(side.submitted(id, makeJob([id, order, threads](std::stop_token) {
                                   order->push_back(id);
                                   threads->push_back(std::this_thread::get_id());
                                   return JobOutcome::value(nullptr);
                                 })));
    }
    first->wait();
    lane.submit(SubmittedJob(5, makeJob([](std::stop_token) { return JobOutcome::value(nullptr); }), side.mailbox,
                             stopped.get_token(), side.tracker->acquire(RunSide::kRun)));
    CHECK(lane.discardStopped() == 1);
    CHECK(lane.queued() == 3);
    hold->release();
    lane.quiesce();
    CHECK((*order == std::vector<uint64_t>{1, 2, 3, 4}));
    for (const auto& id : *threads) CHECK(lane.isWorker(id) && id != std::this_thread::get_id());
    CHECK(lane.executed() == 4 && lane.submitted() == 5);

    auto witness = std::make_shared<Witness>();
    std::deque<JobResult> results;
    results.emplace_back();
    results.back().outcome = JobOutcome::value(std::make_unique<WitnessPayload>(witness));
    lane.dispose(std::move(results));
    std::stop_source relayed;
    std::atomic<std::thread::id> relayThread{};
    std::stop_callback onStop(relayed.get_token(), [&] { relayThread = std::this_thread::get_id(); });
    relay->relay(relayed, nullptr);
    lane.quiesce();
    CHECK(witness->destroyedOn.load() == lane.reaperThread());
    CHECK(relayThread.load() == lane.reaperThread());
    CHECK(lane.disposedResults() == 1 && lane.relayed() == 1);

    // Queued behind a held worker when the executor shuts down.
    auto blocker = std::make_shared<step5::Gate>();
    auto entered = std::make_shared<step5::Gate>();
    lane.submit(side.submitted(6, makeJob([blocker, entered](std::stop_token stop) {
                                 entered->release();
                                 // Released by the shutdown's stop.
                                 if (!blocker->wait(stop)) return JobOutcome::stopped();
                                 return JobOutcome::value(nullptr);
                               })));
    lane.submit(side.submitted(7, makeJob([](std::stop_token) { return JobOutcome::value(nullptr); })));
    entered->wait();
  }
  // The reaper requests job 6's stop before it cancels job 7, but job 6's
  // worker delivers its Stopped result after that, so the two may arrive in
  // either order.
  std::map<uint64_t, std::string> errors;
  std::vector<uint64_t> ids;
  while (auto result = side.mailbox->take()) {
    ids.push_back(result->id);
    errors[result->id] = result->outcome.error;
  }
  CHECK(ids.size() == 6 && (std::vector<uint64_t>(ids.begin(), ids.begin() + 4) == std::vector<uint64_t>{1, 2, 3, 4}));
  CHECK(errors.size() == 6 && errors.count(6) == 1 && errors[7] == "the test executor shut down");
  std::stop_source after;
  std::atomic<std::thread::id> afterThread{};
  std::stop_callback onAfter(after.get_token(), [&] { afterThread = std::this_thread::get_id(); });
  relay->relay(after, nullptr);
  CHECK(afterThread.load() == std::this_thread::get_id());
}

// A job input that records the thread that destroys it.
//
// Thread affinity: one thread at a time. It moves into its job, and the
// thread that runs, cancels or destroys the job destroys it. The witness is
// thread-safe.
struct ThreadNote {
  explicit ThreadNote(std::shared_ptr<Witness> w) : witness(std::move(w)) {}
  ThreadNote(ThreadNote&& other) noexcept : witness(std::move(other.witness)) {}
  ThreadNote(const ThreadNote&) = delete;
  ThreadNote& operator=(const ThreadNote&) = delete;
  ThreadNote& operator=(ThreadNote&&) = delete;
  ~ThreadNote() {
    if (!witness) return;
    witness->destroyedOn = std::this_thread::get_id();
    ++witness->destroyed;
  }
  std::shared_ptr<Witness> witness;
};

// A job that counts its runs and owns a ThreadNote.
std::unique_ptr<NativeJob> notedJob(const std::shared_ptr<Witness>& witness) {
  return makeJob([witness, note = ThreadNote(witness)](std::stop_token) {
    ++witness->runs;
    return JobOutcome::value(nullptr);
  });
}

// A job that registers a stop callback recording the thread that runs it,
// opens `entered`, and returns Stopped once its stop was requested.
std::unique_ptr<NativeJob> stopNotingJob(std::shared_ptr<std::atomic<std::thread::id>> callbackThread,
                                         std::shared_ptr<step5::Gate> entered) {
  return makeJob([callbackThread, entered](std::stop_token stop) {
    std::stop_callback onStop(stop, [callbackThread] { *callbackThread = std::this_thread::get_id(); });
    entered->release();
    step5::Gate never;
    (void)never.wait(stop);
    return JobOutcome::stopped();
  });
}

// Gate: the test executor keeps the graph runner lane's thread rules
// (ThreadPoolExecutor in native/graph-runner/src/kernel/host_lanes.cpp), so
// the suites that run on it see job code where the lane runs it.
// discardStopped() hands a stopped queued job to the reaper, which
// destroys it unrun. A worker that dequeues a job whose run stopped
// destroys it there, without running or delivering it. A running job's
// stop callbacks run on the reaper when its run stops, and when the
// executor shuts down, and shutdown cancels and destroys queued jobs on
// the reaper.
void testExecutorThreadsMatchTheLane(Suite& t) {
  const std::thread::id test = std::this_thread::get_id();
  RunSide side;
  std::stop_source stoppedRun;
  stoppedRun.request_stop();
  auto stoppedJob = [&](uint64_t id, const std::shared_ptr<Witness>& witness) {
    return SubmittedJob(id, notedJob(witness), side.mailbox, stoppedRun.get_token(),
                        side.tracker->acquire(RunSide::kRun));
  };

  // discardStopped(): destroyed on the reaper, never run.
  {
    TestExecutor lane(1);
    auto hold = std::make_shared<step5::Gate>();
    auto entered = std::make_shared<step5::Gate>();
    lane.submit(side.submitted(1, makeJob([hold, entered](std::stop_token) {
                                 entered->release();
                                 hold->wait();
                                 return JobOutcome::value(nullptr);
                               })));
    entered->wait();
    auto discarded = std::make_shared<Witness>();
    lane.submit(stoppedJob(2, discarded));
    CHECK(lane.discardStopped() == 1);
    hold->release();
    lane.quiesce();
    CHECK(discarded->destroyed.load() == 1 && discarded->runs.load() == 0);
    CHECK(discarded->destroyedOn.load() == lane.reaperThread());
    CHECK(lane.discarded() == 1 && lane.executed() == 1);
  }
  std::optional<JobResult> first = side.mailbox->take();
  CHECK(first && first->id == 1 && !side.mailbox->take());
  first.reset();
  CHECK(side.tracker->outstanding() == 0);

  // A worker dequeues a job whose run already stopped: destroyed on that
  // worker, never run and never delivered.
  {
    TestExecutor lane(1);
    auto dropped = std::make_shared<Witness>();
    lane.submit(stoppedJob(3, dropped));
    lane.quiesce();
    CHECK(dropped->destroyed.load() == 1 && dropped->runs.load() == 0);
    CHECK(lane.isWorker(dropped->destroyedOn.load()));
    CHECK(lane.dropped() == 1 && lane.executed() == 0);
    CHECK(!side.mailbox->take() && side.tracker->outstanding() == 0);
  }

  // A running job's run stops on the test's thread: its stop callback runs
  // on the reaper.
  {
    TestExecutor lane(1);
    std::stop_source run;
    auto callbackThread = std::make_shared<std::atomic<std::thread::id>>();
    auto entered = std::make_shared<step5::Gate>();
    lane.submit(SubmittedJob(4, stopNotingJob(callbackThread, entered), side.mailbox, run.get_token(),
                             side.tracker->acquire(RunSide::kRun)));
    entered->wait();
    run.request_stop();
    lane.quiesce();
    CHECK(callbackThread->load() == lane.reaperThread() && callbackThread->load() != test);
    CHECK(lane.forwarded() == 1 && lane.executed() == 1);
  }
  std::optional<JobResult> fourth = side.mailbox->take();
  CHECK(fourth && fourth->id == 4 && fourth->outcome.kind == Kind::Stopped);
  fourth.reset();

  // Shutdown: the running job's stop callback runs on the reaper, and the
  // queued job is cancelled and destroyed there.
  auto callbackThread = std::make_shared<std::atomic<std::thread::id>>();
  auto queued = std::make_shared<Witness>();
  std::thread::id reaper;
  {
    TestExecutor lane(1);
    reaper = lane.reaperThread();
    auto entered = std::make_shared<step5::Gate>();
    lane.submit(side.submitted(5, stopNotingJob(callbackThread, entered)));
    lane.submit(side.submitted(6, notedJob(queued)));
    entered->wait();
  }
  CHECK(callbackThread->load() == reaper && callbackThread->load() != test);
  CHECK(queued->destroyed.load() == 1 && queued->runs.load() == 0 && queued->destroyedOn.load() == reaper);
  std::map<uint64_t, JobResult> results;
  while (auto result = side.mailbox->take()) results.emplace(result->id, std::move(*result));
  CHECK(results.size() == 2 && results.count(5) == 1 && results.count(6) == 1);
  CHECK(results.count(5) == 1 && results.at(5).outcome.kind == Kind::Stopped);
  CHECK(results.count(6) == 1 && results.at(6).outcome.error == "the test executor shut down");
  results.clear();
  CHECK(side.tracker->outstanding() == 0);
}

}  // namespace

int main() {
  Suite suite;
  const std::vector<std::pair<const char*, void (*)(Suite&)>> tests = {
      {"trackerCountsAndWaits", trackerCountsAndWaits},
      {"mailboxDeliverCloseRaces", mailboxDeliverCloseRaces},
      {"mailboxWakesAndOrder", mailboxWakesAndOrder},
      {"trackerTicketsAcrossThreads", trackerTicketsAcrossThreads},
      {"executeDeliversAfterTheInputs", executeDeliversAfterTheInputs},
      {"throwingJobsFail", throwingJobsFail},
      {"startWithoutResultFails", startWithoutResultFails},
      {"lateDeliveryFromAnotherThread", lateDeliveryFromAnotherThread},
      {"undeliveredDeliveryFails", undeliveredDeliveryFails},
      {"closedMailboxDestroysOnTheDeliveringThread", closedMailboxDestroysOnTheDeliveringThread},
      {"cancelDeliversInPlace", cancelDeliversInPlace},
      {"refuseKeepsTheJob", refuseKeepsTheJob},
      {"detachedJobs", detachedJobs},
      {"executorDefaultsAndStopRelay", executorDefaultsAndStopRelay},
      {"testExecutorContract", testExecutorContract},
      {"testExecutorThreadsMatchTheLane", testExecutorThreadsMatchTheLane},
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
