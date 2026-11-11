#include "kernel/inbox.h"

#include <algorithm>

namespace gr {

void Inbox::ensure(const std::string& handle) {
  if (buffers_.emplace(handle, std::deque<Envelope>{}).second) {
    order_.push_back(handle);
  }
}

void Inbox::addUpstream(const std::string& handle, int count) {
  openCounts_[handle] += count;
  ensure(handle);
}

void Inbox::put(const std::string& handle, SharedValue data, Lineage lineage,
                std::string sourceEdgeId) {
  if (closed_) return;
  ensure(handle);
  buffers_[handle].push_back(
      Envelope{std::move(data), std::move(lineage), std::move(sourceEdgeId)});
  arrival_.push_back(handle);
  if (onActivity) onActivity();
  waiters_.notifyAll();
}

void Inbox::prepend(const std::string& handle, Envelope envelope) {
  auto it = buffers_.find(handle);
  if (it == buffers_.end()) return;
  it->second.push_front(std::move(envelope));
  arrival_.push_front(handle);
  if (onActivity) onActivity();
  waiters_.notifyAll();
}

void Inbox::markSourceDone(const std::string& handle) {
  auto it = openCounts_.find(handle);
  if (it != openCounts_.end() && it->second > 0) --it->second;
  if (onActivity) onActivity();
  waiters_.notifyAll();
}

void Inbox::signalLineageDone(const std::string& handle,
                              const std::string& edgeId,
                              const std::string& key) {
  (void)handle;
  doneByEdge_[edgeId].insert(key);
  if (onActivity) onActivity();
  waiters_.notifyAll();
}

void Inbox::signalLineageScopeClosed(const std::string& handle,
                                     const std::string& edgeId,
                                     const std::string& parentKey,
                                     const std::string& root) {
  (void)handle;
  closedByEdge_[edgeId][parentKey].insert(root);
  if (onActivity) onActivity();
  waiters_.notifyAll();
}

void Inbox::removeFromArrival(const std::string& handle) {
  auto it = std::find(arrival_.begin(), arrival_.end(), handle);
  if (it != arrival_.end()) arrival_.erase(it);
}

Task<std::optional<Envelope>> Inbox::nextInput(std::string handle) {
  for (;;) {
    auto it = buffers_.find(handle);
    if (it != buffers_.end() && !it->second.empty()) {
      Envelope e = std::move(it->second.front());
      it->second.pop_front();
      removeFromArrival(handle);
      co_return e;
    }
    if (isHandleDone(handle) || closed_) co_return std::nullopt;
    co_await waitForActivity();
  }
}

std::optional<std::pair<std::string, Envelope>> Inbox::tryPopAny() {
  while (!arrival_.empty()) {
    std::string handle = arrival_.front();
    arrival_.pop_front();
    auto it = buffers_.find(handle);
    if (it != buffers_.end() && !it->second.empty()) {
      Envelope e = std::move(it->second.front());
      it->second.pop_front();
      return std::make_pair(handle, std::move(e));
    }
  }
  return std::nullopt;
}

Task<std::optional<std::pair<std::string, Envelope>>> Inbox::nextAny() {
  for (;;) {
    if (auto popped = tryPopAny()) co_return popped;
    if (isFullyDrained() || closed_) co_return std::nullopt;
    co_await waitForActivity();
  }
}

std::vector<Envelope> Inbox::drainHandle(const std::string& handle) {
  std::vector<Envelope> out;
  auto it = buffers_.find(handle);
  if (it == buffers_.end() || it->second.empty()) return out;
  for (auto& e : it->second) out.push_back(std::move(e));
  it->second.clear();
  arrival_.erase(std::remove(arrival_.begin(), arrival_.end(), handle),
                 arrival_.end());
  return out;
}

bool Inbox::hasBuffered(const std::string& handle) const {
  auto it = buffers_.find(handle);
  return it != buffers_.end() && !it->second.empty();
}

bool Inbox::isOpen(const std::string& handle) const {
  auto it = openCounts_.find(handle);
  return it != openCounts_.end() && it->second > 0;
}

bool Inbox::isHandleDone(const std::string& handle) const {
  return !hasBuffered(handle) && !isOpen(handle);
}

bool Inbox::isFullyDrained() const {
  for (const auto& [handle, buf] : buffers_) {
    if (!buf.empty() || isOpen(handle)) return false;
  }
  return true;
}

void Inbox::closeAll() {
  closed_ = true;
  if (onActivity) onActivity();
  waiters_.notifyAll();
}

}  // namespace gr
