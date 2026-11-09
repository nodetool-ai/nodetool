#include "kernel/public_supervisor.h"
#include <iostream>

namespace {
using namespace gr;
// native-rules #14: file-scope mutable test counters
int checks=0;
void check(bool value,const char* message) { ++checks;if(!value) throw std::runtime_error(message); }
template<class T> T finish(Task<T> task) { Loop::current().run();check(task.done(),"task finishes");return task.get(); }
class Body final : public Executor {
public:
  bool alwaysFail=false;
  int calls=0;
  std::vector<std::string> lineages;
  void beginInvocation(const std::string& key) override {lineages.push_back(key);calls=0;}
  Task<void> initialize() override {co_return;}
  Task<void> preProcess() override {co_return;}
  Task<void> finalize() override {co_return;}
  Task<Json> process(Json) override {
    ++calls;
    if(alwaysFail||calls==1) throw InvocationFailure("deliberate invocation failure","code:OCCURRENCE");
    co_return Json{{"output",42}};
  }
  std::unique_ptr<FrameIterator> genProcess(Json) override {throw NodeError("buffered fixture only");}
  bool hasRun() const override {return false;}
  Task<Json> run(StreamIO&) override {throw NodeError("buffered fixture only");co_return Json::object();}
};
void retriesAndLineageForwarding() {
  auto policy=std::make_shared<ExecutionPolicy>();
  SupervisorOptions options;options.maxRetriesPerInvocation=1;
  std::vector<std::pair<std::uint64_t,int>> attempts;
  options.beginAttempt=[&](const InvocationIdentity& identity) {attempts.emplace_back(identity.invocationOccurrence,identity.attempt);};
  options.effects=[](const InvocationIdentity&) {return SupervisorEffects{true,0,false};};
  options.decide=[](SupervisorRequest,std::function<bool()>,SupervisorOptions::Completion done) {done({SupervisorAction::Retry});};
  configurePublicSupervisor(*policy,options,"root");
  auto body=std::make_unique<Body>();auto* observed=body.get();
  Node node;node.id="n";node.type="test";node.retrySafe=true;
  auto executor=statefulExecutor(std::move(body),node,policy,[]{return false;});
  const std::vector<std::string> keys={R"({"loop":{"index":1}})",R"({"loop":{"index":2}})",R"({"loop":{"index":1}})",R"({"loop":{"index":2}})",R"({"loop":{"index":1}})"};
  for(const auto& key:keys) {executor->beginInvocation(key);check(finish(executor->process(Json::object()))==Json{{"output",42}},"each distinct invocation can recover once");}
  check(observed->lineages==keys,"inner F7 seam receives original lineage once per invocation and never on retry");
  const std::vector<std::pair<std::uint64_t,int>> expected={{0,1},{0,2},{0,1},{0,2},{1,1},{1,2},{1,1},{1,2},{2,1},{2,2}};
  check(attempts==expected,"occurrences are per-lineage and stable across retry");
  check(policy->decisionBudget->decisions==5&&policy->retries.size()==5,"five invocations have five independent retry entries under one root budget");
}
void stickyAcrossInvocations() {
  auto policy=std::make_shared<ExecutionPolicy>();
  SupervisorOptions options;int decisions=0;
  std::vector<std::uint64_t> begins,effects;
  options.beginAttempt=[&](const InvocationIdentity& identity) {begins.push_back(identity.invocationOccurrence);};
  options.effects=[&](const InvocationIdentity& identity) {effects.push_back(identity.invocationOccurrence);return SupervisorEffects{true,0,false};};
  options.decide=[&](SupervisorRequest,std::function<bool()>,SupervisorOptions::Completion done) {++decisions;done({SupervisorAction::Skip,true});};
  configurePublicSupervisor(*policy,options,"sticky-root");
  auto body=std::make_unique<Body>();body->alwaysFail=true;
  Node node;node.id="n";node.type="test";node.retrySafe=true;
  auto executor=statefulExecutor(std::move(body),node,policy,[]{return false;});
  for(int i=0;i<3;++i) {
    executor->beginInvocation("{}");bool skipped=false;
    try {finish(executor->process(Json::object()));}catch(const InvocationSkipped&){skipped=true;}
    check(skipped,"sticky skip retires each invocation");
  }
  check(decisions==1&&policy->decisionBudget->decisions==1,"signature-sticky decision intentionally spans distinct occurrences");
  check(begins==std::vector<std::uint64_t>({0,1,2})&&effects==begins,"sticky invocations still receive distinct accounting identities");
}
}
int main() {
  try {retriesAndLineageForwarding();stickyAcrossInvocations();std::cout<<checks<<" kernel occurrence checks passed\n";return 0;}
  catch(const std::exception& error){std::cerr<<error.what()<<'\n';return 1;}
}
