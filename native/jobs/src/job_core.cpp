#include "nodetool/jobs/job_core.h"

#include <exception>
#include <optional>
#include <utility>

namespace nodetool::jobs {

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

}  // namespace nodetool::jobs
