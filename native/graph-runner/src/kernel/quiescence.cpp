#include "kernel/quiescence.h"
namespace gr {
void Quiescence::add(const std::string& id, Inbox& inbox, bool loop) {
  inboxes_[id] = &inbox;
  if (loop) loops_.insert(id);
  const auto weak = weak_from_this();
  inbox.onPark = [weak] { if (auto self = weak.lock()) self->schedule(); };
  inbox.onActivity = [weak] { if (auto self = weak.lock()) self->activity_ = true; };
}
void Quiescence::schedule() {
  if (scheduled_) return;
  scheduled_ = true;
  const auto weak = weak_from_this();
  Loop::current().setTimer(std::chrono::milliseconds(0),[weak] { if (auto self = weak.lock()) self->check(); });
}
void Quiescence::check() {
  scheduled_ = false;
  if (!activity_) return;
  for (const auto& id : live_) if (!inboxes_.at(id)->isParked()) return;
  activity_ = false;
  for (const auto& id : loops_) if (live_.count(id)) inboxes_.at(id)->notifyQuiescent();
}
}
