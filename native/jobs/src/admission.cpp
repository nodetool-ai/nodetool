#include "nodetool/jobs/admission.h"

#include <algorithm>
#include <limits>
#include <string>

namespace nodetool::jobs {
namespace {

// Whether `used + add` exceeds `limit`, without overflowing.
bool exceeds(uint64_t used, uint64_t add, uint64_t limit) { return used > limit || add > limit - used; }

std::string mib(uint64_t bytes) {
  if (bytes % kMiB == 0) return std::to_string(bytes / kMiB) + " MiB";
  return std::to_string(bytes) + " bytes";
}

template <class T>
T clampTo(T value, T fallback) {
  return value == 0 || value > fallback ? fallback : value;
}

}  // namespace

uint64_t checkedAdd(uint64_t a, uint64_t b) {
  if (b > std::numeric_limits<uint64_t>::max() - a) throw AdmissionError("the size of a host operation overflows");
  return a + b;
}

uint64_t checkedMul(uint64_t a, uint64_t b) {
  if (a != 0 && b > std::numeric_limits<uint64_t>::max() / a) throw AdmissionError("the size of a host operation overflows");
  return a * b;
}

uint64_t JobCost::total() const { return checkedAdd(checkedAdd(snapshotBytes, outputBytes), workspaceBytes); }

ProcessLimits ProcessLimits::clamped() const {
  const ProcessLimits defaults;
  ProcessLimits out;
  out.bytes = clampTo(bytes, defaults.bytes);
  out.operations = clampTo(operations, defaults.operations);
  out.deferredBytes = clampTo(deferredBytes, defaults.deferredBytes);
  out.deferredEntries = clampTo(deferredEntries, defaults.deferredEntries);
  out.javaScriptBytes = clampTo(javaScriptBytes, defaults.javaScriptBytes);
  return out;
}

RunnerLimits RunnerLimits::clamped() const {
  const RunnerLimits defaults;
  RunnerLimits out;
  out.runBytes = clampTo(runBytes, defaults.runBytes);
  out.runOperations = clampTo(runOperations, defaults.runOperations);
  out.runDeferredBytes = clampTo(runDeferredBytes, defaults.runDeferredBytes);
  out.runDeferredEntries = clampTo(runDeferredEntries, defaults.runDeferredEntries);
  out.javaScriptBytes = clampTo(javaScriptBytes, defaults.javaScriptBytes);
  return out;
}

// --- AdmissionLedger ----------------------------------------------------------

std::shared_ptr<RunnerAccount> AdmissionLedger::openRunner(RunnerLimits limits) {
  return std::make_shared<RunnerAccount>(shared_from_this(), limits);
}

LedgerUsage AdmissionLedger::usage() const {
  std::lock_guard lock(mutex_);
  return usage_;
}

size_t AdmissionLedger::waitingRuns() const {
  std::lock_guard lock(mutex_);
  return waiting_.size();
}

AdmissionLedger::Waiters AdmissionLedger::waitersLocked() const {
  Waiters out;
  out.reserve(waiting_.size());
  for (const auto& [id, waiter] : waiting_) out.push_back(waiter);
  return out;
}

void AdmissionLedger::tell(const Waiters& waiters) {
  for (const auto& waiter : waiters) {
    if (auto locked = waiter.lock()) locked->admissionChanged();
  }
}

// --- RunnerAccount ------------------------------------------------------------

std::shared_ptr<RunAccount> RunnerAccount::openRun() {
  return std::make_shared<RunAccount>(shared_from_this(), ledger_->nextRun_.fetch_add(1) + 1);
}

LedgerUsage RunnerAccount::usage() const {
  std::lock_guard lock(ledger_->mutex_);
  return usage_;
}

ExternalCharge RunnerAccount::reserveJavaScript(uint64_t bytes) {
  {
    std::lock_guard lock(ledger_->mutex_);
    if (exceeds(usage_.javaScriptBytes, bytes, limits_.javaScriptBytes)) {
      throw AdmissionError("the runner's JavaScript buffers would exceed " + mib(limits_.javaScriptBytes));
    }
    if (exceeds(ledger_->usage_.javaScriptBytes, bytes, ledger_->limits_.javaScriptBytes)) {
      throw AdmissionError("the process's JavaScript buffers would exceed " + mib(ledger_->limits_.javaScriptBytes));
    }
    usage_.javaScriptBytes += bytes;
    ledger_->usage_.javaScriptBytes += bytes;
  }
  return ExternalCharge(shared_from_this(), bytes);
}

// --- RunAccount ---------------------------------------------------------------

RunAccount::~RunAccount() {
  AdmissionLedger::Waiters waiters;
  {
    std::lock_guard lock(ledger()->mutex_);
    if (leaveLocked()) waiters = ledger()->waitersLocked();
  }
  AdmissionLedger::tell(waiters);
}

LedgerUsage RunAccount::usage() const {
  std::lock_guard lock(ledger()->mutex_);
  return usage_;
}

void RunAccount::setWaiter(std::weak_ptr<AdmissionWaiter> waiter) {
  std::lock_guard lock(ledger()->mutex_);
  waiter_ = std::move(waiter);
  if (waiting_) ledger()->waiting_[id_] = waiter_;
}

void RunAccount::stopWaiting() {
  AdmissionLedger::Waiters waiters;
  {
    std::lock_guard lock(ledger()->mutex_);
    if (leaveLocked()) waiters = ledger()->waitersLocked();
  }
  AdmissionLedger::tell(waiters);
}

bool RunAccount::leaveLocked() {
  AdmissionLedger& ledger = *runner_->ledger_;
  if (waiting_) {
    ledger.waiting_.erase(id_);
    waiting_ = false;
  }
  return releaseTurnLocked();
}

bool RunAccount::releaseTurnLocked() {
  if (!turn_) return false;
  runner_->ledger_->turns_.erase(*turn_);
  turn_.reset();
  return true;
}

void RunAccount::checkSize(const JobCost& cost) const {
  const uint64_t total = cost.total();
  const uint64_t runLimit = runner_->limits_.runBytes;
  const uint64_t processLimit = ledger()->limits_.bytes;
  if (total > runLimit) {
    throw AdmissionError("a host operation needs " + std::to_string(total) + " bytes, more than the run limit of " +
                         mib(runLimit));
  }
  if (total > processLimit) {
    throw AdmissionError("a host operation needs " + std::to_string(total) +
                         " bytes, more than the process limit of " + mib(processLimit));
  }
}

// --- ExternalCharge -----------------------------------------------------------

ExternalCharge& ExternalCharge::operator=(ExternalCharge&& other) noexcept {
  if (this != &other) {
    release();
    runner_ = std::move(other.runner_);
    bytes_ = std::exchange(other.bytes_, 0);
  }
  return *this;
}

bool ExternalCharge::resize(uint64_t bytes) noexcept {
  if (!runner_) return false;
  AdmissionLedger& ledger = *runner_->ledger_;
  std::lock_guard lock(ledger.mutex_);
  if (bytes > bytes_) {
    const uint64_t growth = bytes - bytes_;
    if (exceeds(runner_->usage_.javaScriptBytes, growth, runner_->limits_.javaScriptBytes) ||
        exceeds(ledger.usage_.javaScriptBytes, growth, ledger.limits_.javaScriptBytes)) {
      return false;
    }
    runner_->usage_.javaScriptBytes += growth;
    ledger.usage_.javaScriptBytes += growth;
  } else {
    const uint64_t shrink = bytes_ - bytes;
    runner_->usage_.javaScriptBytes -= shrink;
    ledger.usage_.javaScriptBytes -= shrink;
  }
  bytes_ = bytes;
  return true;
}

void ExternalCharge::release() noexcept {
  auto runner = std::move(runner_);
  if (!runner) return;
  {
    AdmissionLedger& ledger = *runner->ledger_;
    std::lock_guard lock(ledger.mutex_);
    runner->usage_.javaScriptBytes -= bytes_;
    ledger.usage_.javaScriptBytes -= bytes_;
  }
  bytes_ = 0;
}

// --- Reservation --------------------------------------------------------------

// The charge itself. Every field below `account` is guarded by the ledger
// mutex.
//
// Thread affinity: thread-safe through the ledger mutex. Destroyed on the
// thread that drops the last Reservation referring to it.
struct Reservation::Hold {
  explicit Hold(std::shared_ptr<RunAccount> run) : account(std::move(run)) {}
  Hold(const Hold&) = delete;
  Hold& operator=(const Hold&) = delete;
  ~Hold();

