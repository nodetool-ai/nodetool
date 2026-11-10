// Per-node input queues. Port of packages/execution-core/src/inbox.ts
// without backpressure: the TypeScript runner creates every inbox with no
// buffer limit, so put() never blocks there either.
#pragma once

#include "kernel/json.h"
#include "kernel/task.h"
#include "kernel/value.h"

#include <deque>
#include <map>
#include <optional>
#include <set>
#include <string>
#include <utility>
#include <vector>

namespace gr {

struct Envelope {
  // Shared with the other readers of the same output.
  SharedValue data;
  Lineage lineage;
  std::string sourceEdgeId;
};

class Inbox {
public:
  static constexpr size_t kMaxPendingKeys = 10000;
  static constexpr size_t kMaxPendingMessagesPerKey = 10000;

  void addUpstream(const std::string& handle, int count = 1);
  void put(const std::string& handle, SharedValue data, Lineage lineage = {},
           std::string sourceEdgeId = {});
  void put(const std::string& handle, Json data, Lineage lineage = {},
           std::string sourceEdgeId = {}) {
    put(handle, SharedValue(std::move(data)), std::move(lineage), std::move(sourceEdgeId));
  }
  void prepend(const std::string& handle, Envelope envelope);
  void markSourceDone(const std::string& handle);
  // Lineage signals only wake the consumer in A1; nothing reads them back.
  void signalLineageDone(const std::string& handle, const std::string& edgeId,
                         const std::string& key);
  void signalLineageScopeClosed(const std::string& handle,
                                const std::string& edgeId,
                                const std::string& parentKey,
                                const std::string& root);

  // Next envelope on one handle; nullopt at end of stream.
  Task<std::optional<Envelope>> nextInput(std::string handle);
  // Next envelope on any handle in arrival order; nullopt when drained.
  Task<std::optional<std::pair<std::string, Envelope>>> nextAny();
  std::optional<std::pair<std::string, Envelope>> tryPopAny();
  std::vector<Envelope> drainHandle(const std::string& handle);
  struct ActivityWait {
    Inbox& inbox;
    Signal::Awaiter inner;
    bool await_ready() const { return inner.await_ready(); }
    void await_suspend(std::coroutine_handle<> h) {
      inner.await_suspend(h); inbox.parked_ = true;
      if (inbox.onPark) inbox.onPark();
    }
    void await_resume() { inbox.parked_ = false; inner.await_resume(); }
  };
  ActivityWait waitForActivity() { return {*this,waiters_.wait()}; }
  bool isParked() const { return parked_; }
  void notifyQuiescent() { quiescent_ = true; waiters_.notifyAll(); }
  bool takeQuiescent() { return std::exchange(quiescent_,false); }
  std::function<void()> onPark, onActivity;

  const std::vector<std::string>& handles() const { return order_; }
  bool hasBuffered(const std::string& handle) const;
  bool isOpen(const std::string& handle) const;
  bool isClosed() const { return closed_; }
  bool isFullyDrained() const;
  bool hasPendingWork() const { return !isFullyDrained(); }
  void closeAll();

private:
  bool isHandleDone(const std::string& handle) const;
  void ensure(const std::string& handle);
  void removeFromArrival(const std::string& handle);

  std::map<std::string, std::deque<Envelope>> buffers_;
  std::vector<std::string> order_;  // handle registration order
  std::map<std::string, int> openCounts_;
  std::deque<std::string> arrival_;
  std::map<std::string, std::set<std::string>> doneByEdge_;
  std::map<std::string, std::map<std::string, std::set<std::string>>>
      closedByEdge_;
  bool parked_ = false, quiescent_ = false;
  bool closed_ = false;
  Signal waiters_;
};

}  // namespace gr
