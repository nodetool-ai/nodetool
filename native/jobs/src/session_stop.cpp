#include "nodetool/jobs/session_stop.h"

#include <cassert>
#include <utility>

namespace nodetool::jobs {

SessionStopBridge::SessionStopBridge(Wake wake) : flags_(std::make_shared<Flags>(std::move(wake))) {}

SessionStopBridge::~SessionStopBridge() { assert(!flags_->bound.load() && "a session stop bridge outlived by its binding"); }

void SessionStopBridge::retire() {
  if (flags_->session.exchange(true)) return;
  if (flags_->wake) flags_->wake();
}

bool SessionStopBridge::stopped() const { return flags_->session.load() || flags_->operation.load(); }
bool SessionStopBridge::sessionStopped() const { return flags_->session.load(); }
bool SessionStopBridge::operationStopped() const { return flags_->operation.load(); }
uint64_t SessionStopBridge::activeOperation() const { return flags_->active.load(); }

int SessionStopBridge::interrupt(void* bridge) {
  return static_cast<const SessionStopBridge*>(bridge)->stopped() ? 1 : 0;
}

void SessionStopBridge::Binding::SetFlag::operator()() const {
  flags->operation.store(true);
  if (flags->wake) flags->wake();
}

SessionStopBridge::Binding::Binding(SessionStopBridge& bridge, uint64_t operation, std::stop_token stop)
    : flags_(bridge.flags_) {
  [[maybe_unused]] const bool already = flags_->bound.exchange(true);
  assert(!already && "a session stop bridge bound twice");
  flags_->active.store(operation);
  flags_->operation.store(false);
  callback_.emplace(std::move(stop), SetFlag{flags_});
}

SessionStopBridge::Binding::~Binding() {
  // Waits for a callback running on another thread, so the reset below
  // cannot be overwritten by this operation's late stop.
  callback_.reset();
  flags_->operation.store(false);
  flags_->active.store(0);
  flags_->bound.store(false);
}

}  // namespace nodetool::jobs
