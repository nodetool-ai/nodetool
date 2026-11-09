#include "kernel/async_jobs.h"

#include <algorithm>
#include <cstdio>
#include <exception>
#include <stdexcept>

namespace gr {

// --- RunnerTracker ------------------------------------------------------------

RunnerTracker::Ticket& RunnerTracker::Ticket::operator=(Ticket&& other) noexcept {
  if (this != &other) {
    release();
    tracker_ = std::move(other.tracker_);
    run_ = other.run_;
  }
  return *this;
}

void RunnerTracker::Ticket::release() {
  if (auto tracker = std::exchange(tracker_, nullptr)) tracker->release(run_);
}

RunnerTracker::Ticket RunnerTracker::acquire(uint64_t run) {
  {
    std::lock_guard lock(mutex_);
    ++perRun_[run];
    ++total_;
  }
  return Ticket(shared_from_this(), run);
}

void RunnerTracker::release(uint64_t run) {
  {
    std::lock_guard lock(mutex_);
    auto it = perRun_.find(run);
    if (--it->second == 0) perRun_.erase(it);
    --total_;
  }
  released_.notify_all();
}

size_t RunnerTracker::outstanding() const {
  std::lock_guard lock(mutex_);
  return total_;
}

size_t RunnerTracker::outstanding(uint64_t run) const {
  std::lock_guard lock(mutex_);
  auto it = perRun_.find(run);
  return it == perRun_.end() ? 0 : it->second;
}

bool RunnerTracker::waitIdle(std::chrono::steady_clock::time_point deadline) const {
  std::unique_lock lock(mutex_);
  return released_.wait_until(lock, deadline, [this] { return total_ == 0; });
}

// --- RunMailbox ---------------------------------------------------------------

bool RunMailbox::deliver(JobResult result) {
  std::optional<JobResult> rejected;
  {
    std::lock_guard lock(mutex_);
    if (wake_) {
      results_.push_back(std::move(result));
      wake_->wake();
      return true;
    }
    rejected.emplace(std::move(result));
  }
  rejected.reset();
  return false;
}

void RunMailbox::wake() {
  std::lock_guard lock(mutex_);
  if (wake_) wake_->wake();
}

std::deque<JobResult> RunMailbox::close() {
  std::deque<JobResult> waiting;
  std::lock_guard lock(mutex_);
  wake_ = nullptr;
  waiting.swap(results_);
  return waiting;
}

std::optional<JobResult> RunMailbox::take() {
  std::lock_guard lock(mutex_);
  if (results_.empty()) return std::nullopt;
  std::optional<JobResult> result(std::move(results_.front()));
  results_.pop_front();
  return result;
}

bool RunMailbox::pending() const {
  std::lock_guard lock(mutex_);
  return !results_.empty();
}

bool RunMailbox::closed() const {
  std::lock_guard lock(mutex_);
  return wake_ == nullptr;
}

// --- SettlerRegistry ----------------------------------------------------------

// --- ResultConversion ---------------------------------------------------------

namespace {

// Bytes an adopted ArrayBuffer views, with their charge in the runner's
// JavaScript ledger. The buffer owns it, and finalizing or detaching the
// buffer destroys it: the bytes go first, then the charge.
//
// Thread affinity: the engine's worker, which creates and finalizes it.
class ChargedBytes final : public js::AdoptedBytes {
public:
  ChargedBytes(std::vector<uint8_t> bytes, ExternalCharge charge)
      : charge_(std::move(charge)), bytes_(std::move(bytes)) {}
  uint8_t* data() override { return bytes_.data(); }
  size_t size() const override { return bytes_.size(); }
  // A transfer to another length. The charge follows the bytes, but never
  // drops below the adoption minimum, so the JavaScript cap keeps bounding
  // the number of adopted buffers. A growth the caps cannot take is refused.
  uint8_t* resize(size_t size) noexcept override {
    const uint64_t before = charge_.bytes();
    if (!charge_.resize(std::max<uint64_t>(size, ResultConversion::kAdoptMinimum))) return nullptr;
    try {
      const size_t old = bytes_.size();
      bytes_.resize(size);
      if (size < old) bytes_.shrink_to_fit();
    } catch (...) {
      charge_.resize(before);
      return nullptr;
    }
    return bytes_.data();
  }

private:
  // Declared first, so it is released after the bytes are freed.
  ExternalCharge charge_;
  std::vector<uint8_t> bytes_;
};

}  // namespace

RunnerAccount& ResultConversion::runner() const {
  if (!runner_) throw std::logic_error("no runner account takes converted bytes");
  return *runner_;
}

js::Value ResultConversion::adoptBytes(std::vector<uint8_t> bytes) {
  if (bytes.size() < kAdoptMinimum) return copyBytes(bytes.data(), bytes.size());
  // The charge moves before the native one is released, in one transaction.
  ExternalCharge charge =
      reservation_ ? reservation_.transferToJavaScript(bytes.size()) : runner().reserveJavaScript(bytes.size());
  return engine_.adoptBytes(std::make_unique<ChargedBytes>(std::move(bytes), std::move(charge)));
}

js::Value ResultConversion::copyBytes(const uint8_t* data, size_t size) {
  chargeCopy(size);
  return engine_.bytes(data, size);
}

void ResultConversion::chargeCopy(uint64_t bytes) {
  if (bytes == 0) return;
  copies_.push_back(runner().reserveJavaScript(bytes));
}

void SettlerRegistry::add(uint64_t id, js::PromiseCapability capability, ResultConverter convert, bool cancellable) {
  owner_.check("gr::SettlerRegistry");
  settlers_.insert_or_assign(id, Settler{std::move(capability), std::move(convert), cancellable});
}

std::vector<uint64_t> SettlerRegistry::cancellable() const {
  owner_.check("gr::SettlerRegistry");
  std::vector<uint64_t> ids;
  for (const auto& [id, settler] : settlers_) {
    if (settler.cancellable) ids.push_back(id);
  }
  std::sort(ids.begin(), ids.end());
  return ids;
}

js::Value SettlerRegistry::error(const std::string& message, const char* name) {
  js::Value made = engine_.call(engine_.get(engine_.global(), "Error"), engine_.undefined(),
                                {engine_.string(message)});
  if (name) engine_.set(made, "name", engine_.string(name));
  return made;
}

bool SettlerRegistry::settle(JobResult result) {
  owner_.check("gr::SettlerRegistry");
  auto it = settlers_.find(result.id);
  if (it == settlers_.end()) return false;
  Settler settler = std::move(it->second);
  settlers_.erase(it);
  auto reject = [&](const js::Value& reason) {
    engine_.call(settler.capability.reject, engine_.undefined(), {reason});
  };
  try {
    switch (result.outcome.kind) {
      case JobOutcome::Kind::Value: {
        js::Value value;
        std::optional<std::pair<std::string, const char*>> failure;
        {
          std::shared_ptr<RunnerAccount> runner;
          if (auto account = result.reservation.account()) {
            runner = account->runner();
          } else if (account_) {
            runner = account_->runner();
          }
          ResultConversion conversion(engine_, result.outcome.payload.get(), result.reservation, std::move(runner));
          try {
            value = settler.convert ? settler.convert(conversion) : engine_.undefined();
          } catch (const JobAborted& e) {
            failure.emplace(e.what(), "AbortError");
          } catch (const std::exception& e) {
            failure.emplace(e.what(), nullptr);
          }
          // The native payload goes before the conversion releases the
          // charges of its copies. The reservation goes with the result.
          result.outcome.payload.reset();
        }
        if (failure) {
          reject(error(failure->first, failure->second));
        } else {
          engine_.call(settler.capability.resolve, engine_.undefined(), {value});
        }
        break;
      }
      case JobOutcome::Kind::Error:
        reject(error(result.outcome.error, nullptr));
        break;
      case JobOutcome::Kind::Stopped:
        reject(error(result.outcome.error.empty() ? "The operation was aborted" : result.outcome.error,
                     "AbortError"));
        break;
    }
  } catch (const js::JsError& e) {
    // Settling ran guest code (a thenable) that threw or was interrupted.
    std::fprintf(stderr, "[guest] settling a native job failed: %s\n", e.what());
  }
  return true;
}

void SettlerRegistry::clear() {
  owner_.check("gr::SettlerRegistry");
  auto dropped = std::move(settlers_);
  settlers_.clear();
  dropped.clear();
}

size_t SettlerRegistry::size() const {
  owner_.check("gr::SettlerRegistry");
  return settlers_.size();
}

// --- SubmittedJob -------------------------------------------------------------

bool SubmittedJob::execute(std::stop_token stop) {
  JobDelivery delivery(id_, std::move(mailbox_), std::move(ticket_), stop_, std::move(reservation_));
  std::optional<JobOutcome> outcome;
  try {
    outcome = job_->start(std::move(stop), delivery);
  } catch (const std::exception& e) {
    outcome = JobOutcome::failure(e.what());
  } catch (...) {
    outcome = JobOutcome::failure("native job failed");
  }
  // The job's inputs go before the result travels.
  job_.reset();
  // The job took its delivery and delivers later.
  if (!delivery) return true;
  if (!outcome) outcome = JobOutcome::failure("the native job delivered no result");
  return delivery.deliver(std::move(*outcome));
}

bool SubmittedJob::refuse(JobOutcome outcome) {
  if (!mailbox_) {
    // Detached: the job reports through its own channel. If that fails, its
    // destructor still reports later.
    try {
      if (job_) job_->refused(outcome);
    } catch (...) {
    }
    return false;
  }
  JobResult result;
  result.id = id_;
  result.outcome = std::move(outcome);
  const bool accepted = mailbox_->deliver(std::move(result));
  mailbox_.reset();
  return accepted;
}

bool SubmittedJob::cancel(JobOutcome outcome) {
  job_.reset();
  if (!mailbox_) return false;
  JobResult result;
  result.id = id_;
  result.outcome = std::move(outcome);
  result.ticket = std::move(ticket_);
  result.reservation = std::move(reservation_);
  const bool accepted = mailbox_->deliver(std::move(result));
  mailbox_.reset();
  return accepted;
}

// --- JobExecutor --------------------------------------------------------------

namespace {

// Requests stop on the calling thread.
//
// Thread affinity: thread-safe, stateless.
class InlineStopRelay final : public StopRelay {
public:
  void relay(std::stop_source stop, std::shared_ptr<void> keep) override {
    stop.request_stop();
    keep.reset();
  }
};

}  // namespace

std::shared_ptr<StopRelay> JobExecutor::stopRelay() { return std::make_shared<InlineStopRelay>(); }

// --- JobDelivery --------------------------------------------------------------

JobDelivery::~JobDelivery() {
  if (mailbox_) deliver(JobOutcome::failure("the native job delivered no result"));
}

bool JobDelivery::deliver(JobOutcome outcome) {
  JobResult result;
  result.id = id_;
  result.outcome = std::move(outcome);
  result.ticket = std::move(ticket_);
  result.reservation = std::move(reservation_);
  auto mailbox = std::move(mailbox_);
  return mailbox->deliver(std::move(result));
}

// --- AsyncRun -----------------------------------------------------------------

namespace {

// The identity's account, or a run of a runner on a private ledger with the
// default limits, which the run's reservations keep alive.
std::shared_ptr<RunAccount> accountFor(const host::RunIdentity& identity) {
  if (identity && identity->account) return identity->account;
  return std::make_shared<AdmissionLedger>()->openRunner()->openRun();
}

}  // namespace

void AsyncRun::Waiter::admissionChanged() noexcept {
  signaled.store(true);
  // Wakes a loop waiting with no timer. After teardown the mailbox has no
  // wake target, or is gone.
  if (auto mailbox = mailbox_.lock()) mailbox->wake();
}

AsyncRun::AsyncRun(js::Engine& engine, Loop& loop, std::shared_ptr<RunnerTracker> tracker, uint64_t run,
                   JobExecutor& executor, host::RunIdentity identity)
    : engine_(engine),
      executor_(executor),
      tracker_(std::move(tracker)),
      run_(run),
      identity_(std::move(identity)),
      account_(accountFor(identity_)),
      mailbox_(std::make_shared<RunMailbox>(loop)),
      waiter_(std::make_shared<Waiter>(mailbox_)),
      settlers_(engine, account_) {
  account_->setWaiter(waiter_);
}

void AsyncRun::refuse(JobExecutor& executor, std::unique_ptr<NativeJob> job, Reservation reservation,
                      const std::string& error) {
  // The job's inputs never go on this thread. The ticket keeps the job
  // counted, and the reservation keeps its snapshot charged, until they are
  // gone.
  executor.disposeUnrun(SubmittedJob(0, std::move(job), nullptr, {}, tracker_->acquire(run_), std::move(reservation)));
  throw std::runtime_error(error);
}

js::Value AsyncRun::submit(JobExecutor& executor, std::unique_ptr<NativeJob> job, ResultConverter convert,
                           bool cancellable, Reservation reservation) {
  const bool ended = mailbox_->closed();
  if (ended || (cancellable && cancel_.stop_requested())) {
    refuse(executor, std::move(job), std::move(reservation), ended ? "the run has ended" : "Run cancelled");
  }
  if (!reservation) {
    reservation = Reservation(account_);
  } else if (reservation.account() != account_) {
    refuse(executor, std::move(job), std::move(reservation), "a host job was reserved on another run");
  }
  // Admitted at once only when no earlier start of this run waits, so the
  // run's starts keep their order.
  bool admitted = false;
  std::optional<std::string> refusal;
  try {
    const JobCost cost = job->cost();
    account_->checkSize(cost);
    admitted = deferred_.empty() && reservation.admit(cost, Reservation::Order::Queue) ==
                                        Reservation::Admission::Admitted;
    if (!admitted) reservation.defer(cost);
  } catch (const std::exception& e) {
    refusal = e.what();
  }
  if (refusal) {
    // A blocked admission registered the run as waiting.
    if (deferred_.empty()) account_->stopWaiting();
    refuse(executor, std::move(job), std::move(reservation), *refusal);
  }
  if (std::find(used_.begin(), used_.end(), &executor) == used_.end()) {
    used_.push_back(&executor);
    executor.attach();
  }
  const uint64_t id = nextId_++;
  js::PromiseCapability capability = engine_.newPromise();
  js::Value promise = capability.promise;
  // Registered first, since an inline job delivers before submit returns.
  settlers_.add(id, std::move(capability), std::move(convert), cancellable);
  SubmittedJob submitted(id, std::move(job), mailbox_, (cancellable ? cancel_ : stop_).get_token(),
                         tracker_->acquire(run_), std::move(reservation));
  if (admitted) {
    executor.submit(std::move(submitted));
  } else {
    deferred_.push_back(Deferred{&executor, std::move(submitted), cancellable});
  }
  return promise;
}

void AsyncRun::pollAdmission() {
  if (deferred_.empty()) {
    waiter_->signaled.store(false);
    return;
  }
  if (!waiter_->signaled.exchange(false)) return;
  while (!deferred_.empty()) {
    std::optional<std::string> failure;
    try {
      // Revalidated from the job's own snapshot, with checked arithmetic.
      const JobCost cost = deferred_.front().job.cost();
      if (deferred_.front().job.reservation().admit(cost, Reservation::Order::Queue) ==
          Reservation::Admission::Blocked) {
        break;
      }
    } catch (const std::exception& e) {
      failure = e.what();
    }
    Deferred entry = std::move(deferred_.front());
    deferred_.pop_front();
    if (failure) {
      // The Error first, then the inputs and their charge, off this thread.
      entry.job.refuse(JobOutcome::failure(*failure));
      entry.executor->disposeUnrun(std::move(entry.job));
    } else {
      entry.executor->submit(std::move(entry.job));
    }
  }
  if (deferred_.empty()) account_->stopWaiting();
}

bool AsyncRun::resultsPending() const {
  return mailbox_->pending() || (!deferred_.empty() && waiter_->signaled.load());
}

template <class Drop>
void AsyncRun::dropDeferred(Drop drop) {
  std::deque<Deferred> kept;
  std::deque<Deferred> dropped;
  for (auto& entry : deferred_) (drop(entry) ? dropped : kept).push_back(std::move(entry));
  deferred_.swap(kept);
  if (deferred_.empty()) {
    account_->stopWaiting();
  } else if (!dropped.empty()) {
    // The head may have changed, and a dropped start's release may report
    // nothing, such as a slotless charge of zero bytes. The next poll
    // retries the new head. The worker calls this, so no wake is needed.
    waiter_->signaled.store(true);
  }
  // Never ran: their inputs and snapshots go where the executor disposes of
  // unrun jobs.
  for (auto& entry : dropped) entry.executor->disposeUnrun(std::move(entry.job));
}

bool AsyncRun::dispatchOne() {
  pollAdmission();
  std::optional<JobResult> result = mailbox_->take();
  if (!result) return false;
  settlers_.settle(std::move(*result));
  return true;
}

AsyncRun::~AsyncRun() {
  teardown();
  for (JobExecutor* executor : used_) executor->detach();
}

void AsyncRun::cancel() {
  if (cancel_.stop_requested()) return;
  // Through the mailbox, so the loop settles one per completion turn and the
  // guest's continuation and cleanup for one call run before the next call
  // settles. Queued before the stop request, so they come before the Stopped
  // results that kept completions deliver from their stop.
  for (uint64_t id : settlers_.cancellable()) {
    JobResult stopped;
    stopped.id = id;
    stopped.outcome = JobOutcome::stopped();
    mailbox_->deliver(std::move(stopped));
  }
  dropDeferred([](const Deferred& entry) { return entry.cancellable; });
  cancel_.request_stop();
}

void AsyncRun::teardown() {
  requestStop();
  if (auto waiting = mailbox_->close(); !waiting.empty()) executor_.dispose(std::move(waiting));
  for (JobExecutor* executor : used_) executor->discardStopped();
  dropDeferred([](const Deferred&) { return true; });
  settlers_.clear();
}

// --- RunBinding ---------------------------------------------------------------

namespace {
constexpr const char* kRunBindingState = "gr.runBinding";
}  // namespace

std::shared_ptr<RunBinding> RunBinding::of(js::Engine& engine) {
  if (auto existing = engine.hostState(kRunBindingState)) return std::static_pointer_cast<RunBinding>(existing);
  // Shared: the engine's host state stores shared pointers, and each host
  // function that submits keeps its own reference.
  auto made = std::make_shared<RunBinding>();
  engine.setHostState(kRunBindingState, made);
  return made;
}

RunBinding::Scope::Scope(js::Engine& engine, AsyncRun& run, JobExecutor& io, JobExecutor* network)
    : binding_(RunBinding::of(engine)) {
  binding_->owner_.check("gr::RunBinding");
  if (binding_->run_) throw std::logic_error("the engine already has a bound run");
  binding_->run_ = &run;
  binding_->io_ = &io;
  binding_->network_ = network;
}

RunBinding::Scope::~Scope() {
  binding_->owner_.check("gr::RunBinding");
  binding_->run_ = nullptr;
  binding_->io_ = nullptr;
  binding_->network_ = nullptr;
}

AsyncRun* RunBinding::run() const {
  owner_.check("gr::RunBinding");
  return run_;
}

JobExecutor* RunBinding::io() const {
  owner_.check("gr::RunBinding");
  return io_;
}

JobExecutor* RunBinding::network() const {
  owner_.check("gr::RunBinding");
  return network_;
}

}  // namespace gr