  // Applies `fn` to the run's, the runner's and the process's usage.
  template <class F>
  void each(F fn) {
    fn(account->usage_);
    fn(account->runner_->usage_);
    fn(account->runner_->ledger_->usage_);
  }

  const std::shared_ptr<RunAccount> account;
  uint64_t bytes = 0;
  uint64_t snapshot = 0;
  bool slot = false;
  bool deferred = false;
  // Retained input (Reservation::retain): its bytes count as retained.
  bool retained = false;
  uint64_t deferredBytes = 0;
  // While deferred: what the start needs beyond its snapshot.
  uint64_t need = 0;

  // Locked. Removes the deferred charge from the counters.
  void undeferLocked() {
    if (!deferred) return;
    each([&](LedgerUsage& usage) {
      usage.deferredBytes -= deferredBytes;
      --usage.deferredEntries;
    });
    account->needs_.erase(account->needs_.find(need));
    account->ledger()->needs_.erase(account->ledger()->needs_.find(need));
    deferred = false;
    deferredBytes = 0;
    need = 0;
  }
};

Reservation::Hold::~Hold() {
  AdmissionLedger& ledger = *account->ledger();
  AdmissionLedger::Waiters waiters;
  {
    std::lock_guard lock(ledger.mutex_);
    const bool released = bytes > 0 || slot;
    undeferLocked();
    each([&](LedgerUsage& usage) {
      usage.bytes -= bytes;
      if (slot) --usage.operations;
      if (retained) usage.retainedBytes -= bytes;
    });
    if (released) waiters = ledger.waitersLocked();
  }
  // Outside the ledger mutex: a waiter takes its mailbox lock.
  AdmissionLedger::tell(waiters);
}

Reservation::Reservation(std::shared_ptr<RunAccount> account) {
  if (account) hold_ = std::make_shared<Hold>(std::move(account));
}

Reservation Reservation::share() const {
  Reservation copy;
  copy.hold_ = hold_;
  return copy;
}

std::shared_ptr<RunAccount> Reservation::account() const { return hold_ ? hold_->account : nullptr; }

void Reservation::reserveSnapshot(uint64_t bytes) {
  if (!hold_) throw std::logic_error("an empty reservation cannot hold snapshot bytes");
  if (bytes == 0) return;
  RunAccount& run = *hold_->account;
  RunnerAccount& runner = *run.runner_;
  AdmissionLedger& ledger = *runner.ledger_;
  std::lock_guard lock(ledger.mutex_);
  if (hold_->deferred || hold_->slot || hold_->retained) {
    throw std::logic_error("snapshot bytes are reserved before admission and retention");
  }
  const uint64_t total = checkedAdd(hold_->bytes, bytes);
  if (total > runner.limits_.runBytes) {
    throw AdmissionError("a host operation's inputs need " + std::to_string(total) +
                         " bytes, more than the run limit of " + mib(runner.limits_.runBytes));
  }
  if (total > ledger.limits_.bytes) {
    throw AdmissionError("a host operation's inputs need " + std::to_string(total) +
                         " bytes, more than the process limit of " + mib(ledger.limits_.bytes));
  }
  if (exceeds(run.usage_.bytes, bytes, runner.limits_.runBytes)) {
    throw AdmissionError("the run's host operations already hold their " + mib(runner.limits_.runBytes));
  }
  if (exceeds(ledger.usage_.bytes, bytes, ledger.limits_.bytes)) {
    throw AdmissionError("the process's host operations already hold their " + mib(ledger.limits_.bytes));
  }
  hold_->each([&](LedgerUsage& usage) { usage.bytes += bytes; });
  hold_->bytes += bytes;
  hold_->snapshot += bytes;
}

void Reservation::releaseSnapshot(uint64_t bytes) {
  if (!hold_) return;
  AdmissionLedger& ledger = *hold_->account->ledger();
  AdmissionLedger::Waiters waiters;
  {
    std::lock_guard lock(ledger.mutex_);
    if (hold_->deferred) throw std::logic_error("a deferred reservation keeps its snapshot bytes");
    const uint64_t released = std::min(bytes, hold_->snapshot);
    if (released == 0) return;
    hold_->each([&](LedgerUsage& usage) {
      usage.bytes -= released;
      if (hold_->retained) usage.retainedBytes -= released;
    });
    hold_->bytes -= released;
    hold_->snapshot -= released;
    waiters = ledger.waitersLocked();
  }
  AdmissionLedger::tell(waiters);
}

void Reservation::retain() {
  if (!hold_) throw std::logic_error("an empty reservation cannot be retained");
  std::lock_guard lock(hold_->account->ledger()->mutex_);
  if (hold_->slot || hold_->deferred) throw std::logic_error("a reservation is retained before admission");
  if (hold_->retained) return;
  hold_->each([&](LedgerUsage& usage) { usage.retainedBytes += hold_->bytes; });
  hold_->retained = true;
}

void Reservation::absorb(Reservation other) {
  if (!other.hold_) return;
  if (!hold_ || other.hold_->account != hold_->account || other.hold_.use_count() != 1) {
    throw std::logic_error("only an unshared reservation of the same run can be absorbed");
  }
  std::lock_guard lock(hold_->account->ledger()->mutex_);
  if (hold_->deferred || other.hold_->slot || other.hold_->deferred) {
    throw std::logic_error("only unadmitted snapshot bytes are absorbed, into a reservation that is not deferred");
  }
  // Absorbed into a start, retained input is no longer retained. Absorbed
  // into retained input, it becomes retained.
  if (other.hold_->retained != hold_->retained) {
    const uint64_t moved = other.hold_->bytes;
    hold_->each([&](LedgerUsage& usage) {
      if (hold_->retained) {
        usage.retainedBytes += moved;
      } else {
        usage.retainedBytes -= moved;
      }
    });
  }
  other.hold_->retained = false;
  hold_->bytes += std::exchange(other.hold_->bytes, 0);
  hold_->snapshot += std::exchange(other.hold_->snapshot, 0);
}

Reservation::Admission Reservation::admit(const JobCost& cost, Order order) {
  if (!hold_) throw std::logic_error("an empty reservation cannot be admitted");
  RunAccount& run = *hold_->account;
  run.checkSize(cost);
  const uint64_t total = cost.total();
  RunnerAccount& runner = *run.runner_;
  AdmissionLedger& ledger = *runner.ledger_;
  AdmissionLedger::Waiters waiters;
  Admission admission = Admission::Blocked;
  {
    std::lock_guard lock(ledger.mutex_);
    if (hold_->slot) throw std::logic_error("a reservation is admitted once");
    // Admission changes the charge's size and makes it drain, which the
    // retained count cannot follow. A start absorbs retained input instead.
    if (hold_->retained) throw std::logic_error("a retained reservation is absorbed into a start, never admitted");
    const uint64_t add = total > hold_->bytes ? total - hold_->bytes : 0;
    const uint64_t give = hold_->bytes > total ? hold_->bytes - total : 0;
    const RunnerLimits& limits = runner.limits_;
    auto wait = [&] {
      if (order == Order::Queue && !run.waiting_) {
        run.waiting_ = true;
        ledger.waiting_[run.id_] = run.waiter_;
      }
    };
    // Whether anything charged to `usage` besides this reservation can still
    // drain: an operation that runs, or bytes that are neither deferred nor
    // retained, such as another worker's snapshot on its way to submission.
    const uint64_t own = hold_->deferred ? 0 : hold_->bytes;
    auto drainable = [&](const LedgerUsage& usage) {
      return usage.operations > 0 || usage.bytes > usage.retainedBytes + usage.deferredBytes + own;
    };
    auto stalled = [&](const char* scope, uint64_t limit) {
      return AdmissionError("a waiting host operation can never start: it needs " + std::to_string(total) +
                            " bytes, and nothing that can drain holds the rest of the " + scope + "'s " +
                            mib(limit) + ". Inputs only the guest can release, such as provider uploads, "
                            "hold the rest");
    };
    bool turnReleased = false;
    if (run.usage_.operations >= limits.runOperations || exceeds(run.usage_.bytes - give, add, limits.runBytes)) {
      // Blocked by the run's own limits, it waits for its own operations,
      // not for the process, so it holds no turn. Runs that waited behind
      // its turn may go first now.
      // The run's later deferred snapshots cannot drain before this start.
      // Checked before the turn goes, so a refusal changes nothing.
      if (hold_->deferred && run.usage_.deferredBytes - hold_->deferredBytes + total > limits.runBytes) {
        throw AdmissionError("a waiting host operation needs " + std::to_string(total) +
                             " bytes, more than the run's later waiting inputs leave of its " +
                             mib(limits.runBytes));
      }
      if (order == Order::Queue && !drainable(run.usage_)) throw stalled("run", limits.runBytes);
      turnReleased = run.releaseTurnLocked();
      wait();
    } else if (const bool full = ledger.usage_.operations >= ledger.limits_.operations ||
                                 exceeds(ledger.usage_.bytes - give, add, ledger.limits_.bytes);
               full || (order == Order::Queue && !ledger.turns_.empty() &&
                        (!run.turn_ || *run.turn_ != *ledger.turns_.begin()))) {
      // Full while nothing anywhere can drain: no release will come.
      if (order == Order::Queue && full && !drainable(ledger.usage_)) throw stalled("ledger", ledger.limits_.bytes);
      // Blocked by the process, or behind a run that waits for it.
      if (order == Order::Queue && !run.turn_) {
        run.turn_ = ++ledger.nextTurn_;
        ledger.turns_.insert(*run.turn_);
      }
      // Holding the first turn, no other run's deferred snapshot drains
      // before this start.
      if (hold_->deferred && run.turn_ && *run.turn_ == *ledger.turns_.begin() &&
          ledger.usage_.deferredBytes - hold_->deferredBytes + total > ledger.limits_.bytes) {
        throw AdmissionError("a waiting host operation needs " + std::to_string(total) +
                             " bytes, more than the waiting inputs leave of the process's " +
                             mib(ledger.limits_.bytes));
      }
      wait();
    } else {
      hold_->undeferLocked();
      hold_->each([&](LedgerUsage& usage) {
        usage.bytes = usage.bytes - give + add;
        ++usage.operations;
      });
      hold_->bytes = total;
      hold_->snapshot = cost.snapshotBytes;
      hold_->slot = true;
      turnReleased = run.releaseTurnLocked();
      admission = Admission::Admitted;
    }
    // A shrunk snapshot gave capacity back, and a released turn lets the
    // next run in turn order try. A deferred entry gave back deferred room,
    // which admits nothing by itself.
    if (give > 0 && admission == Admission::Admitted) turnReleased = true;
    if (turnReleased) waiters = ledger.waitersLocked();
  }
  AdmissionLedger::tell(waiters);
  return admission;
}

void Reservation::defer(const JobCost& cost) {
  if (!hold_) throw std::logic_error("an empty reservation cannot be deferred");
  RunAccount& run = *hold_->account;
  RunnerAccount& runner = *run.runner_;
  AdmissionLedger& ledger = *runner.ledger_;
  const uint64_t total = cost.total();
  std::lock_guard lock(ledger.mutex_);
  if (hold_->slot) throw std::logic_error("an admitted reservation cannot be deferred");
  if (hold_->retained) throw std::logic_error("a retained reservation is absorbed into a start, never deferred");
  if (hold_->deferred) return;
  const uint64_t bytes = hold_->snapshot;
  const uint64_t need = total > hold_->bytes ? total - hold_->bytes : 0;
  const RunnerLimits& limits = runner.limits_;
  if (run.usage_.deferredEntries >= limits.runDeferredEntries ||
      exceeds(run.usage_.deferredBytes, bytes, limits.runDeferredBytes)) {
    throw AdmissionError("the run cannot defer more host operations (" + std::to_string(limits.runDeferredEntries) +
                         " entries, " + mib(limits.runDeferredBytes) + ")");
  }
  if (ledger.usage_.deferredEntries >= ledger.limits_.deferredEntries ||
      exceeds(ledger.usage_.deferredBytes, bytes, ledger.limits_.deferredBytes)) {
    throw AdmissionError("the process cannot defer more host operations (" +
                         std::to_string(ledger.limits_.deferredEntries) + " entries, " +
                         mib(ledger.limits_.deferredBytes) + ")");
  }
  // Head-of-line room: once admitted work drained, only deferred snapshots
  // remain, and the start that needs the most beyond its snapshot must still
  // fit beside them, in its run and in the process.
  auto room = [&](uint64_t deferred, const std::multiset<uint64_t>& needs, uint64_t limit) {
    const uint64_t most = std::max(need, needs.empty() ? 0 : *needs.rbegin());
    return !exceeds(deferred, checkedAdd(bytes, most), limit);
  };
  if (!room(run.usage_.deferredBytes, run.needs_, limits.runBytes)) {
    throw AdmissionError("a waiting host operation would leave too little room for the run's waiting operations "
                         "within its " + mib(limits.runBytes));
  }
  if (!room(ledger.usage_.deferredBytes, ledger.needs_, ledger.limits_.bytes)) {
    throw AdmissionError("a waiting host operation would leave too little room for the process's waiting "
                         "operations within its " + mib(ledger.limits_.bytes));
  }
  hold_->each([&](LedgerUsage& usage) {
    usage.deferredBytes += bytes;
    ++usage.deferredEntries;
  });
  run.needs_.insert(need);
  ledger.needs_.insert(need);
  hold_->deferred = true;
  hold_->deferredBytes = bytes;
  hold_->need = need;
}

ExternalCharge Reservation::transferToJavaScript(uint64_t bytes) {
  if (!hold_) throw std::logic_error("an empty reservation has nothing to transfer");
  RunAccount& run = *hold_->account;
  std::shared_ptr<RunnerAccount> runner = run.runner_;
  AdmissionLedger& ledger = *runner->ledger_;
  AdmissionLedger::Waiters waiters;
  {
    std::lock_guard lock(ledger.mutex_);
    if (exceeds(runner->usage_.javaScriptBytes, bytes, runner->limits_.javaScriptBytes)) {
      throw AdmissionError("the runner's JavaScript buffers would exceed " + mib(runner->limits_.javaScriptBytes));
    }
    if (exceeds(ledger.usage_.javaScriptBytes, bytes, ledger.limits_.javaScriptBytes)) {
      throw AdmissionError("the process's JavaScript buffers would exceed " + mib(ledger.limits_.javaScriptBytes));
    }
    // Charged in the JavaScript ledger first, then given back natively, in
    // the same critical section: no observer sees the bytes uncharged.
    runner->usage_.javaScriptBytes += bytes;
    ledger.usage_.javaScriptBytes += bytes;
    const uint64_t moved = std::min(bytes, hold_->bytes);
    if (moved > 0) {
      hold_->each([&](LedgerUsage& usage) {
        usage.bytes -= moved;
        if (hold_->retained) usage.retainedBytes -= moved;
      });
      hold_->bytes -= moved;
      hold_->snapshot = std::min(hold_->snapshot, hold_->bytes);
      waiters = ledger.waitersLocked();
    }
  }
  AdmissionLedger::tell(waiters);
  return ExternalCharge(std::move(runner), bytes);
}

uint64_t Reservation::bytes() const {
  if (!hold_) return 0;
  std::lock_guard lock(hold_->account->ledger()->mutex_);
  return hold_->bytes;
}

bool Reservation::admitted() const {
  if (!hold_) return false;
  std::lock_guard lock(hold_->account->ledger()->mutex_);
  return hold_->slot;
}

bool Reservation::deferred() const {
  if (!hold_) return false;
  std::lock_guard lock(hold_->account->ledger()->mutex_);
  return hold_->deferred;
}

}  // namespace nodetool::jobs
