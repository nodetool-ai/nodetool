#include "kernel/cancel_state.h"

namespace gr {

uint64_t CancelState::beginRun() {
  std::lock_guard lock(mutex_);
  active_ = true;
  if (!immediate_) {
    requested_ = false;
    deadline_.reset();
  }
  return ++generation_;
}

void CancelState::endRun() {
  std::lock_guard lock(mutex_);
  active_ = false;
  if (!immediate_) {
    requested_ = false;
    deadline_.reset();
  }
}

bool CancelState::request(uint64_t generation, Clock::time_point deadline) {
  std::lock_guard lock(mutex_);
  if (!active_ || generation != generation_) return false;
  requested_ = true;
  if (!deadline_ || deadline < *deadline_) deadline_ = deadline;
  return true;
}

void CancelState::interruptNow() {
  const auto now = Clock::now();
  std::lock_guard lock(mutex_);
  requested_ = true;
  immediate_ = true;
  if (!deadline_ || now < *deadline_) deadline_ = now;
}

CancelSnapshot CancelState::snapshot() const {
  std::lock_guard lock(mutex_);
  return CancelSnapshot{generation_, requested_, immediate_, deadline_};
}

std::optional<CancelSnapshot> CancelState::cancellation(uint64_t generation) const {
  const CancelSnapshot snap = snapshot();
  if (snap.immediate) return snap;
  if (!snap.requested || snap.generation != generation) return std::nullopt;
  return snap;
}

bool CancelState::interruptDue() const {
  const CancelSnapshot snap = snapshot();
  return snap.immediate || (snap.requested && snap.expired(Clock::now()));
}

bool CancelState::cancelled() const {
  std::lock_guard lock(mutex_);
  return immediate_ || (active_ && requested_);
}

}  // namespace gr
