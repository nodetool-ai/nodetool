#include "kernel/destination_queue.h"

#include <stdexcept>
#include <utility>

namespace gr {

// One runnable step on its executor. Detached: it reports through the step,
// never through a mailbox.
//
// Thread affinity: the executor thread that runs it, then the thread that
// destroys it (that thread, a lane's reaper or the process disposer).
// Ownership: unique, inside its SubmittedJob. It holds the queue's state.
class DestinationQueue::StepJob final : public nodetool::jobs::NativeJob {
public:
  StepJob(std::shared_ptr<State> state, std::string key, uint64_t place, std::unique_ptr<DestinationStep> step)
      : state_(std::move(state)), key_(std::move(key)), place_(place), step_(std::move(step)) {}
  StepJob(const StepJob&) = delete;
  StepJob& operator=(const StepJob&) = delete;
  ~StepJob() override {
    // Refused or dropped unrun: the step's destructor reports and cleans up
    // here, then the line moves on.
    step_.reset();
    if (!done_) finished(state_, key_, place_);
  }

  nodetool::jobs::JobOutcome run(std::stop_token) override {
    step_->run();
    step_.reset();
    done_ = true;
    finished(state_, key_, place_);
    return nodetool::jobs::JobOutcome::value(nullptr);
  }

private:
  // Shared: see DestinationQueue.
  std::shared_ptr<State> state_;
  std::string key_;
  uint64_t place_;
  std::unique_ptr<DestinationStep> step_;
  bool done_ = false;
};

DestinationQueue::DestinationQueue(DestinationQueueHooks hooks) : state_(std::make_shared<State>(std::move(hooks))) {}

DestinationQueue::Ticket DestinationQueue::enqueue(std::string key, nodetool::jobs::JobExecutor& executor) {
  uint64_t place = 0;
  {
    std::lock_guard lock(state_->mutex);
    place = state_->next++;
    Slot slot;
    slot.executor = &executor;
    state_->lines[key].emplace(place, std::move(slot));
  }
  return Ticket(state_, std::move(key), place);
}

std::optional<DestinationQueue::Ticket> DestinationQueue::enqueueIfIdle(std::string key) {
  uint64_t place = 0;
  {
    std::lock_guard lock(state_->mutex);
    auto line = state_->lines.find(key);
    if (line != state_->lines.end() && !line->second.empty()) return std::nullopt;
    place = state_->next++;
    state_->lines[key].emplace(place, Slot{});
  }
  return Ticket(state_, std::move(key), place);
}

size_t DestinationQueue::pending(const std::string& key) const {
  std::lock_guard lock(state_->mutex);
  auto it = state_->lines.find(key);
  return it == state_->lines.end() ? 0 : it->second.size();
}

size_t DestinationQueue::destinations() const {
  std::lock_guard lock(state_->mutex);
  return state_->lines.size();
}

void DestinationQueue::schedule(const std::shared_ptr<State>& state, const std::string& key) {
  nodetool::jobs::JobExecutor* executor = nullptr;
  std::unique_ptr<nodetool::jobs::NativeJob> job;
  {
    std::lock_guard lock(state->mutex);
    auto line = state->lines.find(key);
    if (line == state->lines.end()) return;
    auto& slots = line->second;
    while (!slots.empty() && slots.begin()->second.abandoned) slots.erase(slots.begin());
    if (slots.empty()) {
      state->lines.erase(line);
      return;
    }
    Slot& head = slots.begin()->second;
    // Already submitted, or its operation has not handed its step yet.
    if (head.running || !head.step) return;
    head.running = true;
    executor = head.executor;
    job = std::make_unique<StepJob>(state, key, slots.begin()->first, std::move(head.step));
  }
  executor->submit(
      nodetool::jobs::SubmittedJob(0, std::move(job), nullptr, {}, nodetool::jobs::RunnerTracker::Ticket{}));
}

void DestinationQueue::finished(const std::shared_ptr<State>& state, const std::string& key, uint64_t place) {
  {
    std::lock_guard lock(state->mutex);
    auto line = state->lines.find(key);
    if (line != state->lines.end()) line->second.erase(place);
  }
  schedule(state, key);
}

DestinationQueue::Ticket::Ticket(Ticket&& other) noexcept
    : state_(std::move(other.state_)), key_(std::move(other.key_)), place_(other.place_) {}

DestinationQueue::Ticket& DestinationQueue::Ticket::operator=(Ticket&& other) noexcept {
  if (this != &other) {
    abandon();
    state_ = std::move(other.state_);
    key_ = std::move(other.key_);
    place_ = other.place_;
  }
  return *this;
}

DestinationQueue::Ticket::~Ticket() { abandon(); }

void DestinationQueue::Ticket::ready(std::unique_ptr<DestinationStep> step) {
  auto state = std::exchange(state_, nullptr);
  if (!state) return;
  {
    std::lock_guard lock(state->mutex);
    state->lines[key_][place_].step = std::move(step);
  }
  if (state->hooks.at) state->hooks.at("published");
  schedule(state, key_);
}

void DestinationQueue::Ticket::runHere(std::unique_ptr<DestinationStep> step) {
  if (!state_) throw std::logic_error("an empty ticket cannot run a step");
  {
    std::lock_guard lock(state_->mutex);
    auto& slots = state_->lines[key_];
    if (slots.empty() || slots.begin()->first != place_) {
      throw std::logic_error("a destination step can run here only at the head of its line");
    }
    // Claimed: schedule() never submits a running head.
    slots.begin()->second.running = true;
  }
  auto state = std::exchange(state_, nullptr);
  if (state->hooks.at) state->hooks.at("published");
  step->run();
  step.reset();
  finished(state, key_, place_);
}

void DestinationQueue::Ticket::abandon() {
  auto state = std::exchange(state_, nullptr);
  if (!state) return;
  {
    std::lock_guard lock(state->mutex);
    state->lines[key_][place_].abandoned = true;
  }
  schedule(state, key_);
}

}  // namespace gr
