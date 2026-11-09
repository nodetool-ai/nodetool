#include "kernel/state_executor.h"
#include <algorithm>

namespace gr {
namespace {
Task<void> pauseDecision() {
  // native-rules #1: shared with a timer callback, no justification
  auto signal = std::make_shared<Signal>();
  Loop::current().setTimer(std::chrono::milliseconds(1),[signal] { signal->notifyAll(); });
  co_await signal->wait();
}
std::optional<std::string> signatureOf(const std::exception& error) {
  if (auto failure = dynamic_cast<const InvocationFailure*>(&error)) return failure->signature;
  return std::nullopt;
}
class StatefulExecutor final : public Executor {
public:
  StatefulExecutor(std::unique_ptr<Executor> inner, Node node,
      std::shared_ptr<ExecutionPolicy> policy, std::function<bool()> cancelled)
    : inner_(std::move(inner)), node_(std::move(node)), policy_(std::move(policy)), cancelled_(std::move(cancelled)) {}
  Task<void> initialize() override { co_await inner_->initialize(); }
  Task<void> preProcess() override { co_await inner_->preProcess(); }
  Task<void> finalize() override { co_await inner_->finalize(); }
  bool hasRun() const override { return inner_->hasRun(); }
  // This method becomes virtual through the shared executor wiring patch.
  void beginInvocation(const std::string& key) override {
    invocationKey_ = key;
    invocationOccurrence_ = invocationOccurrences_[key]++;
    // The child Subgraph seam still receives only the original lineage.
    inner_->beginInvocation(key);
  }
  Task<Json> process(Json inputs) override {
    if (cancelled_()) throw NodeError("Execution cancelled");
    const bool cacheable = policy_->state && policy_->cacheNodeTypes.contains(node_.type) &&
                           !node_.isStreamingInput && !node_.isStreamingOutput;
    std::string key;
    if (cacheable) {
      key = ExecutionState::cacheKey(policy_->userId,node_.type,inputs);
      if (auto hit = policy_->state->cached(key)) co_return *hit;
    }
    for (int attempt = 1;; ++attempt) {
      if (cancelled_()) throw NodeError("Execution cancelled");
      beginAttempt(attempt);
      std::exception_ptr failure;
      std::optional<std::string> signature;
      Json result;
      try { result = co_await inner_->process(inputs); }
      catch (const std::exception& e) { failure = std::current_exception(); signature = signatureOf(e); }
      if (!failure) {
        if (cacheable && !cancelled_()) policy_->state->cache(key,result);
        co_return result;
      }
      auto decision = co_await recover(signature,attempt,false,false);
      if (decision.action == "retry") continue;
      if (decision.action == "skip") throw InvocationSkipped();
      std::rethrow_exception(failure);
    }
  }
  class Frames final : public FrameIterator {
  public:
    Frames(StatefulExecutor& owner, Json inputs) : owner_(owner), inputs_(std::move(inputs)), frames_(nullptr) { owner_.beginAttempt(attempt_); frames_=owner_.inner_->genProcess(inputs_); }
    Task<std::optional<Json>> next() override {
      if (ended_) co_return std::nullopt;
      for (;;) {
        if (owner_.cancelled_()) { ended_ = true; co_return std::nullopt; }
        std::exception_ptr failure;
        std::optional<std::string> signature;
        std::optional<Json> result;
        try { result = co_await frames_->next(); }
        catch (const std::exception& e) { failure = std::current_exception(); signature = signatureOf(e); }
        if (!failure) {
          if (result && result->is_object() && !result->empty()) emitted_ = true;
          if (!result) ended_ = true;
          co_return result;
        }
        auto decision = co_await owner_.recover(signature,attempt_++,true,emitted_);
        if (decision.action == "retry") { owner_.beginAttempt(attempt_); frames_ = owner_.inner_->genProcess(inputs_); continue; }
        if (decision.action == "end_stream" || decision.action == "skip") { ended_ = true; co_return std::nullopt; }
        std::rethrow_exception(failure);
      }
    }
  private:
    StatefulExecutor& owner_;
    Json inputs_;
    std::unique_ptr<FrameIterator> frames_;
    bool emitted_ = false;
    bool ended_ = false;
    int attempt_ = 1;
  };
  std::unique_ptr<FrameIterator> genProcess(Json inputs) override { return std::make_unique<Frames>(*this,std::move(inputs)); }
  Task<Json> run(StreamIO& io) override {
    beginAttempt(1);
    std::exception_ptr failure;
    std::optional<std::string> signature;
    Json result;
    try { result = co_await inner_->run(io); }
    catch (const std::exception& e) { failure = std::current_exception(); signature = signatureOf(e); }
    if (!failure) co_return result;
    auto decision = co_await recover(signature,1,false,true);
    if (decision.action == "end_stream") co_return Json::object();
    std::rethrow_exception(failure);
  }
private:
  void beginAttempt(int attempt) {
    if (policy_->beginAttempt) policy_->beginAttempt(node_.id,invocationKey_,attempt,policy_->executionScope,invocationOccurrence_);
  }
  Task<RecoveryDecision> recover(const std::optional<std::string>& signature, int attempt, bool streaming, bool emitted) {
    RecoveryDecision fail;
    if (!policy_->supervisor) co_return fail;
    auto budget = policy_->decisionBudget;
    while (budget->deciding && !cancelled_()) co_await pauseDecision();
    if (cancelled_()) co_return fail;
    budget->deciding = true;
    struct Unlock { std::shared_ptr<SupervisorDecisionBudget> budget; ~Unlock() { budget->deciding = false; } } unlock{budget};
    InvocationEffects effects{0,false,false};
    try {
      effects=policy_->attemptEffects ? policy_->attemptEffects(node_.id,invocationKey_,attempt,policy_->executionScope,invocationOccurrence_)
        : policy_->effects ? policy_->effects(node_.id) : InvocationEffects{};
    } catch (...) { co_return fail; }
    bool retrySafe = node_.retrySafe && effects.known && effects.spentCostUsd == 0 && !effects.createdAssets;
    std::vector<std::string> allowed;
    if (node_.isStreamingInput || (streaming && emitted)) allowed = {"end_stream","fail"};
    else { if (retrySafe) allowed.push_back("retry"); allowed.push_back("skip"); allowed.push_back("fail"); }
    // Do not send inputs, secrets or arbitrary exception text to a supervisor.
    // Hosts needing diagnostics provide a redacted reader separately.
    if (signature) {
      auto hit = policy_->sticky.find({node_.id,*signature});
      if (hit != policy_->sticky.end() && std::find(allowed.begin(),allowed.end(),hit->second.action) != allowed.end()) co_return hit->second;
    }
    if (budget->decisions >= policy_->maxDecisions) co_return fail;
    RecoveryRequest request{node_.id,invocationKey_,"Node execution failed",signature,attempt,allowed,policy_->executionScope,invocationOccurrence_};
    auto deadline = Loop::Clock::now() + policy_->decisionTimeout;
    auto expired = [cancelled = cancelled_,deadline] { return cancelled() || Loop::Clock::now() >= deadline; };
    ++budget->decisions;
    RecoveryDecision decision;
    try {
      auto pending = policy_->supervisor(request, RecoverySignal{expired});
      while (!pending.done() && !expired()) co_await pauseDecision();
      if (expired()) co_return fail;
      decision = pending.get();
    }
    catch (...) { co_return fail; }
    if (expired() || std::find(allowed.begin(),allowed.end(),decision.action) == allowed.end()) co_return fail;
    if (decision.action == "retry") {
      auto& used = policy_->retries[{node_.id,Json::array({invocationKey_,invocationOccurrence_}).dump()}];
      if (used >= policy_->maxRetriesPerInvocation) co_return fail;
      ++used;
    }
    if (signature && decision.applyToSignature && (decision.action == "skip" || decision.action == "fail")) {
      policy_->sticky[{node_.id,*signature}] = decision;
    }
    co_return decision;
  }
  std::unique_ptr<Executor> inner_;
  Node node_;
  std::shared_ptr<ExecutionPolicy> policy_;
  std::function<bool()> cancelled_;
  std::string invocationKey_;
  std::uint64_t invocationOccurrence_ = 0;
  std::map<std::string,std::uint64_t> invocationOccurrences_;
};
}
std::unique_ptr<Executor> statefulExecutor(std::unique_ptr<Executor> inner, Node node,
    std::shared_ptr<ExecutionPolicy> policy, std::function<bool()> cancelled) {
  if (!policy) return inner;
  return std::make_unique<StatefulExecutor>(std::move(inner),std::move(node),std::move(policy),std::move(cancelled));
}
} // namespace gr
