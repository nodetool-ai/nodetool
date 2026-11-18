// Workflow graph orchestration. Port of
// packages/execution-core/src/runner.ts (WorkflowRunner).
#pragma once

#include "kernel/actor.h"
#include "kernel/state_executor.h"
#include "kernel/durable_delivery.h"
#include "kernel/quiescence.h"
#include "kernel/correlation.h"
#include "kernel/executor.h"
#include "kernel/graph.h"
#include "kernel/guest.h"
#include "kernel/inbox.h"
#include "kernel/json.h"
#include "kernel/task.h"

#include <chrono>
#include <functional>
#include <map>
#include <memory>
#include <optional>
#include <set>
#include <string>
#include <vector>

namespace gr {

// The node-type capabilities the runner needs. Guest is the production
// implementation; tests supply their own.
class NodeCatalog {
public:
  virtual ~NodeCatalog() = default;
  virtual Json prepareGraph(Json graph) { return graph; }
  virtual Json prepareInputs(const Node&, Json inputs) { return inputs; }
  virtual Json prepareInnerGraph(Json graph) { return graph; }
  virtual std::unique_ptr<NodeCatalog> forkContext() { return nullptr; }
  virtual Task<std::optional<Json>> triggerEvent(const Node&, Json, StreamIO&) { co_return std::nullopt; }
  virtual std::optional<Json> describe(const Json& node) = 0;
  // The registry entry normalizeGraph hydrates a node from, or nullopt for
  // an unknown type.
  virtual std::optional<Json> resolve(const std::string& type) = 0;
  virtual Json validate(const Json& node,
                        const std::vector<std::string>& connected) = 0;
  virtual std::unique_ptr<Executor> create(const Json& node) = 0;
  // Variable channels on the run's context (ProcessingContext
  // registerChannelWriters / markChannelWriterDone / closeAllChannels):
  // `op` is "register", "done" or "closeAll".
  virtual void variableChannel(const std::string& op, const std::string& name) {
    (void)op;
    (void)name;
  }
};

// Adapts Guest, adding the kernel-level Output node.
class GuestCatalog final : public NodeCatalog {
public:
  explicit GuestCatalog(Guest& guest) : guest_(guest) {}
  Json prepareGraph(Json graph) override;
  Json prepareInputs(const Node&, Json inputs) override;
  Json prepareInnerGraph(Json graph) override;
  std::unique_ptr<NodeCatalog> forkContext() override;
  Task<std::optional<Json>> triggerEvent(const Node&, Json, StreamIO&) override;
  std::optional<Json> describe(const Json& node) override;
  std::optional<Json> resolve(const std::string& type) override;
  // Every type create() accepts: the guest's classes and the Output node.
  std::vector<std::string> types();
  Json validate(const Json& node,
                const std::vector<std::string>& connected) override;
  std::unique_ptr<Executor> create(const Json& node) override;
  void variableChannel(const std::string& op, const std::string& name) override;

private:
  const Json& table();

  Guest& guest_;
  std::optional<Json> types_;
};

struct RunOptions {
  std::string jobId = "job";
  std::string workflowId = "wf";
  Json triggerEvent;
  std::string executionScope = "[]";
  std::optional<std::string> rootJobId;
  unsigned innerGraphDepth = 0;
  // native-rules #1: shared with child runners, no comment explains why unique fails
  std::shared_ptr<ExecutionPolicy> executionPolicy;
  // native-rules #1: shared with child runners, no comment explains why unique fails
  std::shared_ptr<ExecutionState> durableState;
};

enum class RunStatus { Completed, Failed, Cancelled };

class Runner final : public ActorHost {
public:
  using Emit = std::function<void(const Json&)>;
  Runner(NodeCatalog& catalog, Emit emit, RunOptions options = {});
  ~Runner() override;

  Task<RunStatus> run(Json graph, Json params);

  // Ends the run as cancelled, like WorkflowRunner.cancel(): closes every
  // inbox so waiting actors finish, and stops producers at their next frame.
  // Call it on the loop's thread.
  void cancel();
  // A live property change of a running node, like
  // WorkflowRunner.updateNodeProperties(). False when the node has no
  // executor or its executor takes no live change, which is not an error:
  // the caller's graph holds the value for the next run. Call it on the
  // loop's thread.
  bool updateNodeProperties(const std::string& nodeId, const Json& properties);
  size_t onCancel(std::function<void()> callback);
  void removeCancelListener(size_t token);

  // RunResult.outputs: the values of every node without outgoing data edges,
  // keyed by the Output node's name, in the order the actors finished.
  // Complete once run() has finished.
  const Json& outputs() const { return outputs_; }

  // ActorHost
  Task<void> sendOutputs(std::string nodeId, Json outputs,
                         RoutingHints hints) override;
  void emitMessage(Json msg) override { emit(std::move(msg)); }
  void signalSlotEos(const std::string& nodeId,
                     const std::string& slot) override;
  bool cancelled() const override { return cancelled_; }
  Json prepareInputs(const Node&, Json inputs) override;
  Task<std::optional<Json>> triggerEvent(const Node&, StreamIO&) override;

private:
  void notifyCancelListeners();
  void emit(Json msg);
  void hydrate(std::vector<Node>& nodes);
  void validateNodes();
  void validateRequiredInputs(const Json& params);
  void detectMultiEdgeListInputs();
  void initializeInboxes();
  Task<void> initializeGraph();
  Task<void> dispatchInputs(Json params);
  Task<void> processGraph();
  Task<void> runActor(const Node* node);
  void sendEos(const std::string& nodeId);
  bool markEdgeSourceDoneOnce(const Edge& edge);
  void incrementEdgeCounter(const Edge& edge);
  void flushEdgeCounters();
  void drainActiveEdges();
  Executor& resolveExecutor(const Node& node);
  bool isExternalInputNode(const Node& node) const;
  std::string externalInputName(const Node& node) const;
  std::string outputCollectionKey(const Node& node) const;
  void collectOutputs(const Node& node, const ActorResult& result);
  void emitJobUpdate(const std::string& status,
                     const std::optional<std::string>& error,
                     const Json* validationIssues);

  NodeCatalog& catalog_;
  Emit emit_;
  RunOptions options_;
  std::unique_ptr<DurableDelivery> durableDelivery_;
  Graph graph_;
  bool haveGraph_ = false;
  bool cancelled_ = false;
  size_t nextCancelListener_ = 0;
  std::map<size_t,std::function<void()>> cancelListeners_;
  CorrelationResult correlation_;
  std::map<std::string, std::unique_ptr<Inbox>> inboxes_;
  std::map<std::string, std::unique_ptr<Executor>> executors_;
  std::map<std::string, std::set<std::string>> multiEdgeListInputs_;
  std::vector<std::unique_ptr<Actor>> actors_;
  std::vector<std::pair<std::string, std::string>> nodeErrors_;  // ordered
  std::set<std::string> eosSentEdges_;
  std::map<std::string, long long> edgeCounters_;
  std::map<std::string, std::chrono::steady_clock::time_point> edgeLastEmit_;
  std::vector<std::string> edgeDirty_;  // insertion-ordered set
  Json outputs_ = Json::object();
  // native-rules #1: shared_ptr kept for weak_ptr timer callbacks, no justification
  std::shared_ptr<Quiescence> quiescence_;
};

}  // namespace gr
