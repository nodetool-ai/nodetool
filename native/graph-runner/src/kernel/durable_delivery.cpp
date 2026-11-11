#include "kernel/durable_delivery.h"
#include <limits>
namespace gr {
std::string DurableDelivery::address(const std::string& owner, const std::string& workflow,
                                     const std::string& job) {
  return Json::array({owner,workflow,job}).dump();
}
DurableDelivery::DurableDelivery(std::shared_ptr<ExecutionState> state, std::string run)
    : state_(std::move(state)), run_(std::move(run)) {}
void DurableDelivery::restore(const std::string& node, Inbox& inbox) {
  if (!state_) return;
  for (const auto& message : state_->pending(run_,node,std::nullopt,std::numeric_limits<int>::max())) {
    std::string id = message.at("messageId");
    if (!delivered_.insert(id).second) continue;
    const auto& p = message.at("payload");
    inbox.put(message.at("handle"),p.at("data"),lineageFromJson(p.at("lineage")),p.at("edge"));
    pending_[node].push_back(id);
  }
}
void DurableDelivery::put(const std::string& node, Inbox& inbox, const std::string& handle,
                         SharedValue data, Lineage lineage, const std::string& edge) {
  if (!state_) { inbox.put(handle,std::move(data),std::move(lineage),edge); return; }
  auto seq = ++ordinals_[{node,edge}];
  auto id = ExecutionState::messageId(run_,node,edge,seq);
  Json message = state_->append(run_,node,handle,
    // The journal holds the value itself (a copy), not a reference.
    {{"data",*data},{"lineage",lineageToJson(lineage)},{"edge",edge}},id);
  if (message.at("status") == "consumed" || !delivered_.insert(id).second) return;
  pending_[node].push_back(id);
  inbox.put(handle,std::move(data),std::move(lineage),edge);
}
void DurableDelivery::acknowledge(const std::string& node) {
  if (!state_) return;
  for (const auto& id : pending_[node]) state_->acknowledge(id);
  pending_.erase(node);
}
}
