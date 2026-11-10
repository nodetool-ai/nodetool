// Resource control blocks (docs/plans/graph-runner-async-host.md, sections
// 4.4 and 4.8): the states, leases, the serial queue, operation contexts,
// abort, the ports, where and when the body is destroyed, and the exact
// disposal and admission counts, on an inline executor and on the test
// executor (test_executor.h). resource_lanes.cpp holds the concurrent
// retirement and stop tests. The graph runner's unittests/resource_control.cpp
// tests a lane's timed shutdown and submission through AsyncRun.
#include "nodetool/jobs/admission.h"
#include "nodetool/jobs/job_core.h"
#include "nodetool/jobs/resource_control.h"
#include "nodetool/jobs/session_stop.h"
#include "resource_test_support.h"
#include "test_executor.h"

#include <atomic>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <deque>
#include <memory>
#include <optional>
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
using nodetool::jobs::JobOutcome;
using nodetool::jobs::NativeJob;
using nodetool::jobs::Reservation;
using nodetool::jobs::ResourceControl;
using nodetool::jobs::ResourceLease;
using nodetool::jobs::ResourceOperationContext;
using nodetool::jobs::RunAccount;
using nodetool::jobs::SubmittedJob;
using step5::Gate;
using step5::Probe;
using step5::SessionBody;
using step5::Suite;
using step5::TestBody;
using step5::TestRun;
using step5::contains;
using step5::record;
using step5::text;
using Kind = JobOutcome::Kind;
using State = ResourceControl::State;

// An operation that reports it started, then waits on `gate` or its stop.
std::unique_ptr<NativeJob> held(const std::shared_ptr<ResourceControl>& control, std::string tag,
                                std::shared_ptr<Gate> started, std::shared_ptr<Gate> gate) {
  return control->operation<TestBody>([tag, started, gate](TestBody& body, ResourceOperationContext& context) {
    body.probe->note(tag + " started");
    started->release();
    if (!gate->wait(context.stop())) return JobOutcome::stopped();
    body.probe->note(tag);
    return text(tag);
  });
}

