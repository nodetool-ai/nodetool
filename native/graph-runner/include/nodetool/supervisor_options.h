#pragma once
#include <chrono>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <optional>
#include <string>
#include <vector>

namespace gr {
enum class SupervisorAction { Retry, Skip, EndStream, Fail };
struct InvocationIdentity {
  // Root submitted job ID, retained for GraphRunner.cancel(jobId).
  std::string jobId;
  std::string nodeId;
  std::string invocationKey;
  int attempt = 1;
  // Canonical JSON execution path. Root is []; child scopes identify sibling
  // and nested invocations independently while jobId remains the cancel ID.
  std::string executionScope = "[]";
  // Zero-based occurrence of this lineage in this node's execution scope.
  // Retries retain it; a fresh invocation with the same lineage advances it.
  std::uint64_t invocationOccurrence = 0;
};
struct SupervisorRequest {
  InvocationIdentity invocation;
  // Generic diagnostic only. Node inputs and arbitrary error text stay private.
  std::string error;
  std::optional<std::string> failureSignature;
  std::vector<SupervisorAction> allowedActions;
};
struct SupervisorVerdict {
  SupervisorAction action = SupervisorAction::Fail;
  bool applyToSignature = false;
};
struct SupervisorEffects {
  // Unknown accounting disallows retry. Hosts must explicitly report a known,
  // zero-cost, asset-free attempt before retry becomes eligible.
  bool known = false;
  double spentCostUsd = 0;
  bool createdAssets = false;
};
struct SupervisorOptions {
  using Completion = std::function<void(SupervisorVerdict)>;
  // Called on the runner worker. Return promptly. Completion may be called
  // from another thread, once. Late/duplicate completions are ignored.
  // cancelled() is thread-safe and becomes true at cancellation, deadline, or decision closure.
  using Decide = std::function<void(SupervisorRequest, std::function<bool()> cancelled, Completion)>;
  Decide decide;
  // Reset and read host-maintained effect accounting for this exact attempt.
  // Both callbacks run on the worker. Callback failures fail closed.
  std::function<void(const InvocationIdentity&)> beginAttempt;
  std::function<SupervisorEffects(const InvocationIdentity&)> effects;
  size_t maxDecisions = 10;
  size_t maxRetriesPerInvocation = 2;
  std::chrono::milliseconds decisionTimeout{60000};
};
} // namespace gr
