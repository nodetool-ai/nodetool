// The admission ledger and the JavaScript external-byte ledger
// (docs/plans/graph-runner-async-host.md, section 4.7).
//
// Every native host job holds one Reservation from the moment a host
// function starts copying its inputs until the job's result is disposed or
// the worker converted it. The reservation charges bytes and, once admitted,
// one operation slot against three accounts in one transaction: its run, its
// runner and the process. The ledger refuses an operation larger than a byte
// limit, refuses a snapshot it cannot hold before the copy is made, and tells
// a run whose deferred starts wait for capacity when capacity is released.
//
// Bytes handed to JavaScript without a copy leave the admission ledger for a
// separate JavaScript ledger with its own runner and process caps, in one
// critical section, and leave that ledger when the ArrayBuffer is finalized.
//
// Lock rules: one ledger mutex guards every counter of the ledger and of the
// accounts and reservations opened on it. It is a leaf: no other lock is
// taken while it is held, and nothing is called under it that may take one.
// Waiters are told about released capacity after it is unlocked.
#pragma once

#include <atomic>
#include <cstddef>
#include <cstdint>
#include <map>
#include <memory>
#include <mutex>
#include <optional>
#include <set>
#include <stdexcept>
#include <utility>
#include <vector>

namespace nodetool::jobs {

constexpr uint64_t kKiB = 1024;
constexpr uint64_t kMiB = 1024 * kKiB;
constexpr uint64_t kGiB = 1024 * kMiB;

// An operation the ledger cannot admit or hold, or a size computation that
// overflows. The guest sees its message as an Error.
//
// Thread affinity: none. An exception value, owned by the code that catches it.
struct AdmissionError : std::runtime_error {
  using std::runtime_error::runtime_error;
};

// a + b and a * b, throwing AdmissionError when the result does not fit.
uint64_t checkedAdd(uint64_t a, uint64_t b);
uint64_t checkedMul(uint64_t a, uint64_t b);

// What one operation needs while it is queued, runs and its result waits:
// the inputs it copied, the most its result can hold, and the scratch memory
// it is known to use. A job computes it from its own snapshot, never from
// JavaScript values, so the cost the ledger sees at admission is the cost of
// the bytes the job really holds.
//
// Thread affinity: none. A value with no shared state. Each copy belongs to
// one thread at a time.
struct JobCost {
  uint64_t snapshotBytes = 0;
  uint64_t outputBytes = 0;
  uint64_t workspaceBytes = 0;
  // The sum. Throws AdmissionError on overflow.
  uint64_t total() const;
};

// The process limits. Set once, when the process ledger is created.
//
// Thread affinity: none. A value with no shared state. Each copy belongs to
// one thread at a time.
struct ProcessLimits {
  uint64_t bytes = 4 * kGiB;
  size_t operations = 256;
  uint64_t deferredBytes = 256 * kMiB;
  size_t deferredEntries = 4096;
  uint64_t javaScriptBytes = 4 * kGiB;
  // Each 0 or larger value replaced by its default: configuration may only
  // lower a limit.
  ProcessLimits clamped() const;
};

// The limits of one runner and of each of its runs.
//
// Thread affinity: none. A value with no shared state. Each copy belongs to
// one thread at a time.
struct RunnerLimits {
  uint64_t runBytes = 1 * kGiB;
  size_t runOperations = 64;
  uint64_t runDeferredBytes = 64 * kMiB;
  size_t runDeferredEntries = 1024;
  // The runner's bytes in JavaScript external buffers, across its runs.
  uint64_t javaScriptBytes = 1 * kGiB;
  RunnerLimits clamped() const;
};

// What an account holds. `bytes` includes deferred and retained bytes.
//
// Thread affinity: none. A value with no shared state. The ledger keeps its
// own copies under its mutex and hands out snapshots.
struct LedgerUsage {
  uint64_t bytes = 0;
  size_t operations = 0;
  uint64_t deferredBytes = 0;
  size_t deferredEntries = 0;
  // Bytes of retained reservations (Reservation::retain), which only the
  // guest releases.
  uint64_t retainedBytes = 0;
  uint64_t javaScriptBytes = 0;
};

// Told when capacity was released while its run waits to admit a deferred
// start.
//
// Thread affinity: thread-safe. admissionChanged() runs on whichever thread
// released the capacity, outside every ledger lock.
class AdmissionWaiter {
public:
  virtual ~AdmissionWaiter() = default;
  // Must not block and must not throw. It may take other locks, and may call
  // the ledger.
  virtual void admissionChanged() noexcept = 0;
};

class RunnerAccount;
class RunAccount;
class Reservation;
class ExternalCharge;

// The counters of a process, or of a test that wants its own.
//
// Thread affinity: thread-safe. `mutex_` guards `usage_`, `waiting_`,
// `turns_` and every counter of the accounts, reservations and charges
// opened on this ledger.
//
// Ownership: shared by the accounts, reservations and charges opened on it,
// which travel with jobs and results to lane threads and can outlive their
// runner and its runs, so no single owner can be named. An embedder that
// wants one set of limits for several runners creates the ledger with the
// graph runner's newAdmissionLedger and passes it to each. A runner given none creates
// a private one.
class AdmissionLedger : public std::enable_shared_from_this<AdmissionLedger> {
public:
  // Use std::make_shared: accounts take shared references.
  explicit AdmissionLedger(ProcessLimits limits = {}) : limits_(limits.clamped()) {}
  AdmissionLedger(const AdmissionLedger&) = delete;
  AdmissionLedger& operator=(const AdmissionLedger&) = delete;

