// The admission ledger (docs/plans/graph-runner-async-host.md, section 4.7)
// on its own: reservations, their limits, deferral and turn order, waiters,
// sharing, retention and the JavaScript ledger, across threads. The graph
// runner's unittests/admission.cpp tests the ledger through AsyncRun, its
// host functions and provider jobs.
#include "nodetool/jobs/admission.h"
#include "resource_test_support.h"

#include <atomic>
#include <barrier>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <limits>
#include <memory>
#include <stdexcept>
#include <string>
#include <thread>
#include <utility>
#include <vector>

namespace {

using nodetool::jobs::AdmissionError;
using nodetool::jobs::AdmissionLedger;
using nodetool::jobs::AdmissionWaiter;
using nodetool::jobs::ExternalCharge;
using nodetool::jobs::JobCost;
using nodetool::jobs::LedgerUsage;
using nodetool::jobs::ProcessLimits;
using nodetool::jobs::Reservation;
using nodetool::jobs::RunAccount;
using nodetool::jobs::RunnerAccount;
using nodetool::jobs::RunnerLimits;
using nodetool::jobs::kGiB;
using nodetool::jobs::kMiB;
using step5::Suite;
using step5::contains;
using Admission = Reservation::Admission;
using Order = Reservation::Order;

bool zero(const LedgerUsage& u) {
  return u.bytes == 0 && u.operations == 0 && u.deferredBytes == 0 && u.deferredEntries == 0 &&
         u.retainedBytes == 0 && u.javaScriptBytes == 0;
}

// What `f` threw, prefixed with "admission: " for an AdmissionError and
// "logic: " for a std::logic_error, or "" when it returned.
template <class F>
std::string thrown(F f) {
  try {
    f();
  } catch (const AdmissionError& e) {
    return std::string("admission: ") + e.what();
  } catch (const std::logic_error& e) {
    return std::string("logic: ") + e.what();
  } catch (const std::exception& e) {
    return std::string("other: ") + e.what();
  }
  return "";
}

// Told when capacity is released. Reads the ledger and its run's account,
// which deadlocks if the ledger tells it while holding its mutex.
//
// Thread affinity: thread-safe. `told` and `lastThread` are atomic, the
// rest is set before it is registered.
struct ReadingWaiter final : AdmissionWaiter {
  void admissionChanged() noexcept override {
    (void)ledger->usage();
    (void)ledger->waitingRuns();
    if (account) (void)account->usage();
    lastThread = std::this_thread::get_id();
    ++told;
  }
  std::shared_ptr<AdmissionLedger> ledger;
  std::shared_ptr<RunAccount> account;
  std::atomic<int> told{0};
  std::atomic<std::thread::id> lastThread{};
};

std::shared_ptr<ReadingWaiter> waiterOn(const std::shared_ptr<RunAccount>& run) {
  auto waiter = std::make_shared<ReadingWaiter>();
  waiter->ledger = run->ledger();
  waiter->account = run;
  run->setWaiter(waiter);
  return waiter;
}

RunnerLimits runnerLimits(uint64_t runBytes, size_t runOperations = 0) {
  RunnerLimits limits;
  if (runBytes) limits.runBytes = runBytes;
  if (runOperations) limits.runOperations = runOperations;
  return limits;
}

// --- arithmetic and limits ---------------------------------------------------

// Gate: checked arithmetic refuses sizes that wrap, and a reservation's
// snapshot is refused, charging nothing, when it overflows or passes the
// run limit. Destroying the reservation releases what it charged.
void checkedArithmeticAndSnapshotLimits(Suite& t) {
  CHECK(contains(thrown([] { nodetool::jobs::checkedAdd(std::numeric_limits<uint64_t>::max(), 1); }), "overflows"));
  CHECK(contains(thrown([] { nodetool::jobs::checkedMul(uint64_t{1} << 32, uint64_t{1} << 32); }), "overflows"));
  CHECK(contains(thrown([] { (void)JobCost{std::numeric_limits<uint64_t>::max(), 1, 0}.total(); }), "overflows"));
  CHECK(nodetool::jobs::checkedMul(uint64_t{1} << 31, uint64_t{1} << 32) == uint64_t{1} << 63);
  CHECK((JobCost{1, 2, 3}.total() == 6));

  auto ledger = std::make_shared<AdmissionLedger>();
  auto runner = ledger->openRunner(runnerLimits(0, 1));
  auto account = runner->openRun();
  {
    Reservation reservation(account);
    CHECK(contains(thrown([&] { reservation.reserveSnapshot(std::numeric_limits<uint64_t>::max()); }),
                   "more than the run limit"));
    reservation.reserveSnapshot(100);
    CHECK(contains(thrown([&] { reservation.reserveSnapshot(std::numeric_limits<uint64_t>::max() - 50); }),
                   "overflows"));
    CHECK(account->usage().bytes == 100);
    CHECK(ledger->usage().bytes == 100);
  }
  CHECK(zero(ledger->usage()));
}

// Gate: configuration may only lower a limit. 0 and larger values become
// the default, and a ledger and an account clamp what they are given.
void limitsClampToTheDefaults(Suite& t) {
  ProcessLimits raised;
  raised.bytes = 64 * kGiB;
  raised.operations = 0;
  const ProcessLimits clamped = raised.clamped();
  CHECK(clamped.bytes == 4 * kGiB);
  CHECK(clamped.operations == 256);
  RunnerLimits lowered;
  lowered.runBytes = 10;
  lowered.javaScriptBytes = 5 * kGiB;
  CHECK(lowered.clamped().runBytes == 10);
  CHECK(lowered.clamped().javaScriptBytes == 1 * kGiB);
  ProcessLimits lower;
  lower.deferredEntries = 3;
  lower.deferredBytes = 0;
  auto ledger = std::make_shared<AdmissionLedger>(lower);
  CHECK(ledger->limits().deferredEntries == 3 && ledger->limits().deferredBytes == 256 * kMiB);
  RunnerLimits runner;
  runner.runOperations = 1000;
  runner.runDeferredEntries = 2;
  auto account = ledger->openRunner(runner);
  CHECK(account->limits().runOperations == 64 && account->limits().runDeferredEntries == 2);
}

// --- reservations --------------------------------------------------------------

// Gate: reservation and release counts. Snapshot bytes are charged to the
// run, its runner and the process at once, and released the same way, by
// releaseSnapshot() (never more than the snapshot) and by destruction.
// Admission sets the charge to the cost and takes one operation slot at
// every level. An empty reservation charges nothing, and misuse throws
// std::logic_error without changing a counter.
void reservationCounts(Suite& t) {
  auto ledger = std::make_shared<AdmissionLedger>();
  auto runner = ledger->openRunner();
  auto a = runner->openRun();
  auto b = runner->openRun();
  CHECK(a->runner() == runner && a->ledger() == ledger && runner->ledger() == ledger);
  Reservation empty;
  Reservation none(nullptr);
  CHECK(!empty && !none && empty.bytes() == 0 && !empty.admitted() && !empty.deferred() && !empty.account());
  CHECK(thrown([&] { empty.reserveSnapshot(1); }) == "logic: an empty reservation cannot hold snapshot bytes");
  CHECK(thrown([&] { empty.admit({}, Order::Immediate); }) == "logic: an empty reservation cannot be admitted");
  CHECK(thrown([&] { empty.defer({}); }) == "logic: an empty reservation cannot be deferred");
  CHECK(!empty.share());
  empty.releaseSnapshot(5);

  Reservation ra(a);
  Reservation rb(b);
  CHECK(ra && ra.account() == a);
  ra.reserveSnapshot(100);
  ra.reserveSnapshot(0);
  rb.reserveSnapshot(50);
  CHECK(a->usage().bytes == 100 && b->usage().bytes == 50);
  CHECK(runner->usage().bytes == 150 && ledger->usage().bytes == 150);
  ra.releaseSnapshot(30);
  CHECK(ra.bytes() == 70 && a->usage().bytes == 70 && runner->usage().bytes == 120 && ledger->usage().bytes == 120);
  ra.releaseSnapshot(1000);
  CHECK(ra.bytes() == 0 && a->usage().bytes == 0 && ledger->usage().bytes == 50);
  ra.reserveSnapshot(40);
  CHECK(ra.admit({40, 60, 10}, Order::Immediate) == Admission::Admitted);
  CHECK(ra.admitted() && ra.bytes() == 110);
  CHECK(a->usage().operations == 1 && runner->usage().operations == 1 && ledger->usage().operations == 1);
  CHECK(a->usage().bytes == 110 && ledger->usage().bytes == 160);
  CHECK(thrown([&] { ra.reserveSnapshot(1); }) ==
        "logic: snapshot bytes are reserved before admission and retention");
  CHECK(thrown([&] { ra.admit({}, Order::Immediate); }) == "logic: a reservation is admitted once");
  CHECK(thrown([&] { ra.defer({}); }) == "logic: an admitted reservation cannot be deferred");
  CHECK(ledger->usage().bytes == 160 && ledger->usage().operations == 1);
  // A cost below the snapshot gives the difference back.
  CHECK(rb.admit({10, 0, 0}, Order::Immediate) == Admission::Admitted);
  CHECK(rb.bytes() == 10 && b->usage().bytes == 10 && ledger->usage().bytes == 120);
  CHECK(runner->usage().operations == 2);
  ra = {};
  CHECK(zero(a->usage()));
  CHECK(runner->usage().bytes == 10 && runner->usage().operations == 1);
  rb = {};
  CHECK(zero(runner->usage()) && zero(ledger->usage()));
}

// Gate: limits. A snapshot larger than the run's or the process's byte
// limit, or one that does not fit what is held now, is refused with an
// AdmissionError naming the limit, and charges nothing. checkSize() and
// admit() refuse costs that can never fit. A run at its operation limit, or
// a process at its own, blocks admission without charging anything.
void byteAndOperationLimits(Suite& t) {
  ProcessLimits process;
  process.bytes = 1000;
  process.operations = 2;
  auto ledger = std::make_shared<AdmissionLedger>(process);
  auto tight = ledger->openRunner(runnerLimits(600, 1));
  auto wide = ledger->openRunner();
  auto run = tight->openRun();
  auto other = wide->openRun();
  Reservation r(run);
  CHECK(thrown([&] { r.reserveSnapshot(601); }) ==
        "admission: a host operation's inputs need 601 bytes, more than the run limit of 600 bytes");
  r.reserveSnapshot(500);
  Reservation r2(run);
  CHECK(thrown([&] { r2.reserveSnapshot(200); }) == "admission: the run's host operations already hold their 600 bytes");
  Reservation q(other);
  CHECK(thrown([&] { q.reserveSnapshot(1001); }) ==
        "admission: a host operation's inputs need 1001 bytes, more than the process limit of 1000 bytes");
  CHECK(thrown([&] { q.reserveSnapshot(600); }) ==
        "admission: the process's host operations already hold their 1000 bytes");
  CHECK(r2.bytes() == 0 && q.bytes() == 0);
  CHECK(run->usage().bytes == 500 && ledger->usage().bytes == 500);

  CHECK(thrown([&] { run->checkSize({700, 0, 0}); }) ==
        "admission: a host operation needs 700 bytes, more than the run limit of 600 bytes");
  CHECK(thrown([&] { other->checkSize({0, 1001, 0}); }) ==
        "admission: a host operation needs 1001 bytes, more than the process limit of 1000 bytes");
  CHECK(contains(thrown([&] { other->checkSize({std::numeric_limits<uint64_t>::max(), 1, 0}); }), "overflows"));
  CHECK(thrown([&] { run->checkSize({600, 0, 0}); }).empty());
  Reservation big(other);
  CHECK(contains(thrown([&] { big.admit({0, 2000, 0}, Order::Immediate); }), "more than the process limit"));
  CHECK(!big.admitted() && ledger->usage().operations == 0 && ledger->usage().bytes == 500);

  CHECK(r.admit({500, 0, 0}, Order::Immediate) == Admission::Admitted);
  Reservation r3(run);
  CHECK(r3.admit({}, Order::Immediate) == Admission::Blocked);
  CHECK(!r3.admitted() && run->usage().operations == 1);
  Reservation q2(other);
  CHECK(q2.admit({}, Order::Immediate) == Admission::Admitted);
  auto third = wide->openRun();
  Reservation q3(third);
  CHECK(q3.admit({}, Order::Immediate) == Admission::Blocked);
  CHECK(ledger->usage().operations == 2 && third->usage().operations == 0);
  // An Immediate start that is blocked never waits.
  CHECK(ledger->waitingRuns() == 0);
  r = {};
  CHECK(q3.admit({}, Order::Immediate) == Admission::Admitted);
  CHECK(r3.admit({}, Order::Immediate) == Admission::Blocked);
}

// Gate: turn order. Queued starts blocked by the process take turns in the
// order they began waiting, and a queued start that would fit waits behind
// an earlier turn. An Immediate start takes free capacity regardless. A
// start blocked by its own run's limit takes no turn, so it never holds
// back other runs.
void queuedStartsKeepTheirTurns(Suite& t) {
  ProcessLimits process;
  process.bytes = 100;
  auto ledger = std::make_shared<AdmissionLedger>(process);
  auto runner = ledger->openRunner();
  auto rx = runner->openRun();
  auto ra = runner->openRun();
  auto rb = runner->openRun();
  auto rc = runner->openRun();
  Reservation x(rx);
  CHECK(x.admit({0, 80, 0}, Order::Immediate) == Admission::Admitted);
  Reservation a(ra);
  CHECK(a.admit({0, 50, 0}, Order::Queue) == Admission::Blocked);
  Reservation b(rb);
  CHECK(b.admit({0, 10, 0}, Order::Queue) == Admission::Blocked);
  CHECK(ledger->waitingRuns() == 2);
  Reservation c(rc);
  CHECK(c.admit({0, 10, 0}, Order::Immediate) == Admission::Admitted);
  CHECK(ledger->usage().bytes == 90);
  CHECK(b.admit({0, 10, 0}, Order::Queue) == Admission::Blocked);
  x = {};
  CHECK(b.admit({0, 10, 0}, Order::Queue) == Admission::Blocked);
  CHECK(a.admit({0, 50, 0}, Order::Queue) == Admission::Admitted);
  CHECK(b.admit({0, 10, 0}, Order::Queue) == Admission::Admitted);
  CHECK(ledger->usage().bytes == 70);
  // Admission keeps the run among the waiting runs until it stops waiting.
  CHECK(ledger->waitingRuns() == 2);
  ra->stopWaiting();
  rb->stopWaiting();
  CHECK(ledger->waitingRuns() == 0);
  a = {};
  b = {};
  c = {};

  // Run limits: the run waits for its own operation, without a turn.
  auto limited = ledger->openRunner(runnerLimits(0, 1))->openRun();
  Reservation held(limited);
  CHECK(held.admit({}, Order::Immediate) == Admission::Admitted);
  Reservation second(limited);
  CHECK(second.admit({}, Order::Queue) == Admission::Blocked);
  CHECK(ledger->waitingRuns() == 1);
  auto free = runner->openRun();
  Reservation passing(free);
  CHECK(passing.admit({0, 10, 0}, Order::Queue) == Admission::Admitted);
  held = {};
  CHECK(second.admit({}, Order::Queue) == Admission::Admitted);
  limited->stopWaiting();
  second = {};
  passing = {};
  CHECK(zero(ledger->usage()) && ledger->waitingRuns() == 0);
}

// --- deferral --------------------------------------------------------------------

// Gate: deferred starts. defer() counts the snapshot against the deferred
// limits at every level and keeps it until admission or destruction.
// Deferred limits refuse an entry with an AdmissionError naming them, and
// a deferral that would leave the run's FIFO head too little room is
// refused. Deferred snapshot bytes cannot be released, defer() twice does
// nothing, and admission moves the entry out of the deferred counters.
void deferredStarts(Suite& t) {
  {
    auto ledger = std::make_shared<AdmissionLedger>();
    RunnerLimits limits;
    limits.runDeferredEntries = 2;
    limits.runDeferredBytes = 64;
    auto runner = ledger->openRunner(limits);
    auto run = runner->openRun();
    Reservation d1(run);
    d1.reserveSnapshot(10);
    d1.defer({10, 0, 0});
    CHECK(d1.deferred());
    CHECK(run->usage().deferredBytes == 10 && run->usage().deferredEntries == 1);
    CHECK(runner->usage().deferredEntries == 1 && ledger->usage().deferredBytes == 10);
    Reservation d2(run);
    d2.reserveSnapshot(100);
    CHECK(thrown([&] { d2.defer({100, 0, 0}); }) ==
          "admission: the run cannot defer more host operations (2 entries, 64 bytes)");
    CHECK(!d2.deferred() && run->usage().deferredEntries == 1);
    d2.releaseSnapshot(90);
    d2.defer({10, 0, 0});
    Reservation d3(run);
    d3.reserveSnapshot(1);
    CHECK(thrown([&] { d3.defer({1, 0, 0}); }) ==
          "admission: the run cannot defer more host operations (2 entries, 64 bytes)");
    CHECK(thrown([&] { d1.releaseSnapshot(1); }) == "logic: a deferred reservation keeps its snapshot bytes");
    d1.defer({10, 0, 0});
    CHECK(run->usage().deferredEntries == 2 && run->usage().deferredBytes == 20);
    d1 = {};
    CHECK(run->usage().deferredEntries == 1 && run->usage().deferredBytes == 10 && run->usage().bytes == 11);
    CHECK(d2.admit({10, 5, 0}, Order::Immediate) == Admission::Admitted);
    CHECK(!d2.deferred() && run->usage().deferredEntries == 0 && run->usage().deferredBytes == 0);
    CHECK(ledger->usage().deferredEntries == 0 && run->usage().bytes == 16);
  }
  {
    ProcessLimits process;
    process.deferredEntries = 1;
    auto ledger = std::make_shared<AdmissionLedger>(process);
    auto run = ledger->openRunner()->openRun();
    Reservation e1(run);
    e1.defer({});
    Reservation e2(run);
    CHECK(thrown([&] { e2.defer({}); }) ==
          "admission: the process cannot defer more host operations (1 entries, 256 MiB)");
  }
  {
    // The run may hold 100 bytes and an admitted job holds 60. B waits with
    // a 20-byte snapshot and needs 90 in all. C would wait behind it with
    // another 20, and B could then never start, so C is refused. B starts
    // once the admitted job is gone.
    auto ledger = std::make_shared<AdmissionLedger>();
    auto run = ledger->openRunner(runnerLimits(100))->openRun();
    Reservation active(run);
    CHECK(active.admit({0, 60, 0}, Order::Immediate) == Admission::Admitted);
    Reservation b(run);
    b.reserveSnapshot(20);
    b.defer({20, 70, 0});
    Reservation c(run);
    c.reserveSnapshot(20);
    CHECK(thrown([&] { c.defer({20, 0, 0}); }) ==
          "admission: a waiting host operation would leave too little room for the run's waiting operations within "
          "its 100 bytes");
    CHECK(run->usage().deferredEntries == 1);
    c = {};
    CHECK(b.admit({20, 70, 0}, Order::Queue) == Admission::Blocked);
    active = {};
    CHECK(b.admit({20, 70, 0}, Order::Queue) == Admission::Admitted);
    CHECK(run->usage().bytes == 90 && run->usage().deferredEntries == 0 && run->usage().operations == 1);
    run->stopWaiting();
  }
  {
    // The same across runs: a run holding the process's first turn keeps
    // room, so another run's deferral that would take it is refused.
    ProcessLimits process;
    process.bytes = 100;
    auto ledger = std::make_shared<AdmissionLedger>(process);
    auto runner = ledger->openRunner();
    auto rx = runner->openRun();
    auto ra = runner->openRun();
    auto rb = runner->openRun();
    Reservation x(rx);
    CHECK(x.admit({0, 60, 0}, Order::Immediate) == Admission::Admitted);
    Reservation a(ra);
    a.reserveSnapshot(20);
    a.defer({20, 70, 0});
    CHECK(a.admit({20, 70, 0}, Order::Queue) == Admission::Blocked);
    Reservation b(rb);
    b.reserveSnapshot(20);
    CHECK(thrown([&] { b.defer({20, 0, 0}); }) ==
          "admission: a waiting host operation would leave too little room for the process's waiting operations "
          "within its 100 bytes");
    b = {};
    x = {};
    CHECK(a.admit({20, 70, 0}, Order::Queue) == Admission::Admitted);
    ra->stopWaiting();
  }
}

// Gate: a queued start that can never be admitted fails instead of waiting
// forever. The run may hold 100 bytes, and 30 of them are retained input
// that only the guest releases. With nothing running, a queued start of 80
// is refused, while an Immediate one is only blocked.
void stalledStartsFail(Suite& t) {
  auto ledger = std::make_shared<AdmissionLedger>();
  auto run = ledger->openRunner(runnerLimits(100))->openRun();
  Reservation upload(run);
  upload.reserveSnapshot(30);
  upload.retain();
  Reservation start(run);
  CHECK(start.admit({0, 80, 0}, Order::Immediate) == Admission::Blocked);
  CHECK(contains(thrown([&] { start.admit({0, 80, 0}, Order::Queue); }),
                 "admission: a waiting host operation can never start: it needs 80 bytes"));
  CHECK(contains(thrown([&] { start.admit({0, 80, 0}, Order::Queue); }), "the run's 100 bytes"));
  CHECK(!start.admitted() && run->usage().bytes == 30 && ledger->waitingRuns() == 0);
  // A running operation can drain, so the same start waits.
  Reservation running(run);
  CHECK(running.admit({}, Order::Immediate) == Admission::Admitted);
  CHECK(start.admit({0, 80, 0}, Order::Queue) == Admission::Blocked);
  CHECK(ledger->waitingRuns() == 1);
  run->stopWaiting();
}

// --- waiters -------------------------------------------------------------------

// Gate: waiters. A run that waits is told when capacity is released, on
// the releasing thread and outside the ledger mutex (the waiter reads the
// ledger, which would deadlock under it): by destruction, releaseSnapshot,
// transferToJavaScript and an admission that gave bytes back. A release of
// nothing tells nobody. stopWaiting() removes the run, an expired waiter
// is skipped, and a run account destroyed while it holds a turn tells the
// others.
void waitersAreToldOutsideTheLock(Suite& t) {
  ProcessLimits process;
  process.operations = 1;
  auto ledger = std::make_shared<AdmissionLedger>(process);
  auto runner = ledger->openRunner();
  auto rh = runner->openRun();
  auto rw = runner->openRun();
  auto waiter = waiterOn(rw);
  Reservation hold(rh);
  CHECK(hold.admit({}, Order::Immediate) == Admission::Admitted);
  Reservation want(rw);
  CHECK(want.admit({}, Order::Queue) == Admission::Blocked);
  CHECK(ledger->waitingRuns() == 1 && waiter->told.load() == 0);
  std::thread::id releaser;
  std::thread release([&] {
    releaser = std::this_thread::get_id();
    hold = {};
  });
  release.join();
  CHECK(waiter->told.load() == 1 && waiter->lastThread.load() == releaser);
  Reservation s(rh);
  s.reserveSnapshot(10);
  CHECK(waiter->told.load() == 1);
  s.releaseSnapshot(4);
  CHECK(waiter->told.load() == 2);
  s.releaseSnapshot(0);
  CHECK(waiter->told.load() == 2);
  ExternalCharge js = s.transferToJavaScript(3);
  CHECK(waiter->told.load() == 3);
  Reservation shrink(rh);
  shrink.reserveSnapshot(9);
  CHECK(waiter->told.load() == 3);
  CHECK(want.admit({}, Order::Queue) == Admission::Admitted);
  CHECK(waiter->told.load() == 4);
  want = {};
  CHECK(waiter->told.load() == 5);
  CHECK(shrink.admit({4, 0, 0}, Order::Immediate) == Admission::Admitted);
  CHECK(waiter->told.load() == 6);
  rw->stopWaiting();
  CHECK(ledger->waitingRuns() == 0);
  shrink = {};
  s = {};
  CHECK(waiter->told.load() == 6);
  js = {};

  // An expired waiter is skipped.
  auto rv = runner->openRun();
  rv->setWaiter(std::make_shared<ReadingWaiter>());
  Reservation blocker(rh);
  CHECK(blocker.admit({}, Order::Immediate) == Admission::Admitted);
  Reservation vanished(rv);
  CHECK(vanished.admit({}, Order::Queue) == Admission::Blocked);
  blocker = {};
  CHECK(ledger->waitingRuns() == 1);
  vanished = {};
  rv.reset();
  CHECK(ledger->waitingRuns() == 0);

  // A destroyed run account gives up its turn and tells the run behind it.
  auto first = runner->openRun();
  auto behind = runner->openRun();
  auto behindWaiter = waiterOn(behind);
  Reservation holder(rh);
  CHECK(holder.admit({}, Order::Immediate) == Admission::Admitted);
  Reservation firstStart(first);
  CHECK(firstStart.admit({}, Order::Queue) == Admission::Blocked);
  Reservation behindStart(behind);
  CHECK(behindStart.admit({}, Order::Queue) == Admission::Blocked);
  CHECK(ledger->waitingRuns() == 2);
  firstStart = {};
  CHECK(behindWaiter->told.load() == 0);
  first.reset();
  CHECK(behindWaiter->told.load() == 1 && ledger->waitingRuns() == 1);
  holder = {};
  CHECK(behindStart.admit({}, Order::Queue) == Admission::Admitted);
  behind->stopWaiting();
}

// --- sharing, absorption, retention ------------------------------------------

// Gate: a shared reservation is one charge. Every share sees the same
// bytes, admission and account. The charge stays while any share lives and
// is released once, telling waiters once, when the last share goes, here
// on one of several threads that drop theirs together.
void sharedReservationsReleaseOnce(Suite& t) {
  constexpr int kShares = 8;
  ProcessLimits process;
  process.operations = 1;
  auto ledger = std::make_shared<AdmissionLedger>(process);
  auto runner = ledger->openRunner();
  auto run = runner->openRun();
  auto other = runner->openRun();
  auto waiter = waiterOn(other);
  Reservation r(run);
  r.reserveSnapshot(64);
  CHECK(r.admit({64, 0, 0}, Order::Immediate) == Admission::Admitted);
  Reservation blocked(other);
  CHECK(blocked.admit({}, Order::Queue) == Admission::Blocked);
  std::vector<Reservation> shares;
  for (int i = 0; i < kShares; ++i) shares.push_back(r.share());
  for (const auto& share : shares) CHECK(share.bytes() == 64 && share.admitted() && share.account() == run);
  r = {};
  CHECK(ledger->usage().bytes == 64 && ledger->usage().operations == 1);
  CHECK(waiter->told.load() == 0);
  std::barrier together(kShares);
  std::vector<std::thread> threads;
  for (int i = 0; i < kShares; ++i) {
    threads.emplace_back([&, i] {
      Reservation mine = std::move(shares[i]);
      together.arrive_and_wait();
      mine = {};
    });
  }
  for (auto& thread : threads) thread.join();
  CHECK(waiter->told.load() == 1);
  CHECK(zero(run->usage()) && ledger->usage().operations == 0);
  CHECK(blocked.admit({}, Order::Queue) == Admission::Admitted);
  other->stopWaiting();
}

// Gate: absorb() moves an unshared, unadmitted reservation's bytes into
// another of the same run without changing a counter, also into an admitted
// one. It refuses a shared reservation, one of another run, an admitted
// one, and a deferred target. Absorbed retained input stops being retained.
void absorbMovesSnapshotBytes(Suite& t) {
  auto ledger = std::make_shared<AdmissionLedger>();
  auto runner = ledger->openRunner();
  auto run = runner->openRun();
  auto other = runner->openRun();
  Reservation into(run);
  into.reserveSnapshot(10);
  Reservation part(run);
  part.reserveSnapshot(5);
  into.absorb(std::move(part));
  CHECK(into.bytes() == 15 && run->usage().bytes == 15 && ledger->usage().bytes == 15);
  into.absorb(Reservation{});
  Reservation shared(run);
  shared.reserveSnapshot(1);
  Reservation copy = shared.share();
  CHECK(thrown([&] { into.absorb(std::move(shared)); }) ==
        "logic: only an unshared reservation of the same run can be absorbed");
  CHECK(copy.bytes() == 1);
  Reservation foreign(other);
  foreign.reserveSnapshot(1);
  CHECK(thrown([&] { into.absorb(std::move(foreign)); }) ==
        "logic: only an unshared reservation of the same run can be absorbed");
  Reservation admitted(run);
  CHECK(admitted.admit({}, Order::Immediate) == Admission::Admitted);
  CHECK(contains(thrown([&] { into.absorb(std::move(admitted)); }), "logic: only unadmitted snapshot bytes"));
  CHECK(into.admit({15, 0, 0}, Order::Immediate) == Admission::Admitted);
  Reservation late(run);
  late.reserveSnapshot(5);
  into.absorb(std::move(late));
  CHECK(into.bytes() == 20 && run->usage().bytes == 21);
  Reservation upload(run);
  upload.reserveSnapshot(7);
  upload.retain();
  CHECK(run->usage().retainedBytes == 7 && ledger->usage().retainedBytes == 7);
  into.absorb(std::move(upload));
  CHECK(into.bytes() == 27 && run->usage().retainedBytes == 0 && ledger->usage().retainedBytes == 0);
  Reservation deferred(run);
  deferred.defer({});
  Reservation more(run);
  more.reserveSnapshot(1);
  CHECK(contains(thrown([&] { deferred.absorb(std::move(more)); }), "logic: only unadmitted snapshot bytes"));
  into = {};
  copy = {};
  deferred = {};
  CHECK(zero(ledger->usage()));
}

// Gate: retention. retain() counts the charge as retained at every level,
// once, before admission only, and destroying it releases the retained
// count with the bytes.
void retainedBytesFollowTheCharge(Suite& t) {
  auto ledger = std::make_shared<AdmissionLedger>();
  auto runner = ledger->openRunner();
  auto run = runner->openRun();
  Reservation empty;
  CHECK(thrown([&] { empty.retain(); }) == "logic: an empty reservation cannot be retained");
  Reservation k(run);
  k.reserveSnapshot(40);
  k.retain();
  k.retain();
  CHECK(run->usage().retainedBytes == 40 && runner->usage().retainedBytes == 40 &&
        ledger->usage().retainedBytes == 40);
  CHECK(thrown([&] { k.reserveSnapshot(1); }) ==
        "logic: snapshot bytes are reserved before admission and retention");
  k = {};
  CHECK(zero(ledger->usage()));

  Reservation n(run);
  CHECK(n.admit({}, Order::Immediate) == Admission::Admitted);
  CHECK(thrown([&] { n.retain(); }) == "logic: a reservation is retained before admission");
  Reservation d(run);
  d.defer({});
  CHECK(thrown([&] { d.retain(); }) == "logic: a reservation is retained before admission");
}

// Whether a queued start of 80 bytes on `run`, whose limit is 100 bytes,
// waits while another worker's 30-byte snapshot, which can drain, holds
// the run's room. A run that counts bytes as retained that nobody holds
// thinks nothing can drain and refuses the start as one that can never
// start. Leaves the run as it found it.
bool queuedStartWaitsForASnapshot(const std::shared_ptr<RunAccount>& run, std::string& refusal) {
  Reservation snapshot(run);
  snapshot.reserveSnapshot(30);
  Reservation start(run);
  bool blocked = false;
  refusal = thrown([&] { blocked = start.admit({0, 80, 0}, Order::Queue) == Admission::Blocked; });
  run->stopWaiting();
  return blocked && refusal.empty();
}

// Gate: releaseSnapshot() on retained input takes the released bytes out
// of the retained count at every level, so destroying the rest leaves
// nothing counted. A count left behind makes the next queued start of the
// run fail as one that can never start, instead of waiting.
void releasedRetainedBytesStopCounting(Suite& t) {
  auto ledger = std::make_shared<AdmissionLedger>();
  auto runner = ledger->openRunner(runnerLimits(100));
  auto run = runner->openRun();
  {
    Reservation upload(run);
    upload.reserveSnapshot(40);
    upload.retain();
    upload.releaseSnapshot(30);
    CHECK(run->usage().bytes == 10);
    CHECK(run->usage().retainedBytes == 10 && runner->usage().retainedBytes == 10 &&
          ledger->usage().retainedBytes == 10);
  }
  CHECK(zero(run->usage()) && zero(ledger->usage()));
  std::string refusal;
  CHECK(queuedStartWaitsForASnapshot(run, refusal));
  CHECK(refusal.empty());
}

// Gate: transferToJavaScript() from retained input takes the moved bytes
// out of the retained count at every level, as releaseSnapshot() does, so
// destroying the rest leaves nothing counted and the next queued start
// waits instead of failing.
void transferredRetainedBytesStopCounting(Suite& t) {
  auto ledger = std::make_shared<AdmissionLedger>();
  auto runner = ledger->openRunner(runnerLimits(100));
  auto run = runner->openRun();
  {
    Reservation upload(run);
    upload.reserveSnapshot(40);
    upload.retain();
    ExternalCharge moved = upload.transferToJavaScript(30);
    CHECK(run->usage().bytes == 10 && runner->usage().javaScriptBytes == 30);
    CHECK(run->usage().retainedBytes == 10 && runner->usage().retainedBytes == 10 &&
          ledger->usage().retainedBytes == 10);
  }
  CHECK(zero(run->usage()) && zero(runner->usage()) && zero(ledger->usage()));
  std::string refusal;
  CHECK(queuedStartWaitsForASnapshot(run, refusal));
  CHECK(refusal.empty());
}

// Gate: absorbing into retained input keeps the retained count equal to
// the retained charge: absorbed bytes that were not retained become
// retained, and absorbed retained bytes stay retained. Destroying the
// charge then leaves nothing counted, where a count short of the charge
// would wrap below zero and make every later queued start of the run fail.
void absorbIntoRetainedInput(Suite& t) {
  for (const bool partRetained : {false, true}) {
    auto ledger = std::make_shared<AdmissionLedger>();
    auto runner = ledger->openRunner(runnerLimits(100));
    auto run = runner->openRun();
    {
      Reservation upload(run);
      upload.reserveSnapshot(10);
      upload.retain();
      Reservation part(run);
      part.reserveSnapshot(5);
      if (partRetained) part.retain();
      upload.absorb(std::move(part));
      CHECK(upload.bytes() == 15 && run->usage().bytes == 15);
      CHECK(run->usage().retainedBytes == 15 && runner->usage().retainedBytes == 15 &&
            ledger->usage().retainedBytes == 15);
    }
    CHECK(zero(run->usage()) && zero(ledger->usage()));
    std::string refusal;
    CHECK(queuedStartWaitsForASnapshot(run, refusal));
    CHECK(refusal.empty());
  }
}

// Gate: a retained reservation is never admitted or deferred, since only a
// start absorbs it (provider uploads) or its owner destroys it (an encoder
// session's options). admit() and defer() refuse it with a logic_error and
// change nothing, so the retained count stays equal to the retained
// charge. An admission that changed the charge's size without the retained
// count would leave a count that, when the charge is destroyed, wraps below
// zero (admitted larger) or stays behind (admitted smaller), and the next
// queued start of the run would fail as one that can never start.
void retainedReservationsAreNeverAdmitted(Suite& t) {
  for (const uint64_t total : {uint64_t{60}, uint64_t{20}}) {
    auto ledger = std::make_shared<AdmissionLedger>();
    auto runner = ledger->openRunner(runnerLimits(100));
    auto run = runner->openRun();
    {
      Reservation upload(run);
      upload.reserveSnapshot(40);
      upload.retain();
      CHECK(thrown([&] { (void)upload.admit({0, total, 0}, Order::Immediate); }) ==
            "logic: a retained reservation is absorbed into a start, never admitted");
      CHECK(thrown([&] { (void)upload.admit({0, total, 0}, Order::Queue); }) ==
            "logic: a retained reservation is absorbed into a start, never admitted");
      CHECK(thrown([&] { upload.defer({0, total, 0}); }) ==
            "logic: a retained reservation is absorbed into a start, never deferred");
      CHECK(!upload.admitted() && !upload.deferred() && upload.bytes() == 40);
      CHECK(run->usage().bytes == 40 && run->usage().operations == 0 && run->usage().deferredEntries == 0);
      CHECK(run->usage().retainedBytes == 40 && runner->usage().retainedBytes == 40 &&
            ledger->usage().retainedBytes == 40);
      CHECK(ledger->waitingRuns() == 0);
      // A shared reference counts the same charge once.
      Reservation copy = upload.share();
      copy = {};
      CHECK(ledger->usage().retainedBytes == 40);
    }
    CHECK(zero(run->usage()) && zero(runner->usage()) && zero(ledger->usage()));
    std::string refusal;
    CHECK(queuedStartWaitsForASnapshot(run, refusal));
    CHECK(refusal.empty());
  }
}

// Gate: the JavaScript ledger. transferToJavaScript() charges the runner's
// and the process's JavaScript caps and gives back up to as many native
// bytes in one step, and refuses, changing nothing, past a cap.
// reserveJavaScript() charges directly. An ExternalCharge resizes within
// the caps, keeps its size when growth is refused, and releases on
// release(), move assignment and destruction.
void javaScriptCharges(Suite& t) {
  ProcessLimits process;
  process.javaScriptBytes = 1000;
  auto ledger = std::make_shared<AdmissionLedger>(process);
  RunnerLimits capped;
  capped.javaScriptBytes = 600;
  auto runner = ledger->openRunner(capped);
  auto runner2 = ledger->openRunner();
  auto run = runner->openRun();
  Reservation empty;
  CHECK(thrown([&] { (void)empty.transferToJavaScript(1); }) == "logic: an empty reservation has nothing to transfer");
  Reservation r(run);
  r.reserveSnapshot(500);
  ExternalCharge c = r.transferToJavaScript(200);
  CHECK(c.bytes() == 200 && r.bytes() == 300 && run->usage().bytes == 300);
  CHECK(runner->usage().javaScriptBytes == 200 && ledger->usage().javaScriptBytes == 200);
  CHECK(thrown([&] { (void)r.transferToJavaScript(401); }) ==
        "admission: the runner's JavaScript buffers would exceed 600 bytes");
  CHECK(thrown([&] { (void)runner2->reserveJavaScript(801); }) ==
        "admission: the process's JavaScript buffers would exceed 1000 bytes");
  CHECK(thrown([&] { (void)runner->reserveJavaScript(401); }) ==
        "admission: the runner's JavaScript buffers would exceed 600 bytes");
  CHECK(r.bytes() == 300 && ledger->usage().javaScriptBytes == 200);
  ExternalCharge d = runner2->reserveJavaScript(300);
  CHECK(runner2->usage().javaScriptBytes == 300 && ledger->usage().javaScriptBytes == 500);
  CHECK(!d.resize(900));
  CHECK(d.bytes() == 300 && ledger->usage().javaScriptBytes == 500);
  CHECK(d.resize(700));
  CHECK(ledger->usage().javaScriptBytes == 900);
  CHECK(d.resize(100));
  CHECK(runner2->usage().javaScriptBytes == 100 && ledger->usage().javaScriptBytes == 300);
  ExternalCharge e;
  CHECK(!e.resize(5) && e.bytes() == 0);
  e.release();
  e = std::move(d);
  CHECK(e.bytes() == 100 && d.bytes() == 0);
  d.release();
  CHECK(ledger->usage().javaScriptBytes == 300);
  c = std::move(e);
  CHECK(runner->usage().javaScriptBytes == 0 && c.bytes() == 100 && ledger->usage().javaScriptBytes == 100);
  // More than the native charge: all of it moves, the rest is charged.
  ExternalCharge f = r.transferToJavaScript(400);
  CHECK(r.bytes() == 0 && run->usage().bytes == 0 && runner->usage().javaScriptBytes == 400);
  ExternalCharge g(std::move(f));
  CHECK(g.bytes() == 400 && f.bytes() == 0);
  g.release();
  CHECK(runner->usage().javaScriptBytes == 0 && g.bytes() == 0);
  c = {};
  r = {};
  CHECK(zero(ledger->usage()) && zero(runner->usage()) && zero(runner2->usage()));
}

// --- threads ---------------------------------------------------------------------

// Gate: charges balance across threads. Threads on their own runs and on
// one shared run reserve, admit (queued and immediate), share, transfer,
// resize and release at once, against a process with few operation slots,
// while waiters read the ledger. Every counter returns to zero.
void concurrentChargesBalance(Suite& t) {
  constexpr int kThreads = 6;
  constexpr int kIterations = 2000;
  ProcessLimits process;
  process.operations = 3;
  auto ledger = std::make_shared<AdmissionLedger>(process);
  auto runner = ledger->openRunner();
  auto shared = runner->openRun();
  auto sharedWaiter = waiterOn(shared);
  std::barrier start(kThreads);
  std::atomic<int> admitted{0};
  std::atomic<int> blocked{0};
  std::vector<std::thread> threads;
  for (int n = 0; n < kThreads; ++n) {
    threads.emplace_back([&, n] {
      auto own = runner->openRun();
      auto ownWaiter = waiterOn(own);
      start.arrive_and_wait();
      for (int i = 0; i < kIterations; ++i) {
        const std::shared_ptr<RunAccount>& account = i % 2 ? own : shared;
        Reservation r(account);
        r.reserveSnapshot(16 + static_cast<uint64_t>(i % 7));
        const Order order = i % 3 ? Order::Immediate : Order::Queue;
        if (r.admit({16, 32, 0}, order) == Admission::Admitted) {
          ++admitted;
          Reservation copy = r.share();
          ExternalCharge charge = copy.transferToJavaScript(8);
          (void)charge.resize(12 + static_cast<uint64_t>(n));
        } else {
          ++blocked;
        }
      }
      own->stopWaiting();
    });
  }
  for (auto& thread : threads) thread.join();
  shared->stopWaiting();
  CHECK(admitted.load() + blocked.load() == kThreads * kIterations);
  CHECK(admitted.load() > 0);
  CHECK(zero(ledger->usage()) && zero(runner->usage()) && zero(shared->usage()));
  CHECK(ledger->waitingRuns() == 0);
}

}  // namespace

