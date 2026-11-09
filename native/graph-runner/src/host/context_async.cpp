#include "host/context_async.h"

#include <cassert>
#include <exception>
#include <utility>

namespace gr::host {

// --- ContextCompletion --------------------------------------------------------

ContextCompletion::ContextCompletion(std::shared_ptr<ContextCompletionState> state) : state_(std::move(state)) {}

ContextCompletion& ContextCompletion::operator=(ContextCompletion&& other) noexcept {
  if (this != &other) {
    drop();
    state_ = std::move(other.state_);
  }
  return *this;
}

ContextCompletion::~ContextCompletion() { drop(); }

void ContextCompletion::drop() noexcept {
  if (auto state = std::move(state_)) state->dropped();
}

RunIdentity ContextCompletion::run() const { return state_ ? state_->run() : RunIdentity{}; }

void ContextCompletion::operator()(ContextResult result) {
  auto state = std::move(state_);
  // Called twice, or after a move.
  assert(state && "ContextCompletion called more than once");
  if (!state) return;
  state->complete(std::move(result));
}

// --- ContextCompletionState ---------------------------------------------------

ContextCompletionState::ContextCompletionState(std::string operation,
                                               std::shared_ptr<const ContextOptions::AsyncCallback> owner,
                                               std::shared_ptr<StopRelay> relay, JobDelivery delivery,
                                               RunnerTracker::Ticket retention, RunIdentity run)
    : retention_(std::move(retention)), operation_(std::move(operation)), owner_(std::move(owner)),
      relay_(std::move(relay)), run_(std::move(run)) {
  delivery_.emplace(std::move(delivery));
}

void ContextCompletionState::linkRunStop(const std::shared_ptr<ContextCompletionState>& state) {
  std::stop_token runStop;
  {
    std::lock_guard lock(state->mutex_);
    runStop = state->delivery_->runStop();
  }
  // Runs onRunStop() at once when the run already stopped.
  state->runLink_.emplace(runStop, RunStopLink{state});
}

void ContextCompletionState::RunStopLink::operator()() const {
  // The state may be going away on another thread, whose destructor then
  // waits for this callback to return.
  if (auto locked = state.lock()) onRunStop(std::move(locked));
}

void ContextCompletionState::onRunStop(std::shared_ptr<ContextCompletionState> self) {
  // Logical settlement, here: a Stopped result goes to the mailbox now,
  // while the embedder may still hold the completion. The promise rejects
  // with an AbortError when the loop dispatches it, unless AsyncRun::cancel()
  // queued the same rejection first.
  self->settle(Phase::Stopped, JobOutcome::stopped());
  // Physical stop, on the relay's thread: the embedder's stop callbacks run
  // there, so one that blocks cannot block the worker. `self` keeps the state
  // alive until they ran.
  std::shared_ptr<StopRelay> relay = self->relay_;
  std::stop_source stop = self->stop_;
  relay->relay(std::move(stop), std::move(self));
}

bool ContextCompletionState::settle(Phase phase, JobOutcome outcome) {
  std::optional<JobDelivery> delivery;
  {
    std::lock_guard lock(mutex_);
    if (phase_ != Phase::Pending) return false;
    phase_ = phase;
    if (delivery_) {
      delivery.emplace(std::move(*delivery_));
      delivery_.reset();
    }
  }
  // Outside the mutex. A closed mailbox destroys the outcome here, on this
  // thread, without touching the loop.
  if (delivery && *delivery) delivery->deliver(std::move(outcome));
  return true;
}

std::string ContextCompletionState::missing() const {
  return "The context callback for '" + operation_ + "' dropped its completion without calling it";
}

void ContextCompletionState::complete(ContextResult result) {
  if (result.ok) {
    settle(Phase::Value, JobOutcome::value(std::make_unique<ContextResponse>(std::move(result.text))));
  } else {
    settle(Phase::Error, JobOutcome::failure(std::move(result.text)));
  }
}

void ContextCompletionState::dropped() {
  {
    std::lock_guard lock(mutex_);
    if (phase_ != Phase::Pending) return;
    if (invoking_) {
      // The callback may be unwinding from a throw: endInvocation() decides.
      dropped_ = true;
      return;
    }
  }
  settle(Phase::Error, JobOutcome::failure(missing()));
}

void ContextCompletionState::endInvocation(std::optional<std::string> thrown) {
  bool dropped = false;
  {
    std::lock_guard lock(mutex_);
    invoking_ = false;
    if (phase_ != Phase::Pending) return;
    dropped = dropped_;
  }
  if (thrown) {
    settle(Phase::Error, JobOutcome::failure(std::move(*thrown)));
  } else if (dropped) {
    settle(Phase::Error, JobOutcome::failure(missing()));
  }
  // Otherwise the embedder kept the completion, and the call stays pending.
}

// --- ContextJob ---------------------------------------------------------------

namespace {

// Runs the embedder's callback once on the executor thread.
//
// Thread affinity: the executor thread that runs it (the I/O lane, or the
// worker in inline mode).
class ContextJob final : public NativeJob {
public:
  ContextJob(std::string operation, std::string request, std::shared_ptr<const ContextOptions::AsyncCallback> callback,
             std::shared_ptr<StopRelay> relay, RunIdentity run)
      : operation_(std::move(operation)), request_(std::move(request)), callback_(std::move(callback)),
        relay_(std::move(relay)), run_(std::move(run)) {}

  // Never called: start() takes the delivery.
  JobOutcome run(std::stop_token) override { return JobOutcome::failure("context jobs deliver through start()"); }

  std::optional<JobOutcome> start(std::stop_token laneStop, JobDelivery& delivery) override {
    RunnerTracker::Ticket retention = delivery.retain();
    // Shared with the completion the callback receives. See the class
    // comment of ContextCompletionState. The state is the only owner of the
    // callback from here on, so the callback and its captures go no later
    // than the state's tracker ticket.
    auto state = std::make_shared<ContextCompletionState>(std::move(operation_), std::move(callback_),
                                                          std::move(relay_), std::move(delivery),
                                                          std::move(retention), std::move(run_));
    ContextCompletionState::linkRunStop(state);
    // A lane shutdown during the call stops the callback's token. Scoped to
    // the call: the lane forgets the job once start() returns.
    std::weak_ptr<ContextCompletionState> weak = state;
    std::stop_callback laneLink(laneStop, [weak] {
      if (auto locked = weak.lock()) locked->requestStop();
    });
    std::optional<std::string> thrown;
    try {
      state->callback()(std::move(request_), state->token(), ContextCompletion(state));
    } catch (const std::exception& e) {
      thrown = e.what();
    } catch (...) {
      thrown = "The context callback threw";
    }
    state->endInvocation(std::move(thrown));
    return std::nullopt;
  }

private:
  std::string operation_;
  std::string request_;
  std::shared_ptr<const ContextOptions::AsyncCallback> callback_;
  std::shared_ptr<StopRelay> relay_;
  RunIdentity run_;
};

}  // namespace

std::unique_ptr<NativeJob> makeContextJob(std::string operation, std::string request,
                                          std::shared_ptr<const ContextOptions::AsyncCallback> callback,
                                          std::shared_ptr<StopRelay> relay, RunIdentity run) {
  return std::make_unique<ContextJob>(std::move(operation), std::move(request), std::move(callback),
                                      std::move(relay), std::move(run));
}

}  // namespace gr::host
