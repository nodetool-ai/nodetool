#include "kernel/runner.h"
namespace gr {
namespace {
void invokeCancelListener(std::function<void()> callback) {
  try { callback(); }
  catch (const std::exception& error) { logLine("WARN","nodetool.kernel.runner",std::string("Cancel listener failed: ") + error.what()); }
  catch (...) { logLine("WARN","nodetool.kernel.runner","Cancel listener failed with a nonstandard exception"); }
}
}
void Runner::notifyCancelListeners() {
  std::vector<size_t> tokens;
  for (const auto& [token,_] : cancelListeners_) tokens.push_back(token);
  for (size_t token : tokens) {
    auto it = cancelListeners_.find(token);
    if (it != cancelListeners_.end()) invokeCancelListener(it->second);
  }
}
size_t Runner::onCancel(std::function<void()> callback) {
  const size_t token = ++nextCancelListener_;
  cancelListeners_.emplace(token,std::move(callback));
  if (cancelled_) invokeCancelListener(cancelListeners_.at(token));
  return token;
}
void Runner::removeCancelListener(size_t token) { cancelListeners_.erase(token); }

Json Runner::prepareInputs(const Node& node, Json inputs) { return catalog_.prepareInputs(node,std::move(inputs)); }
Json GuestCatalog::prepareInputs(const Node& node, Json inputs) {
  auto& e = guest_.engine(); auto fn = guest_.api("prepareInputs");
  if (!e.isFunction(fn)) return inputs;
  // Only a node with typed dynamic slots reads its input values here. For
  // any other node the guest returns the inputs as they are, so their bytes
  // stay in the kernel: the text carries their markers out and back.
  const auto slots = node.raw.find("dynamic_inputs");
  const bool typed = slots != node.raw.end() && slots->is_object() && !slots->empty();
  std::vector<Blob> blobs;
  const std::string text = dumpTransit(inputs, blobs);
  const GuestReply reply = Guest::reply(e, e.call(fn, e.undefined(),
      {e.string(dumpWire(node.raw)), e.string(text), typed ? Guest::bytesOf(e, blobs) : e.undefined()}));
  Json result = Json::parse(reply.text);
  if (!result.value("ok",false)) throw NodeError(result.value("error",std::string("Preparing dynamic inputs failed")));
  Json value = std::move(result.at("value"));
  attachBlobs(value, typed ? reply.blobs : blobs);
  return value;
}
Json GuestCatalog::prepareGraph(Json graph) {
  auto& e = guest_.engine();
  auto fn = guest_.api("prepareGraph");
  if (!e.isFunction(fn)) return graph;
  return Json::parse(e.toString(e.call(fn,e.undefined(),{e.string(dumpWire(graph))})));
}
Json GuestCatalog::prepareInnerGraph(Json graph) {
  auto& e = guest_.engine();
  return Json::parse(e.toString(e.call(guest_.api("prepareInnerGraph"),e.undefined(),{e.string(dumpWire(graph))})));
}
Task<std::optional<Json>> Runner::triggerEvent(const Node& node, StreamIO& io) {
  if (!options_.triggerEvent.is_object() || options_.triggerEvent.value("node_id",std::string()) != node.id) co_return std::nullopt;
  co_return co_await catalog_.triggerEvent(node,options_.triggerEvent,io);
}
Task<std::optional<Json>> GuestCatalog::triggerEvent(const Node& node, Json event, StreamIO& io) {
  auto& e = guest_.engine();
  auto fn = guest_.api("triggerEvent");
  if (!e.isFunction(fn)) throw NodeError("Guest triggerEvent registration is missing");
  const int id = guest_.registerIo(&io);
  std::optional<Json> result;
  std::exception_ptr failure;
  try {
    result = co_await guest_.callSettled(e.call(fn,e.undefined(),{e.string(node.id),e.string(dumpWire(event)),e.number(id)}));
  } catch (...) { failure = std::current_exception(); }
  guest_.unregisterIo(id);
  if (failure) std::rethrow_exception(failure);
  if (!result->value("supported",false)) co_return std::nullopt;
  co_return result->at("outputs");
}
namespace {
class ChildCatalog final : public NodeCatalog {
public:
  ChildCatalog(GuestCatalog& root, Guest& guest, int id) : root_(root),guest_(guest),id_(id) {}
  ~ChildCatalog() override {
    try { auto& e=guest_.engine(); e.call(guest_.api("releaseContext"),e.undefined(),{e.number(id_)}); }
    catch (const std::exception&) { /* An interrupted guest is discarded by the worker. */ }
  }
  Json prepareGraph(Json graph) override { return root_.prepareGraph(std::move(graph)); }
  Json prepareInputs(const Node& node, Json inputs) override { return root_.prepareInputs(node,std::move(inputs)); }
  Json prepareInnerGraph(Json graph) override { return root_.prepareInnerGraph(std::move(graph)); }
  std::optional<Json> describe(const Json& node) override { return root_.describe(node); }
  std::optional<Json> resolve(const std::string& type) override { return root_.resolve(type); }
  Json validate(const Json& node,const std::vector<std::string>& connected) override { return root_.validate(node,connected); }
  std::unique_ptr<Executor> create(const Json& raw) override { Json node=raw; node["__context_id"]=id_; return root_.create(node); }
  void variableChannel(const std::string& op,const std::string& name) override {
    auto& e=guest_.engine(); e.call(guest_.api("variableChannel"),e.undefined(),{e.string(op),e.string(name),e.number(id_)});
  }
  std::unique_ptr<NodeCatalog> forkContext() override {
    auto& e=guest_.engine(); const auto id=e.toNumber(e.call(guest_.api("forkContext"),e.undefined(),{e.number(id_)}));
    return std::make_unique<ChildCatalog>(root_,guest_,static_cast<int>(id));
  }
private:
  GuestCatalog& root_; Guest& guest_; int id_;
};
}
std::unique_ptr<NodeCatalog> GuestCatalog::forkContext() {
  auto& e=guest_.engine(); const auto id=e.toNumber(e.call(guest_.api("forkContext"),e.undefined(),{e.number(0)}));
  return std::make_unique<ChildCatalog>(*this,guest_,static_cast<int>(id));
}
}
