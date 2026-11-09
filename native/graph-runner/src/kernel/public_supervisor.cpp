#include "kernel/public_supervisor.h"
#include <atomic>
#include <mutex>

namespace gr {
namespace {
const char* name(SupervisorAction action) {
  switch(action) {
    case SupervisorAction::Retry: return "retry";
    case SupervisorAction::Skip: return "skip";
    case SupervisorAction::EndStream: return "end_stream";
    case SupervisorAction::Fail: return "fail";
  }
  return "fail";
}
SupervisorAction actionOf(const std::string& action) {
  if (action=="retry") return SupervisorAction::Retry;
  if (action=="skip") return SupervisorAction::Skip;
  if (action=="end_stream") return SupervisorAction::EndStream;
  return SupervisorAction::Fail;
}
Task<void> nextDecisionPoll() {
  // native-rules #1: shared with a timer callback, no justification
  auto signal=std::make_shared<Signal>();
  Loop::current().setTimer(std::chrono::milliseconds(1),[signal] { signal->notifyAll(); });
  co_await signal->wait();
}
// native-rules #9: shared between loop and supervisor callback thread, no affinity comment
struct Pending {
  // native-rules #10: mutex does not name the data it guards
  std::mutex mutex;
  std::optional<SupervisorVerdict> result;
  std::atomic<bool> cancelled{false};
};
Task<RecoveryDecision> decidePublic(SupervisorOptions::Decide decide,
                                   std::string jobId, RecoveryRequest request,
                                   RecoverySignal signal) {
  // native-rules #1: shared with the decide callback, no justification
  auto pending=std::make_shared<Pending>();
  struct CancelOnExit {
    std::shared_ptr<Pending> pending;
    ~CancelOnExit() { pending->cancelled=true; }
  } cancelOnExit{pending};
  SupervisorRequest publicRequest;
  publicRequest.invocation={jobId,request.nodeId,request.invocationKey,request.attempt,request.executionScope,request.invocationOccurrence};
  publicRequest.error=request.error;
  publicRequest.failureSignature=request.failureSignature;
  for (const auto& action : request.allowedActions) publicRequest.allowedActions.push_back(actionOf(action));
  decide(std::move(publicRequest),[pending] { return pending->cancelled.load(); },
         [pending](SupervisorVerdict result) {
    std::lock_guard lock(pending->mutex);
    if (!pending->cancelled && !pending->result) pending->result=result;
  });
  for (;;) {
    if (signal.aborted()) co_return RecoveryDecision{};
    {
      std::lock_guard lock(pending->mutex);
      if (pending->result) {
        co_return RecoveryDecision{name(pending->result->action),pending->result->applyToSignature};
      }
    }
    co_await nextDecisionPoll();
  }
}
}
void configurePublicSupervisor(ExecutionPolicy& policy, SupervisorOptions options, std::string jobId) {
  if (!options.decide) return;
  policy.maxDecisions=options.maxDecisions;
  policy.maxRetriesPerInvocation=options.maxRetriesPerInvocation;
  policy.decisionTimeout=options.decisionTimeout;
  policy.beginAttempt=[callback=options.beginAttempt,jobId](const std::string& node,
      const std::string& key,int attempt,const std::string& scope,std::uint64_t occurrence) {
    if (callback) callback({jobId,node,key,attempt,scope,occurrence});
  };
  policy.attemptEffects=[callback=options.effects,jobId](const std::string& node,
      const std::string& key,int attempt,const std::string& scope,std::uint64_t occurrence) {
    if (!callback) return InvocationEffects{0,false,false};
    const auto effects=callback({jobId,node,key,attempt,scope,occurrence});
    return InvocationEffects{effects.spentCostUsd,effects.createdAssets,effects.known};
  };
  policy.supervisor=[decide=std::move(options.decide),jobId](RecoveryRequest request,RecoverySignal signal) {
    return decidePublic(decide,jobId,std::move(request),std::move(signal));
  };
}
}
