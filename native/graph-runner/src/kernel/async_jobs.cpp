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

void SettlerRegistry::add(uint64_t id, js::PromiseCapability capability, Converter convert) {
  owner_.check("gr::SettlerRegistry");
  settlers_.insert_or_assign(id, Settler{std::move(capability), std::move(convert)});
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
        try {
          value = settler.convert ? settler.convert(engine_, result.outcome.payload.get())
                                  : engine_.undefined();
        } catch (const std::exception& e) {
          result.outcome.payload.reset();
          reject(error(e.what(), nullptr));
          break;
        }
        result.outcome.payload.reset();
        engine_.call(settler.capability.resolve, engine_.undefined(), {value});
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
  JobResult result;
  result.id = id_;
  try {
    result.outcome = job_->run(std::move(stop));
  } catch (const std::exception& e) {
    result.outcome = JobOutcome::failure(e.what());
  } catch (...) {
    result.outcome = JobOutcome::failure("native job failed");
  }
  // The job's inputs go before the result travels.
  job_.reset();
  result.ticket = std::move(ticket_);
  const bool accepted = mailbox_->deliver(std::move(result));
  mailbox_.reset();
  return accepted;
}

bool SubmittedJob::cancel(JobOutcome outcome) {
  job_.reset();
  JobResult result;
  result.id = id_;
  result.outcome = std::move(outcome);
  result.ticket = std::move(ticket_);
  const bool accepted = mailbox_->deliver(std::move(result));
  mailbox_.reset();
  return accepted;
}

// --- AsyncRun -----------------------------------------------------------------

AsyncRun::AsyncRun(js::Engine& engine, Loop& loop, std::shared_ptr<RunnerTracker> tracker, uint64_t run,
                   JobExecutor& executor)
    : engine_(engine),
      executor_(executor),
      tracker_(std::move(tracker)),
      run_(run),
      mailbox_(std::make_shared<RunMailbox>(loop)),
      settlers_(engine) {}

js::Value AsyncRun::submit(JobExecutor& executor, std::unique_ptr<NativeJob> job, Converter convert) {
  if (mailbox_->closed()) throw std::runtime_error("the run has ended");
  if (std::find(used_.begin(), used_.end(), &executor) == used_.end()) used_.push_back(&executor);
  const uint64_t id = nextId_++;
  js::PromiseCapability capability = engine_.newPromise();
  js::Value promise = capability.promise;
  // Registered first, since an inline job delivers before submit returns.
  settlers_.add(id, std::move(capability), std::move(convert));
  executor.submit(SubmittedJob(id, std::move(job), mailbox_, stop_.get_token(), tracker_->acquire(run_)));
  return promise;
}

bool AsyncRun::dispatchOne() {
  std::optional<JobResult> result = mailbox_->take();
  if (!result) return false;
  settlers_.settle(std::move(*result));
  return true;
}

void AsyncRun::teardown() {
  stop_.request_stop();
  if (auto waiting = mailbox_->close(); !waiting.empty()) executor_.dispose(std::move(waiting));
  for (JobExecutor* executor : used_) executor->discardStopped();
  settlers_.clear();
}

}  // namespace gr