  std::shared_ptr<RunnerAccount> openRunner(RunnerLimits limits = {});
  LedgerUsage usage() const;
  const ProcessLimits& limits() const { return limits_; }
  // Runs waiting for capacity to admit a deferred start.
  size_t waitingRuns() const;

private:
  friend class RunnerAccount;
  friend class RunAccount;
  friend class Reservation;
  friend class ExternalCharge;
  using Waiters = std::vector<std::weak_ptr<AdmissionWaiter>>;
  // Locked. The waiters to tell after unlocking.
  Waiters waitersLocked() const;
  static void tell(const Waiters& waiters);

  const ProcessLimits limits_;
  mutable std::mutex mutex_;
  LedgerUsage usage_;
  // Runs with a deferred start, by RunAccount id.
  std::map<uint64_t, std::weak_ptr<AdmissionWaiter>> waiting_;
  // Turns of runs whose deferred head waits for process capacity, in the
  // order they began waiting. A queued admission takes process capacity only
  // when no other run holds an earlier turn.
  std::set<uint64_t> turns_;
  // What each deferred start still needs beyond its snapshot, across runs.
  std::multiset<uint64_t> needs_;
  uint64_t nextTurn_ = 0;
  std::atomic<uint64_t> nextRun_{0};
};

// One runner's share of a ledger: its JavaScript external bytes and the sum
// of its runs.
//
// Thread affinity: thread-safe through its ledger's mutex, which guards
// `usage_`.
//
// Ownership: shared by the runner, its runs, and every reservation and
// charge of them, which can outlive the runner.
class RunnerAccount : public std::enable_shared_from_this<RunnerAccount> {
public:
  // Opened by AdmissionLedger::openRunner.
  RunnerAccount(std::shared_ptr<AdmissionLedger> ledger, RunnerLimits limits)
      : ledger_(std::move(ledger)), limits_(limits.clamped()) {}
  RunnerAccount(const RunnerAccount&) = delete;
  RunnerAccount& operator=(const RunnerAccount&) = delete;

