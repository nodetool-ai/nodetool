// The worker's side of native jobs (docs/plans/graph-runner-async-host.md,
// sections 4.2, 4.3 and 4.10).
//
// A host function submits a nodetool::jobs::NativeJob that owns native
// inputs only (native/jobs/include/nodetool/jobs/job_core.h). The job runs on
// an executor, and its JobResult reaches the worker through the run's
// RunMailbox. Only the worker converts the result into a JavaScript value and
// settles the promise its SettlerRegistry holds. Jobs and the mailbox never
// hold a js::Value, a promise capability or a coroutine handle, so a job can
// outlive its run: closing the mailbox ends the job's access to the run, and
// a result delivered after that is destroyed on the delivering thread.
#pragma once

#include "js/engine.h"
#include "js/thread_owner.h"
#include "kernel/task.h"
#include "nodetool/context_options.h"
#include "nodetool/jobs/admission.h"
#include "nodetool/jobs/job_core.h"

#include <atomic>
#include <chrono>
#include <concepts>
#include <condition_variable>
#include <cstdint>
#include <deque>
#include <functional>
#include <map>
#include <memory>
#include <mutex>
#include <optional>
#include <stop_token>
#include <string>
#include <type_traits>
#include <unordered_map>
#include <utility>
#include <vector>

namespace gr {

// What a converter works with: the engine, the result's payload and the
// result's charges. Bytes a converter hands to JavaScript go through
// adoptBytes() or copyBytes(), which account for them in the runner's
// JavaScript external-byte ledger (design section 4.7).
//
// Thread affinity: worker only. Lives for one conversion, and releases the
// charges of its copies after the native payload was destroyed.
class ResultConversion {
public:
  // Results smaller than this are copied by adoptBytes(): the copy is cheap,
  // and it keeps the number of adopted buffers at most the JavaScript cap
  // divided by this size.
  static constexpr size_t kAdoptMinimum = 64 * 1024;

  // `runner` is the runner whose JavaScript ledger takes the bytes. It may
  // be null only for conversions that hand over no bytes.
  ResultConversion(js::Engine& engine, nodetool::jobs::JobPayload* payload, nodetool::jobs::Reservation& reservation,
                   std::shared_ptr<nodetool::jobs::RunnerAccount> runner)
      : engine_(engine), payload_(payload), reservation_(reservation), runner_(std::move(runner)) {}
  ResultConversion(const ResultConversion&) = delete;
  ResultConversion& operator=(const ResultConversion&) = delete;

  js::Engine& engine() const { return engine_; }
  nodetool::jobs::JobPayload* payload() const { return payload_; }

  // A Uint8Array over `bytes`. From kAdoptMinimum bytes on, without a copy:
  // their charge moves from the result's reservation into the JavaScript
  // ledger, in one transaction, and leaves it when the ArrayBuffer is
  // finalized. Smaller ones are copied as copyBytes() does. Throws
  // AdmissionError when the JavaScript ledger cannot take them, which
  // rejects the promise.
  js::Value adoptBytes(std::vector<uint8_t> bytes);
  // A Uint8Array holding a copy. The copy is charged to the JavaScript
  // ledger until the native payload is destroyed, so both representations
  // are charged while both exist. Throws AdmissionError like adoptBytes().
  js::Value copyBytes(const uint8_t* data, size_t size);
  // Charges a copy of `bytes` the converter makes itself, such as a string,
  // in the same way. Call it before making the copy.
  void chargeCopy(uint64_t bytes);

private:
  nodetool::jobs::RunnerAccount& runner() const;