// A charge of `bytes` on `account`, for an operation's reservation.
Reservation charge(const std::shared_ptr<RunAccount>& account, uint64_t bytes) {
  Reservation reservation(account);
  reservation.reserveSnapshot(bytes);
  return reservation;
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

// --- states and leases ----------------------------------------------------------------

// Gate: states and leases. Leases are granted while Open and counted. A
// moved lease leaves its source empty, move assignment releases the lease
// it replaces, and release() is idempotent. close() moves to Retiring, and
// the control retires when the last lease goes, which hands the body to the
// lane's reaper once. close() and abort() do nothing after that.
void statesAndLeases(Suite& t) {
  TestExecutor lane(1);
  auto probe = std::make_shared<Probe>();
  auto control = ResourceControl::create("handle", std::make_unique<TestBody>(probe, "body"), lane);
  CHECK(control->state() == State::Open && control->name() == "handle");
  CHECK(lane.attached() == 1);
  std::optional<ResourceLease> first = control->lease();
  std::optional<ResourceLease> second = control->lease();
  CHECK(first && *first && second && *second);
  CHECK(control->leases() == 2);
  ResourceLease moved(std::move(*first));
  CHECK(!*first && moved && control->leases() == 2);
  ResourceLease target = std::move(*second);
  CHECK(control->leases() == 2);
  target = std::move(moved);
  CHECK(control->leases() == 1 && !moved && target);
  control->close();
  CHECK(control->state() == State::Retiring);
  CHECK(!control->lease());
  control->close();
  CHECK(control->state() == State::Retiring && probe->destroyed.load() == 0);
  target.release();
  target.release();
  CHECK(control->leases() == 0 && control->state() == State::Retired);
  lane.quiesce();
  CHECK(probe->destroyed.load() == 1 && probe->destroyer() == lane.reaperThread());
  CHECK(lane.disposedResults() == 1);
  control->abort("late");
  control->close();
  lane.quiesce();
  CHECK(control->state() == State::Retired && probe->destroyed.load() == 1 && lane.disposedResults() == 1);
  control.reset();
  CHECK(lane.attached() == 0);
}

// --- the serial queue --------------------------------------------------------------------

// Gate: the serial queue on a lane with four threads. The control keeps the
// operations and hands exactly one at a time to the lane, in submission
// order: while the first one runs, the lane holds nothing else. Every
// operation runs once, alone, and results arrive in order.
void fifoQueueOnManyThreads(Suite& t) {
  constexpr int kOperations = 200;
  TestExecutor lane(4);
  auto probe = std::make_shared<Probe>();
  auto control = ResourceControl::create("queue", std::make_unique<TestBody>(probe, "body"), lane);
  TestRun run;
  auto started = std::make_shared<Gate>();
  auto gate = std::make_shared<Gate>();
  std::vector<uint64_t> ids;
  ids.push_back(run.submit(control->operations(), held(control, "0", started, gate)));
  started->wait();
  for (int i = 1; i < kOperations; ++i) ids.push_back(run.submit(control->operations(), record(control, std::to_string(i))));
  CHECK(control->active());
  CHECK(control->queued() == kOperations - 1);
  CHECK(lane.queued() == 0 && lane.running() == 1);
  gate->release();
  CHECK(run.await(ids));
  lane.quiesce();
  CHECK(run.order() == ids);
  CHECK(lane.executed() == kOperations);
  CHECK(probe->overlaps.load() == 0);
  const auto log = probe->entries();
  CHECK(log.size() == kOperations + 1 && log[0] == "0 started" && log[1] == "0");
  for (int i = 1; i < kOperations; ++i) CHECK(log[i + 1] == std::to_string(i));
  CHECK(!control->active() && control->queued() == 0);
}

// --- operations ----------------------------------------------------------------------

// Gate: operation contexts and failures. Operation ids count from 1 in
// queue order. An operation that throws fails with the exception's message,
// or a generic one, and every later operation sees precedingFailed(). A
// resource operation run outside its control's queue fails without
// touching the body.
void operationContextAndFailures(Suite& t) {
  TestExecutor lane(2);
  auto probe = std::make_shared<Probe>();
  auto control = ResourceControl::create("codec", std::make_unique<TestBody>(probe, "body"), lane);
  TestRun run;
  auto seen = std::make_shared<std::vector<std::string>>();
  auto report = [&](std::string tag) {
    return control->operation<TestBody>([tag, seen](TestBody&, ResourceOperationContext& context) {
      seen->push_back(tag + ":" + std::to_string(context.id()) + (context.precedingFailed() ? ":failed" : ""));
      return text(tag);
    });
  };
  const uint64_t a = run.submit(control->operations(), report("a"));
  const uint64_t boom = run.submit(control->operations(), control->operation<TestBody>(
                                                              [](TestBody&, ResourceOperationContext&) -> JobOutcome {
                                                                throw std::runtime_error("the codec broke");
                                                              }));
  const uint64_t b = run.submit(control->operations(), report("b"));
  const uint64_t odd = run.submit(control->operations(), control->operation<TestBody>(
                                                             [](TestBody&, ResourceOperationContext&) -> JobOutcome {
                                                               throw 7;
                                                             }));
  const uint64_t c = run.submit(control->operations(), report("c"));
  CHECK(run.await({a, boom, b, odd, c}));
  CHECK(run.result(boom).kind == Kind::Error && run.result(boom).error == "the codec broke");
  CHECK(run.result(odd).kind == Kind::Error && run.result(odd).error == "the resource operation failed");
  CHECK((*seen == std::vector<std::string>{"a:1", "b:3:failed", "c:5:failed"}));

  // Outside the queue: run directly, not through a port.
  InlineExecutor direct;
  const uint64_t stray = run.submit(direct, record(control, "stray"));
  CHECK(run.await({stray}));
  CHECK(run.result(stray).kind == Kind::Error &&
        run.result(stray).error == "a resource operation ran outside its resource's queue");
  CHECK(probe->entries().empty());
  control->close();
  lane.quiesce();
  CHECK(probe->destroyed.load() == 1);
}

// --- abort, refusals and admission charges ---------------------------------------------

// Gate: exact counts through abort. Three operations of 10 bytes each are
// charged while they wait. abort() rejects the two queued ones with its
// reason, each refused job goes to the lane's disposeUnrun() once, and
// their charges go with their inputs. The active one is asked to stop, and
// its charge stays with its result until the run drains it. A lease keeps
// the control Retiring, a second abort() changes nothing, and the body's
// stop bridge is retired. An operation submitted afterwards is refused as
// closed and disposed of the same way.
void abortCounts(Suite& t) {
  TestExecutor lane(2);
  auto ledger = std::make_shared<AdmissionLedger>();
  auto account = ledger->openRunner()->openRun();
  auto probe = std::make_shared<Probe>();
  auto body = std::make_unique<SessionBody>(probe);
  nodetool::jobs::SessionStopBridge& bridge = body->bridge;
  auto control = ResourceControl::create("encoder", std::move(body), lane);
  TestRun run;
  auto started = std::make_shared<Gate>();
  auto gate = std::make_shared<Gate>();
  const uint64_t a = run.submit(control->operations(), held(control, "a", started, gate), charge(account, 10));
  started->wait();
  // Taken while Open: accepting the terminal operation below ends that.
  std::optional<ResourceLease> lease = control->lease();
  CHECK(lease.has_value());
  const uint64_t b = run.submit(control->operations(), record(control, "b"), charge(account, 10));
  const uint64_t fin = run.submit(control->terminal(), record(control, "finish"), charge(account, 10));
  CHECK(ledger->usage().bytes == 30);
  CHECK(!control->lease());
  control->abort("aborted by the test");
  CHECK(bridge.sessionStopped());
  CHECK(control->state() == State::Retiring && control->queued() == 0);
  CHECK(run.await({a, b, fin}));
  CHECK(run.result(b).kind == Kind::Stopped && run.result(b).error == "aborted by the test");
  CHECK(run.result(fin).kind == Kind::Stopped && run.result(fin).error == "aborted by the test");
  CHECK(run.result(a).kind == Kind::Stopped);
  lane.quiesce();
  CHECK(lane.disposedUnrun() == 2);
  // a's result was drained by await(), so its charge is gone too.
  CHECK(ledger->usage().bytes == 0);
  control->abort("again");
  lane.quiesce();
  CHECK(run.received() == 3 && lane.disposedUnrun() == 2);
  CHECK(control->state() == State::Retiring && probe->destroyed.load() == 0);
  const uint64_t late = run.submit(control->operations(), record(control, "late"), charge(account, 5));
  CHECK(run.await({late}));
  CHECK(run.result(late).kind == Kind::Error && run.result(late).error == "encoder is closed");
  lane.quiesce();
  CHECK(lane.disposedUnrun() == 3 && ledger->usage().bytes == 0);
  lease.reset();
  lane.quiesce();
  CHECK(control->state() == State::Retired && probe->destroyed.load() == 1);
  CHECK(probe->destroyer() == lane.reaperThread() && lane.disposedResults() == 1);
  CHECK((probe->entries() == std::vector<std::string>{"a started", "session destroyed"}));
}

// Gate: an admitted charge travels with a resource operation into its
// result. While a result waits in the mailbox its bytes stay charged, and
// they go when the run drains it.
void chargesStayUntilResultsDrain(Suite& t) {
  TestExecutor lane(1);
  auto ledger = std::make_shared<AdmissionLedger>();
  auto account = ledger->openRunner()->openRun();
  auto probe = std::make_shared<Probe>();
  auto control = ResourceControl::create("reader", std::make_unique<TestBody>(probe, "body"), lane);
  TestRun run;
  std::vector<uint64_t> ids;
  for (int i = 0; i < 3; ++i) {
    Reservation reservation = charge(account, 8);
    CHECK(reservation.admit({8, 0, 0}, Reservation::Order::Immediate) == Reservation::Admission::Admitted);
    ids.push_back(run.submit(control->operations(), record(control, std::to_string(i)), std::move(reservation)));
  }
  lane.quiesce();
  CHECK(lane.executed() == 3);
  CHECK(ledger->usage().bytes == 24 && ledger->usage().operations == 3);
  CHECK(run.await(ids));
  CHECK(ledger->usage().bytes == 0 && ledger->usage().operations == 0);
  control->close();
  lane.quiesce();
  CHECK(probe->destroyed.load() == 1);
}

// --- ports ----------------------------------------------------------------------------

// Gate: the ports forward to the lane. dispose(), disposeUnrun() and
// stopRelay() reach the lane, discardStopped() drops queued operations
// whose run stopped, without a result, and a control whose queue empties
// that way while Retiring retires. A run attached to a port keeps the
// control alive after its owners let go, until it detaches.
void portsForwardToTheLane(Suite& t) {
  TestExecutor lane(1);
  auto probe = std::make_shared<Probe>();
  auto control = ResourceControl::create("port", std::make_unique<TestBody>(probe, "body"), lane);
  nodetool::jobs::JobExecutor& port = control->operations();
  std::deque<nodetool::jobs::JobResult> results(1);
  port.dispose(std::move(results));
  TestRun other(2);
  port.disposeUnrun(SubmittedJob(1, record(control, "unrun"), nullptr, {}, other.tracker().acquire(2)));
  std::stop_source relayed;
  std::atomic<std::thread::id> relayThread{};
  std::stop_callback onStop(relayed.get_token(), [&] { relayThread = std::this_thread::get_id(); });
  port.stopRelay()->relay(relayed, nullptr);
  lane.quiesce();
  CHECK(lane.disposedResults() == 1 && lane.disposedUnrun() == 1 && lane.relayed() == 1);
  CHECK(relayThread.load() == lane.reaperThread());

  TestRun stopping(3);
  TestRun live(4);
  auto started = std::make_shared<Gate>();
  auto gate = std::make_shared<Gate>();
  const uint64_t active = live.submit(control->operations(), held(control, "active", started, gate));
  started->wait();
  const uint64_t dropped1 = stopping.submit(control->operations(), record(control, "dropped 1"));
  const uint64_t kept = live.submit(control->operations(), record(control, "kept"));
  const uint64_t dropped2 = stopping.submit(control->terminal(), record(control, "dropped 2"));
  CHECK(port.discardStopped() == 0);
  stopping.stop().request_stop();
  CHECK(control->terminal().discardStopped() == 2);
  CHECK(control->queued() == 1);
  gate->release();
  CHECK(live.await({active, kept}));
  lane.quiesce();
  CHECK(lane.disposedUnrun() == 3);
  stopping.drain();
  CHECK(!stopping.has(dropped1) && !stopping.has(dropped2));
  // The terminal operation moved the control to Retiring when it was
  // accepted. With it discarded, the control retires once idle.
  CHECK(control->state() == State::Retired && probe->destroyed.load() == 1);

  // A run attached to a port keeps the control alive.
  auto attachedProbe = std::make_shared<Probe>();
  auto attachedControl =
      ResourceControl::create("attached", std::make_unique<TestBody>(attachedProbe, "body"), lane);
  std::weak_ptr<ResourceControl> weak = attachedControl;
  nodetool::jobs::JobExecutor& attachedPort = attachedControl->operations();
  attachedPort.attach();
  attachedControl.reset();
  CHECK(!weak.expired());
  attachedPort.detach();
  CHECK(weak.expired());
  lane.quiesce();
  CHECK(attachedProbe->destroyed.load() == 1 && attachedProbe->destroyer() == lane.reaperThread());
  control.reset();
  CHECK(lane.attached() == 0);
}

// --- destruction ------------------------------------------------------------------------

// A body that notes, when it is destroyed, whether the control it depends
// on still counts a lease. A weak reference, so the body never keeps it.
//
// Thread affinity: destroyed on its control's destroyOn reaper. leases()
// takes the dependency's own mutex, which no lock held here nests under.
struct DependentBody final : TestBody {
  DependentBody(std::shared_ptr<Probe> p, std::weak_ptr<ResourceControl> d)
      : TestBody(std::move(p), "encoder"), dependency(std::move(d)) {}
  ~DependentBody() override {
    auto held = dependency.lock();
    probe->note(held && held->leases() == 1 ? "dependency leased" : "dependency released");
  }
  std::weak_ptr<ResourceControl> dependency;
};

// Gate: the destruction lane. A control attaches to its lane and to its
// destroyOn executor while it exists. Its body goes to destroyOn's dispose()
// exactly once, never the lane's, and its dependency leases are released
// after the body, so the body still sees its dependency leased, and the
// dependency's own body then goes to its lane once.
void destroyOnExactCounts(Suite& t) {
  TestExecutor lane(1);
  TestExecutor owner(1);
  auto log = std::make_shared<Probe>();
  auto staging = ResourceControl::create("staging", std::make_unique<TestBody>(log, "staging"), lane);
  ResourceControl::Options options;
  options.destroyOn = &owner;
  options.dependencies.push_back(*staging->lease());
  auto encoder =
      ResourceControl::create("encoder", std::make_unique<DependentBody>(log, staging), lane, std::move(options));
  CHECK(lane.attached() == 2 && owner.attached() == 1);
  CHECK(staging->leases() == 1);
  staging->close();
  CHECK(staging->state() == State::Retiring);
  TestRun run;
  const uint64_t op = run.submit(encoder->operations(), record(encoder, "write"));
  CHECK(run.await({op}));
  encoder->close();
  owner.quiesce();
  lane.quiesce();
  CHECK(owner.disposedResults() == 1);
  CHECK(lane.disposedResults() == 1);
  CHECK(staging->state() == State::Retired);
  CHECK((log->entries() ==
         std::vector<std::string>{"write", "dependency leased", "encoder destroyed", "staging destroyed"}));
  CHECK(log->destroyer() == lane.reaperThread());
  encoder.reset();
  staging.reset();
  CHECK(lane.attached() == 0 && owner.attached() == 0);
}

// Gate: a lane that shuts down with a resource operation still queued
// cancels it, and the operation's run gets a Stopped result saying the
// lanes are shut down. The control completes, so the body is destroyed and
// the control detaches before the lane is gone.
void laneShutdownCancelsQueuedOperations(Suite& t) {
  auto lane = std::make_unique<TestExecutor>(1);
  auto blocker = std::make_shared<Gate>();
  auto running = std::make_shared<Gate>();
  TestRun run;
  // Holds the only worker until the shutdown's stop.
  lane->submit(SubmittedJob(0, nodetool::jobs::makeJob([blocker, running](std::stop_token stop) {
                              running->release();
                              (void)blocker->wait(stop);
                              return JobOutcome::value(nullptr);
                            }),
                            nullptr, {}, run.tracker().acquire(1)));
  running->wait();
  auto probe = std::make_shared<Probe>();
  auto control = ResourceControl::create("decoder", std::make_unique<TestBody>(probe, "body"), *lane);
  const uint64_t op = run.submit(control->operations(), record(control, "never"));
  CHECK(control->active() && lane->queued() == 1);
  std::weak_ptr<ResourceControl> weak = control;
  control.reset();
  lane.reset();
  CHECK(run.await({op}));
  CHECK(run.result(op).kind == Kind::Stopped && run.result(op).error == "The host lanes are shut down");
  CHECK(weak.expired());
  CHECK(probe->destroyed.load() == 1 && probe->entries() == std::vector<std::string>{"body destroyed"});
}

}  // namespace

int main() {
  Suite suite;
  const std::vector<std::pair<const char*, void (*)(Suite&)>> tests = {
      {"inlineLane", inlineLane},
      {"statesAndLeases", statesAndLeases},
      {"fifoQueueOnManyThreads", fifoQueueOnManyThreads},
      {"operationContextAndFailures", operationContextAndFailures},
      {"abortCounts", abortCounts},
      {"chargesStayUntilResultsDrain", chargesStayUntilResultsDrain},
      {"portsForwardToTheLane", portsForwardToTheLane},
      {"destroyOnExactCounts", destroyOnExactCounts},
      {"laneShutdownCancelsQueuedOperations", laneShutdownCancelsQueuedOperations},
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