  std::shared_ptr<RunAccount> openRun();
  LedgerUsage usage() const;
  const RunnerLimits& limits() const { return limits_; }
  const std::shared_ptr<AdmissionLedger>& ledger() const { return ledger_; }
  // Charges `bytes` to this runner's and the process's JavaScript caps.
  // Throws AdmissionError when either cap cannot take them.
  ExternalCharge reserveJavaScript(uint64_t bytes);

private:
  friend class AdmissionLedger;
  friend class RunAccount;
  friend class Reservation;
  friend class ExternalCharge;
  const std::shared_ptr<AdmissionLedger> ledger_;
  const RunnerLimits limits_;
  LedgerUsage usage_;
};

// One run's share of a ledger.
//
// Thread affinity: thread-safe through its ledger's mutex, which guards
// `usage_`, `waiter_`, `turn_` and `waiting_`.
//
// Ownership: shared by the run, its RunTag and every reservation of the run,
// which can outlive the run.
class RunAccount {
public:
  // Opened by RunnerAccount::openRun.
  RunAccount(std::shared_ptr<RunnerAccount> runner, uint64_t id) : runner_(std::move(runner)), id_(id) {}
  // Leaves the waiting runs and gives up its turn.
  ~RunAccount();
  RunAccount(const RunAccount&) = delete;
  RunAccount& operator=(const RunAccount&) = delete;

  LedgerUsage usage() const;
  const std::shared_ptr<RunnerAccount>& runner() const { return runner_; }
  const std::shared_ptr<AdmissionLedger>& ledger() const { return runner_->ledger(); }
  // Who to tell when capacity is released while this run waits. Set before
  // the first queued admission.
  void setWaiter(std::weak_ptr<AdmissionWaiter> waiter);
  // The run has no deferred start left: it leaves the waiting runs and gives
  // up its turn.
  void stopWaiting();
  // Throws AdmissionError when an operation of `cost` exceeds a byte limit,
  // so it could never be admitted, and when its size overflows.
  void checkSize(const JobCost& cost) const;

private:
  friend class AdmissionLedger;
  friend class Reservation;
  // Locked. Leaves the waiting runs and gives up the turn. True when a turn
  // was given up, so other waiting runs must be told.
  bool leaveLocked();
  // Locked. Gives up the turn. True when there was one.
  bool releaseTurnLocked();

  const std::shared_ptr<RunnerAccount> runner_;
  const uint64_t id_;
  LedgerUsage usage_;
  // What each of the run's deferred starts still needs beyond its snapshot.
  std::multiset<uint64_t> needs_;
  std::weak_ptr<AdmissionWaiter> waiter_;
  std::optional<uint64_t> turn_;
  bool waiting_ = false;
};

// Bytes charged to a runner's and the process's JavaScript caps, released
// when this object is destroyed: when the ArrayBuffer that holds them is
// finalized, or when a converter's copy no longer overlaps its native
// original.
//
// Thread affinity: one thread at a time. Counters go through the ledger
// mutex.
class ExternalCharge {
public:
  ExternalCharge() = default;
  ExternalCharge(ExternalCharge&& other) noexcept
      : runner_(std::move(other.runner_)), bytes_(std::exchange(other.bytes_, 0)) {}
  ExternalCharge& operator=(ExternalCharge&& other) noexcept;
  ExternalCharge(const ExternalCharge&) = delete;
  ExternalCharge& operator=(const ExternalCharge&) = delete;
  ~ExternalCharge() { release(); }

  uint64_t bytes() const { return bytes_; }
  // Changes the charge to `bytes`. False, leaving it, when a cap cannot take
  // the growth.
  bool resize(uint64_t bytes) noexcept;
  void release() noexcept;

private:
  friend class RunnerAccount;
  friend class Reservation;
  ExternalCharge(std::shared_ptr<RunnerAccount> runner, uint64_t bytes)
      : runner_(std::move(runner)), bytes_(bytes) {}
  std::shared_ptr<RunnerAccount> runner_;
  uint64_t bytes_ = 0;
};

// One operation's charge, from the first snapshot byte until its result is
// disposed. Charged bytes and the operation slot count against the run, its
// runner and the process. A deferred reservation also counts its snapshot
// bytes against the deferred limits. Destroying the last reference releases
// everything and tells waiting runs.
//
// Thread affinity: one thread at a time; it moves with its job between the
// worker, lane threads and the disposer. share() makes a second reference
// for another thread, such as an asynchronous context call's completion
// state while its result travels to the worker. Counters go through the
// ledger mutex.
class Reservation {
public:
  enum class Admission { Admitted, Blocked };
  enum class Order {
    // Waits its turn behind runs that are already waiting for process
    // capacity, and registers its run as waiting when blocked.
    Queue,
    // Takes free capacity now, or none. For operations that cannot wait,
    // such as a provider job start.
    Immediate,
  };