  js::Engine& engine_;
  nodetool::jobs::JobPayload* payload_;
  nodetool::jobs::Reservation& reservation_;
  std::shared_ptr<nodetool::jobs::RunnerAccount> runner_;
  // Released when the conversion ends, after the payload.
  std::vector<nodetool::jobs::ExternalCharge> copies_;
};

// Turns a Value result's payload into the JavaScript value its promise
// resolves with. Runs on the worker. Throwing rejects the promise: with an
// AbortError for JobAborted, with an Error otherwise.
using Converter = std::function<js::Value(js::Engine&, nodetool::jobs::JobPayload*)>;

// A converter in either form: a Converter, or a callable that takes the
// ResultConversion and can hand bytes to JavaScript. Empty resolves with
// undefined.
//
// Thread affinity: worker only, like the settler that holds it.
class ResultConverter {
public:
  ResultConverter() = default;
  ResultConverter(std::nullptr_t) {}
  template <class F>
    requires(std::invocable<F&, js::Engine&, nodetool::jobs::JobPayload*> &&
             !std::same_as<std::remove_cvref_t<F>, ResultConverter>)
  ResultConverter(F convert) {
    if constexpr (std::is_constructible_v<bool, F&>) {
      if (!static_cast<bool>(convert)) return;
    }
    fn_ = [convert = std::move(convert)](ResultConversion& conversion) mutable {
      return convert(conversion.engine(), conversion.payload());
    };
  }
  template <class F>
    requires(std::invocable<F&, ResultConversion&> && !std::invocable<F&, js::Engine&, nodetool::jobs::JobPayload*> &&
             !std::same_as<std::remove_cvref_t<F>, ResultConverter>)
  ResultConverter(F convert) : fn_(std::move(convert)) {}

  explicit operator bool() const { return static_cast<bool>(fn_); }
  js::Value operator()(ResultConversion& conversion) const { return fn_(conversion); }

private:
  std::function<js::Value(ResultConversion&)> fn_;
};

// The worker's pending promises, indexed by job id.
class SettlerRegistry {
public:
  // `account` is the run whose runner's JavaScript ledger takes converted
  // bytes when a result carries no reservation. It may be null.
  explicit SettlerRegistry(js::Engine& engine, std::shared_ptr<nodetool::jobs::RunAccount> account = {})
      : engine_(engine), account_(std::move(account)) {}

  // A cancellable settler is listed by cancellable().
  void add(uint64_t id, js::PromiseCapability capability, ResultConverter convert, bool cancellable = false);
  // Settles the promise registered under result.id: Value resolves with the
  // converted payload, Error rejects with an Error, Stopped with an
  // AbortError. A result without a settler is destroyed. Returns whether a
  // promise was settled.
  bool settle(nodetool::jobs::JobResult result);
  // The ids of the cancellable settlers, in submission order.
  std::vector<uint64_t> cancellable() const;
  // Drops every settler. Its promise stays pending.
  void clear();
  size_t size() const;

private:
  struct Settler {
    js::PromiseCapability capability;
    ResultConverter convert;
    bool cancellable = false;
  };
  js::Value error(const std::string& message, const char* name);

  js::Engine& engine_;
  const std::shared_ptr<nodetool::jobs::RunAccount> account_;
  [[no_unique_address]] ThreadOwner owner_;
  std::unordered_map<uint64_t, Settler> settlers_;
};

// The worker's per-run bridge between host functions and native jobs.
//
// Every job holds a Reservation on the run's admission account (design
// section 4.7). submit() admits a job at once when the run and the process
// have capacity and no earlier start of the run waits, and otherwise defers
// it: the job, with its snapshot, waits in the run's FIFO without an
// executor slot. pollAdmission() admits deferred starts in order once the
// ledger reports released capacity.
//
// Thread affinity: worker only. The admission waiter it registers with the
// ledger is the only part other threads reach, through a weak reference.
class AsyncRun {
public:
  // `identity` names the run to host code, such as the provider job grants,
  // which read it from a context call's completion. It may be empty. Jobs
  // are charged to identity->account, or, when there is none, to a run on a
  // private ledger with the default limits.
  AsyncRun(js::Engine& engine, Loop& loop, std::shared_ptr<nodetool::jobs::RunnerTracker> tracker, uint64_t run,
           nodetool::jobs::JobExecutor& executor, host::RunIdentity identity = {});
  AsyncRun(const AsyncRun&) = delete;
  AsyncRun& operator=(const AsyncRun&) = delete;
  // Tears down, then detaches from every executor it used.
  ~AsyncRun();

