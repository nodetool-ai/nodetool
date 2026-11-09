#pragma once
#include "kernel/execution_state.h"
#include "kernel/executor.h"
#include "kernel/graph.h"
#include <functional>
#include <cstdint>
#include <set>

namespace gr {
class InvocationSkipped : public NodeError {
public:
  InvocationSkipped() : NodeError("Invocation skipped") {}
};
class InvocationFailure : public NodeError {
public:
  InvocationFailure(const std::string& message, std::string signature)
    : NodeError(message), signature(std::move(signature)) {}
  const std::string signature;
};
struct RecoveryRequest {
  std::string nodeId;
  std::string invocationKey;
  std::string error;
  std::optional<std::string> failureSignature;
  int attempt = 1;
  std::vector<std::string> allowedActions;
  std::string executionScope = "[]";
  std::uint64_t invocationOccurrence = 0;
};
struct RecoveryDecision {
  std::string action = "fail";
  bool applyToSignature = false;
};
struct InvocationEffects { double spentCostUsd = 0; bool createdAssets = false; bool known = true; };
struct RecoverySignal {
  std::function<bool()> aborted;
};
// Callback is local and explicitly supplied. It must observe signal.aborted().
// No callback means no escalation, spend, or retries.
struct SupervisorDecisionBudget {
  size_t decisions = 0;
  bool deciding = false;
};
struct ExecutionPolicy {
  // native-rules #1: shared across policy copies, no justification
  std::shared_ptr<ExecutionState> state;
  std::string userId;
  // Set from RunOptions on each Runner, and copied into child policies.
  std::string executionScope = "[]";
  std::set<std::string> cacheNodeTypes;
  std::function<Task<RecoveryDecision>(RecoveryRequest, RecoverySignal)> supervisor;
  std::function<InvocationEffects(const std::string&)> effects;
  std::function<void(const std::string&,const std::string&,int,const std::string&,std::uint64_t)> beginAttempt;
  std::function<InvocationEffects(const std::string&,const std::string&,int,const std::string&,std::uint64_t)> attemptEffects;
  size_t maxDecisions = 10;
  size_t maxRetriesPerInvocation = 2;
  std::chrono::milliseconds decisionTimeout{60000};
  // Copies made for child runners share the root decision ceiling and queue.
  // Retry and sticky maps below remain local to each child execution scope.
  std::shared_ptr<SupervisorDecisionBudget> decisionBudget = std::make_shared<SupervisorDecisionBudget>();
  std::map<std::pair<std::string,std::string>, RecoveryDecision> sticky;
  std::map<std::pair<std::string,std::string>, size_t> retries;
};
// Wrap at Runner::resolveExecutor, before initialize. Lifecycle still executes
// once, and only successful buffered process results enter the cache.
std::unique_ptr<Executor> statefulExecutor(std::unique_ptr<Executor> inner,
    Node node, std::shared_ptr<ExecutionPolicy> policy,
    std::function<bool()> cancelled);
} // namespace gr
