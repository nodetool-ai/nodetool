#pragma once
#include "kernel/execution_state.h"
#include "kernel/inbox.h"
#include <set>

namespace gr {
// Journal deliveries before exposing them to an actor. Acknowledgement follows
// successful actor completion, so a crash/failure replays unacknowledged input.
class DurableDelivery {
public:
  // Collision-safe internal storage address. Owner is the host-granted identity,
  // never graph metadata. Empty identity components remain distinct values.
  static std::string address(const std::string& owner, const std::string& workflow,
                             const std::string& job);
  // Direct callers retain exact addressing. Runner passes address(...) here.
  DurableDelivery(std::shared_ptr<ExecutionState> state, std::string run);
  void restore(const std::string& node, Inbox& inbox);
  void put(const std::string& node, Inbox& inbox, const std::string& handle,
           SharedValue data, Lineage lineage, const std::string& edge);
  void put(const std::string& node, Inbox& inbox, const std::string& handle,
           Json data, Lineage lineage, const std::string& edge) {
    put(node, inbox, handle, SharedValue(std::move(data)), std::move(lineage), edge);
  }
  void acknowledge(const std::string& node);
private:
  std::shared_ptr<ExecutionState> state_;
  std::string run_;
  std::map<std::pair<std::string,std::string>, long long> ordinals_;
  std::set<std::string> delivered_;
  std::map<std::string,std::vector<std::string>> pending_;
};
}
