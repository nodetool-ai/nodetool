// Per-node execution. Port of
// packages/execution-core/src/actor.ts: the correlated buffered scheduler
// (process and genProcess), streaming input with run(), control and Loop.
#pragma once

#include "kernel/correlation.h"
#include "kernel/executor.h"
#include "kernel/graph.h"
#include "kernel/inbox.h"
#include "kernel/json.h"
#include "kernel/omap.h"
#include "kernel/task.h"

#include <map>
#include <optional>
#include <set>
#include <string>
#include <vector>

namespace gr {

struct RoutingHints {
  std::optional<Lineage> invocationLineage;
  std::optional<std::map<std::string, Lineage>> perSlotLineage;
  std::set<std::string> lineageDoneSlots;
};

class ActorHost {
public:
  virtual ~ActorHost() = default;
  virtual Task<void> sendOutputs(std::string nodeId, Json outputs,
                                 RoutingHints hints) = 0;
  virtual void emitMessage(Json msg) = 0;
  virtual void signalSlotEos(const std::string& nodeId,
                             const std::string& slot) = 0;
  // The run was cancelled: actors stop starting work and producing frames.
  virtual Json prepareInputs(const Node&, Json inputs) { return inputs; }
  virtual bool cancelled() const = 0;
  virtual Task<std::optional<Json>> triggerEvent(const Node&, StreamIO&) { co_return std::nullopt; }
};

struct ActorResult {
  Json outputs = Json::object();
  std::vector<Json> invocationOutputs;
  std::optional<std::string> error;
};

class Actor final : public StreamIO {
public:
  Actor(ActorHost& host, const Node& node, Inbox& inbox, Executor& executor,
        const NodeAnalysis* correlation, std::set<std::string> listInputHandles);

  Task<ActorResult> run();

  // StreamIO
  Task<std::optional<std::pair<std::string, Envelope>>> next(
      std::optional<std::string> handle) override;
  Task<void> emit(std::string slot, std::optional<Json> value,
                  std::optional<Lineage> lineage) override;
  Task<void> emitGroup(Json values, std::optional<Lineage> lineage) override;
  Task<void> drop(std::string slot, Lineage lineage) override;
  void complete(const std::string& slot) override;
  bool hasBuffered(const std::string& handle) override;
  bool hasStream(const std::string& handle) override;
  Scope scopeFor(const std::string& handle) override;
  Scope invocationScope() override;

private:
  Task<void> runLoop();
  Task<void> runControlled();
  Task<void> runExecutionMode();
  Task<void> runStreamingInputMode();
  Task<void> runStreamingInputWithoutRun();
  Task<void> runCorrelated();
  Task<void> executeWithInputs(Json inputs);
  Task<void> executeStreaming(Json inputs);
  Task<bool> routeStreamingFrame(const Json& partial);
  Task<void> route(Json outputs, RoutingHints hints);

  Json appendStaticItems(Json edgeInputs) const;
  void commitInvocationResult(const Json& outputs);
  std::optional<Json> mintIterationFrameOverrides(const Json& frame);
  long long mintIterationToken(const std::string& root,
                               const std::string& parentKey);
  std::map<std::string, Lineage> correlatedOutputLineage(
      const Lineage& invocation, const std::vector<std::string>& handles);
  std::optional<RoutingHints> currentHints(
      const std::vector<std::string>& handles);
  std::optional<Lineage> computeInvocationLineage();
  Lineage correlatedInvocationLineage();
  RoutingHints streamingEmitHints(const std::string& slot,
                                  const std::optional<Lineage>& caller);
  std::optional<Lineage> maybeCollapseForSlot(const std::string& slot,
                                              const RoutingHints& hints);
  std::optional<Lineage> maybeMintForSlot(const std::string& slot,
                                          const RoutingHints& hints);

  void emitNodeStatus(const std::string& status, const Json& result = nullptr,
                      const std::optional<std::string>& error = std::nullopt);
  void emitGenerationComplete(const Json& outputs, const Json* inputs);
  // As above, with the reported input properties already taken.
  void emitGenerationCompleteWith(const Json& outputs, Json properties);

  ActorHost& host_;
  const Node& node_;
  Inbox& inbox_;
  Executor& executor_;
  const NodeAnalysis* correlation_;
  std::set<std::string> listInputHandles_;

  std::optional<Json> latestResult_;
  std::vector<std::pair<std::string, Json>> invocationResults_;
  Json streamingCollected_ = Json::object();
  std::optional<Lineage> currentInvocationLineage_;
  OMap<Envelope> lastEnvelopes_;
  std::map<std::string, std::map<std::string, long long>> iterationCounters_;
  std::map<std::string, long long> lastMintedFrameTokens_;
  bool inCorrelatedBuffered_ = false;
  int executionsLogged_ = 0;
};

// Scalars and model references from a resolved input dict, or null.
Json scalarInputProperties(const Json& inputs);

// stderr logging shared by the kernel.
void logLine(const char* level, const std::string& logger,
             const std::string& message);

}  // namespace gr