  // Worker. Registers a settler and hands `job` to the executor. Returns the
  // promise the job's result settles.
  js::Value submit(std::unique_ptr<nodetool::jobs::NativeJob> job, ResultConverter convert) {
    return submit(executor_, std::move(job), std::move(convert));
  }
  // As above, on `executor`, such as one of the process lanes. The executor
  // must outlive this object, which attaches to it on first use.
  // A cancellable job sees cancel() as a stop, and its promise rejects with
  // an AbortError from cancel(). Submitting one after cancel() throws, and
  // so does submitting after teardown(). Either way the job goes to the
  // executor's disposeUnrun() first, never destroyed on this thread by a
  // pool lane.
  //
  // `reservation` holds the snapshot bytes the host function reserved
  // before copying the job's inputs, from reserve(). Empty: the run's
  // account is charged here. The job's cost() is then checked: a cost that
  // overflows or exceeds a byte limit, or a start that cannot be deferred
  // within the deferred limits, throws AdmissionError after the job went to
  // disposeUnrun().
  js::Value submit(nodetool::jobs::JobExecutor& executor, std::unique_ptr<nodetool::jobs::NativeJob> job,
                   ResultConverter convert, bool cancellable = false, nodetool::jobs::Reservation reservation = {});
  // The executor submit() uses when given none: the run's CPU lane, or the
  // worker in inline mode. A host resource whose operations run there, such
  // as a media session, is created on it.
  nodetool::jobs::JobExecutor& executor() const { return executor_; }
  // Worker. An empty charge on the run's account, for a host function to
  // reserve snapshot bytes in before it copies them (job_inputs.h).
  nodetool::jobs::Reservation reserve() const { return nodetool::jobs::Reservation(account_); }
  const std::shared_ptr<nodetool::jobs::RunAccount>& account() const { return account_; }
  // Worker. A Uint8Array over `bytes` a synchronous host function made, as
  // ResultConversion::adoptBytes() hands over a job's output: from
  // kAdoptMinimum bytes on without a copy, charged to the run's JavaScript
  // ledger until the buffer is finalized. Throws AdmissionError when the
  // ledger cannot take them.
  js::Value adoptBytes(std::vector<uint8_t> bytes);
  // Worker. Admits deferred starts in FIFO order while the ledger lets
  // them, recomputing each one's cost() from its snapshot first. A start
  // whose cost became invalid fails with an Error. Cheap when the ledger
  // reported nothing since the last call.
  void pollAdmission();
  // Deferred starts waiting for admission.
  size_t deferred() const { return deferred_.size(); }
  // Worker. Admits what it can, then settles the oldest waiting result.
  // False when none waits.
  bool dispatchOne();
  // A result waits, or the ledger reported released capacity while a
  // deferred start waits.
  bool resultsPending() const;
  // Submitted jobs whose result has not been dispatched.
  size_t inFlight() const { return settlers_.size(); }
  // Worker. Requests stop on every job of the run, cancellable or not,
  // outside every lock, without closing the mailbox: results still settle, a
  // job's Stopped outcome as an AbortError. teardown() starts with it. The
  // runner calls only cancel() during a cancel grace period, so a job that
  // is not cancellable, such as a provider cursor's close, still runs.
  void requestStop() {
    cancel_.request_stop();
    stop_.request_stop();
  }
  // Worker. The run's cancellation began (design section 4.6): a Stopped
  // result for every cancellable job goes into the mailbox, in submission
  // order, and those jobs are asked to stop. Cancellable deferred starts are
  // dropped without running, which releases their snapshots. Each result settles at the
  // loop's completion point, one per turn like any result, as an AbortError
  // unless a result for that job was dispatched first. The result that is
  // dispatched first settles the promise, and later ones are destroyed.
  // Other jobs, such as cleanup calls, keep running until teardown.
  // Idempotent.
  void cancel();
  bool cancelled() const { return cancel_.stop_requested(); }
  // Worker. Ends the run's side of its jobs, in the order of section 4.10:
  // requests stop outside every lock, closes the mailbox and hands its
  // waiting results to the run's executor for disposal, destroys the jobs
  // still queued on the executors it used and the deferred starts, then
  // drops the settlers. Running jobs and the results they deliver into the
  // closed mailbox keep their reservations until they are disposed. The
  // caller then clears timers, abandons frames and releases run resources.
  // Idempotent.
  void teardown();