  Reservation() = default;
  // An empty charge on `account`.
  explicit Reservation(std::shared_ptr<RunAccount> account);
  Reservation(Reservation&&) noexcept = default;
  Reservation& operator=(Reservation&&) noexcept = default;
  Reservation(const Reservation&) = delete;
  Reservation& operator=(const Reservation&) = delete;
  ~Reservation() = default;

  explicit operator bool() const { return hold_ != nullptr; }
  // A second reference to the same charge, or an empty one. The charge is
  // released when the last reference goes.
  Reservation share() const;
  // The account charged, or null for an empty reservation.
  std::shared_ptr<RunAccount> account() const;

  // Charges `bytes` more snapshot bytes before they are copied. Throws
  // AdmissionError, charging nothing, when the operation would exceed a
  // byte limit or when the run or the process cannot hold them now.
  void reserveSnapshot(uint64_t bytes);
  // Gives back snapshot bytes that were not needed.
  void releaseSnapshot(uint64_t bytes);
  // Marks this charge as retained input that only the guest releases, such
  // as a provider upload waiting for its start. Its bytes cannot drain by
  // themselves, which admission takes into account. Before admission or
  // deferral, and after its last reserveSnapshot. A retained reservation is
  // never admitted or deferred: a start takes its bytes with absorb(), or
  // its owner destroys it.
  void retain();
  // Takes over the snapshot bytes of `other`, a reservation on the same run
  // that is neither admitted, deferred nor shared, such as the parts of a
  // request reserved as they arrived. This reservation may already be
  // admitted, but not deferred. The bytes stay charged throughout, so no
  // limit is checked.
  void absorb(Reservation other);
  // Revalidates and admits: sets the snapshot charge to cost.snapshotBytes,
  // adds output and workspace bytes and takes the operation slot, all in one
  // transaction. Throws AdmissionError for a cost that overflows or exceeds
  // a byte limit, for a deferred start that can never fit (the deferred
  // snapshots queued behind it, which cannot drain before it, leave too
  // little room for its cost), and for a queued start blocked while nothing
  // in its run, or in the ledger, can drain: no operation runs and every
  // other charged byte is deferred or retained. Blocked charges nothing new.
  // Throws std::logic_error for an empty, admitted or retained reservation.
  Admission admit(const JobCost& cost, Order order);
  // Counts the snapshot bytes against the deferred limits too, for a start
  // of `cost`. Throws AdmissionError when the run or the process cannot
  // defer them, and when the deferred snapshots, with this one, would leave
  // too little room for the start that needs the most beyond its snapshot.
  // Deferred snapshots drain only through admission, so this keeps every
  // deferred start able to fit once the admitted work has drained. Throws
  // std::logic_error for an empty, admitted or retained reservation.
  void defer(const JobCost& cost);
  // Moves `bytes` of this charge into the runner's JavaScript ledger: charges
  // them there, then gives back up to `bytes` of the native charge, in one
  // transaction. Throws AdmissionError, changing nothing, when a JavaScript
  // cap cannot take them.
  ExternalCharge transferToJavaScript(uint64_t bytes);

  // Inspection, for tests.
  uint64_t bytes() const;
  bool admitted() const;
  bool deferred() const;

private:
  struct Hold;
  // Shared between share() references: the charge is one, and it is
  // released when the last of them is gone, on whichever thread that is.
  std::shared_ptr<Hold> hold_;
};

}  // namespace nodetool::jobs