int main() {
  Suite suite;
  const std::vector<std::pair<const char*, void (*)(Suite&)>> tests = {
      {"checkedArithmeticAndSnapshotLimits", checkedArithmeticAndSnapshotLimits},
      {"limitsClampToTheDefaults", limitsClampToTheDefaults},
      {"reservationCounts", reservationCounts},
      {"byteAndOperationLimits", byteAndOperationLimits},
      {"queuedStartsKeepTheirTurns", queuedStartsKeepTheirTurns},
      {"deferredStarts", deferredStarts},
      {"stalledStartsFail", stalledStartsFail},
      {"waitersAreToldOutsideTheLock", waitersAreToldOutsideTheLock},
      {"sharedReservationsReleaseOnce", sharedReservationsReleaseOnce},
      {"absorbMovesSnapshotBytes", absorbMovesSnapshotBytes},
      {"retainedBytesFollowTheCharge", retainedBytesFollowTheCharge},
      {"releasedRetainedBytesStopCounting", releasedRetainedBytesStopCounting},
      {"transferredRetainedBytesStopCounting", transferredRetainedBytesStopCounting},
      {"absorbIntoRetainedInput", absorbIntoRetainedInput},
      {"retainedReservationsAreNeverAdmitted", retainedReservationsAreNeverAdmitted},
      {"javaScriptCharges", javaScriptCharges},
      {"concurrentChargesBalance", concurrentChargesBalance},
  };
  const char* only = std::getenv("JOBS_TEST_ONLY");
  for (const auto& [name, fn] : tests) {
    if (only && std::string(only) != name) continue;
    suite.begin(name, std::chrono::seconds(120));
    const int before = suite.failures();
    fn(suite);
    suite.end();
    std::fprintf(stderr, "%s %s\n", suite.failures() == before ? "PASS" : "FAIL", name);
  }
  std::fprintf(stderr, "%d checks, %d failed\n", suite.checks(), suite.failures());
  return suite.failures() == 0 ? 0 : 1;
}