  uint64_t run() const { return run_; }
  const host::RunIdentity& identity() const { return identity_; }
  const std::shared_ptr<nodetool::jobs::RunMailbox>& mailbox() const { return mailbox_; }

private:
  // A start waiting for admission. `executor` is one submit() attached to,
  // which outlives this object.
  struct Deferred {
    nodetool::jobs::JobExecutor* executor;
    nodetool::jobs::SubmittedJob job;
    bool cancellable;
  };
  // Tells the run that capacity was released: sets `signaled` and wakes the
  // loop through the mailbox, which drops its wake target at teardown.
  //
  // Thread affinity: thread-safe. `signaled` is atomic, and the mailbox
  // reference is weak and locks the mailbox mutex to wake.
  class Waiter final : public nodetool::jobs::AdmissionWaiter {
  public:
    explicit Waiter(std::weak_ptr<nodetool::jobs::RunMailbox> mailbox) : mailbox_(std::move(mailbox)) {}
    void admissionChanged() noexcept override;
    std::atomic<bool> signaled{false};

  private:
    const std::weak_ptr<nodetool::jobs::RunMailbox> mailbox_;
  };
  // Refuses a job before it reached an executor: its inputs and charge go
  // to `executor`'s disposeUnrun(), then `error` is thrown.
  [[noreturn]] void refuse(nodetool::jobs::JobExecutor& executor, std::unique_ptr<nodetool::jobs::NativeJob> job,
                           nodetool::jobs::Reservation reservation, const std::string& error);
  // Drops the deferred starts `drop` selects without running them.
  template <class Drop>
  void dropDeferred(Drop drop);

  js::Engine& engine_;
  nodetool::jobs::JobExecutor& executor_;
  // Every executor submit() used, for teardown's discardStopped().
  std::vector<nodetool::jobs::JobExecutor*> used_;
  std::shared_ptr<nodetool::jobs::RunnerTracker> tracker_;
  uint64_t run_;
  const host::RunIdentity identity_;
  // The run's admission account. Shared with the run's reservations, which
  // may outlive it.
  const std::shared_ptr<nodetool::jobs::RunAccount> account_;
  std::stop_source stop_;
  // The stop of cancellable jobs: requested by cancel() and by requestStop().
  std::stop_source cancel_;
  // Shared with every job this run submitted. See nodetool::jobs::RunMailbox.
  std::shared_ptr<nodetool::jobs::RunMailbox> mailbox_;
  // Shared with the ledger, which holds it weakly and may tell it from any
  // thread while this object owns it.
  const std::shared_ptr<Waiter> waiter_;
  SettlerRegistry settlers_;
  // Starts waiting for admission, oldest first.
  std::deque<Deferred> deferred_;
  uint64_t nextId_ = 1;
};

// Where host functions find the run they submit to. The runner binds its
// AsyncRun and the run's I/O lane for the length of a run, and the binding is
// empty otherwise, such as while the guest loads. One per engine, kept in
// the engine's host state.
//
// Thread affinity: worker only, checked in debug builds (ThreadOwner).
class RunBinding final : public js::NativePayload {
public:
  // The engine's binding, created on first use.
  static std::shared_ptr<RunBinding> of(js::Engine& engine);

  // Binds `run`, `io` and `network` until the scope ends. They must outlive
  // the scope. Network jobs never fall back to `io`: lane separation is part
  // of the production contract, so a run without `network` binds no network
  // lane and network host functions refuse. A test or an inline runner that
  // wants one executor for both passes it twice. Throws when the engine
  // already has a bound run. Worker only, like the binding.
  class Scope {
  public:
    Scope(js::Engine& engine, AsyncRun& run, nodetool::jobs::JobExecutor& io,
          nodetool::jobs::JobExecutor* network = nullptr);
    ~Scope();
    Scope(const Scope&) = delete;
    Scope& operator=(const Scope&) = delete;

  private:
    std::shared_ptr<RunBinding> binding_;
  };

  // The bound run, or null.
  AsyncRun* run() const;
  // The bound run's I/O lane, or null.
  nodetool::jobs::JobExecutor* io() const;
  // The bound run's network lane, or null when the run bound none.
  nodetool::jobs::JobExecutor* network() const;

private:
  [[no_unique_address]] ThreadOwner owner_;
  // Non-owning. Set and cleared by Scope, which ends before either object.
  AsyncRun* run_ = nullptr;
  nodetool::jobs::JobExecutor* io_ = nullptr;
  nodetool::jobs::JobExecutor* network_ = nullptr;
};

}  // namespace gr
