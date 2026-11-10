#include "kernel/execution_state.h"
#include "kernel/durable_delivery.h"
#include "kernel/state_executor.h"
#include "kernel/runner.h"
#include "js/engine.h"
#include <filesystem>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <unistd.h>

using namespace gr;
namespace {
// native-rules #14: file-scope mutable test counters
int checks = 0;
void check(bool ok, const std::string& reason) {
  ++checks;
  if (!ok) throw std::runtime_error(reason);
}
template<class T> T finish(Task<T> task) {
  Loop::current().run();
  check(task.done(),"task must finish");
  return task.get();
}
class Body final : public Executor {
public:
  int calls = 0;
  int failures = 0;
  Task<void> initialize() override { co_return; }
  Task<void> preProcess() override { co_return; }
  Task<void> finalize() override { co_return; }
  Task<Json> process(Json inputs) override {
    ++calls;
    if (calls <= failures) throw InvocationFailure("deliberate failure","code:TEST");
    co_return Json{{"output",inputs.at("value")}};
  }
  class Frames final : public FrameIterator {
  public:
    Task<std::optional<Json>> next() override { throw NodeError("stream failed"); co_return std::nullopt; }
  };
  std::unique_ptr<FrameIterator> genProcess(Json) override { return std::make_unique<Frames>(); }
  bool hasRun() const override { return false; }
  Task<Json> run(StreamIO&) override { co_return Json::object(); }
};
void cacheAndRecovery() {
  auto policy = std::make_shared<ExecutionPolicy>();
  policy->state = std::make_shared<ExecutionState>();
  policy->cacheNodeTypes.insert("test");
  auto body = std::make_unique<Body>(); auto* observed = body.get();
  Node node; node.id="n"; node.type="test"; node.retrySafe=true;
  bool cancelled=false;
  auto executor = statefulExecutor(std::move(body),node,policy,[&]{return cancelled;});
  check(finish(executor->process({{"value",1}})) == Json{{"output",1}},"cold execution");
  finish(executor->process({{"value",1}})); check(observed->calls==1,"cache hit bypasses body");
  finish(executor->process({{"value",2}})); check(observed->calls==2,"input change misses");
  auto key=ExecutionState::cacheKey("","test",{{"value",1}});
  policy->state->invalidate(key); finish(executor->process({{"value",1}}));
  check(observed->calls==3,"invalidation executes body");
  policy->state->cache("expired",true,-1); check(!policy->state->cached("expired"),"expiry");
  policy->state->cache("null",nullptr,0); check(policy->state->cached("null").has_value(),"null is cached");
  check(ExecutionState::cacheKey("u","t",{{"x",{{"b",1},{"a",2}}}})==
        ExecutionState::cacheKey("u","t",{{"x",{{"a",2},{"b",1}}}}),"deep key ordering");
  check(ExecutionState::cacheKey("u","t",{{"x",{{"a",1}}}})!=
        ExecutionState::cacheKey("u","t",{{"x",{{"a",2}}}}),"nested values cannot collide");
  observed->failures=100;
  for(int i=0;i<2;++i) { try { finish(executor->process({{"value",3}})); check(false,"must fail"); } catch(const NodeError&) {} }
  check(observed->calls==5,"failures are not cached");
  int decisions=0;
  policy->supervisor=[&](RecoveryRequest request,RecoverySignal signal)->Task<RecoveryDecision> {
    ++decisions; check(!signal.aborted(),"live decision");
    check(request.allowedActions.front()=="retry","retry safe allowed");
    co_return RecoveryDecision{"retry"};
  };
  try { finish(executor->process({{"value",4}})); check(false,"retry limit terminal failure"); } catch(const NodeError&) {}
  check(observed->calls==8 && decisions==3,"two retries then terminal failure");
  policy->retries.clear(); policy->decisionBudget->decisions=0; observed->failures=observed->calls+1;
  finish(executor->process({{"value",5}})); check(observed->calls==10,"retry succeeds");
  observed->failures=100;
  policy->effects=[](const std::string&){ return InvocationEffects{1,true}; };
  policy->supervisor=[&](RecoveryRequest r,RecoverySignal)->Task<RecoveryDecision> {
    check(std::find(r.allowedActions.begin(),r.allowedActions.end(),"retry")==r.allowedActions.end(),"side effects disallow retry");
    co_return RecoveryDecision{"retry"};
  };
  try { finish(executor->process({{"value",6}})); check(false,"unsafe retry rejected"); } catch(const NodeError&) {}
  check(observed->calls==11,"unsafe body executes once");
  policy->effects={};
  policy->maxDecisions=policy->decisionBudget->decisions;
  int before=observed->calls;
  try { finish(executor->process({{"value",8}})); check(false,"decision cap fails"); } catch(const NodeError&) {}
  check(observed->calls==before+1,"decision cap no retry");
  policy->maxDecisions=100;
  policy->supervisor=[](RecoveryRequest,RecoverySignal)->Task<RecoveryDecision> { throw std::runtime_error("supervisor broken"); co_return RecoveryDecision{}; };
  before=observed->calls;
  try { finish(executor->process({{"value",9}})); check(false,"broken supervisor fails closed"); } catch(const NodeError&) {}
  check(observed->calls==before+1,"broken supervisor no retry");
  policy->supervisor=[](RecoveryRequest,RecoverySignal signal)->Task<RecoveryDecision> {
    while(!signal.aborted()) co_await Tick{};
    co_return RecoveryDecision{"retry"};
  };
  policy->decisionTimeout=std::chrono::milliseconds(2);
  before=observed->calls;
  try { finish(executor->process({{"value",10}})); check(false,"timed out supervisor fails closed"); } catch(const NodeError&) {}
  check(observed->calls==before+1,"timeout no retry");
  policy->decisionTimeout=std::chrono::milliseconds(100);
  policy->supervisor=[&](RecoveryRequest,RecoverySignal)->Task<RecoveryDecision> { cancelled=true; co_return RecoveryDecision{"retry"}; };
  before=observed->calls;
  try { finish(executor->process({{"value",11}})); check(false,"cancel during decision fails"); } catch(const NodeError&) {}
  check(observed->calls==before+1,"cancel during decision no retry");
  cancelled=true;
  try { finish(executor->process({{"value",7}})); check(false,"cancel must fail"); } catch(const NodeError&) {}
  check(observed->calls==before+1,"cancel starts no body");
}
void streamRecovery() {
  auto policy=std::make_shared<ExecutionPolicy>();
  policy->supervisor=[](RecoveryRequest request,RecoverySignal)->Task<RecoveryDecision> {
    check(request.allowedActions==std::vector<std::string>({"retry","skip","fail"}),"unemitted stream can retry safely");
    co_return RecoveryDecision{"end_stream"};
  };
  Node node; node.id="stream"; node.type="test"; node.retrySafe=true; node.isStreamingOutput=true;
  auto executor=statefulExecutor(std::make_unique<Body>(),node,policy,[]{return false;});
  auto frames=executor->genProcess(Json::object());
  try { finish(frames->next()); check(false,"illegal end_stream before emit fails"); } catch(const NodeError&) {}
  policy->supervisor=[](RecoveryRequest,RecoverySignal)->Task<RecoveryDecision> { co_return RecoveryDecision{"skip"}; };
  frames=executor->genProcess(Json::object()); check(!finish(frames->next()),"skip terminates stream");
  policy->supervisor=[](RecoveryRequest,RecoverySignal)->Task<RecoveryDecision> { co_return RecoveryDecision{"skip",true}; };
  auto body=std::make_unique<Body>(); body->failures=100;
  node.isStreamingOutput=false;
  executor=statefulExecutor(std::move(body),node,policy,[]{return false;});
  auto before=policy->decisionBudget->decisions;
  for(int i=0;i<2;++i) {
    try { finish(executor->process({{"value",0}})); check(false,"skip signals actor"); } catch(const InvocationSkipped&) {}
  }
  check(policy->decisionBudget->decisions==before+1,"signature skip sticks without another decision");
}
void descendantStickyScope() {
  auto root=std::make_shared<ExecutionPolicy>();
  int callbacks=0;
  root->supervisor=[&](RecoveryRequest,RecoverySignal)->Task<RecoveryDecision> {
    ++callbacks;co_return RecoveryDecision{"skip",true};
  };
  auto left=std::make_shared<ExecutionPolicy>(*root);
  auto right=std::make_shared<ExecutionPolicy>(*root);
  Node node;node.id="same-child-node";node.type="test";node.retrySafe=true;
  auto exercise=[&](const std::shared_ptr<ExecutionPolicy>& policy) {
    auto body=std::make_unique<Body>();body->failures=100;
    auto executor=statefulExecutor(std::move(body),node,policy,[]{return false;});
    for(int i=0;i<2;++i) {
      bool skipped=false;
      try { finish(executor->process({{"value",0}})); } catch(const InvocationSkipped&) { skipped=true; }
      check(skipped,"scoped sticky skip retires invocation");
    }
  };
  exercise(left);exercise(right);
  check(callbacks==2&&root->decisionBudget->decisions==2,"child policies share spend count while signature skips remain scope-local");
  check(root->sticky.empty()&&left->sticky.size()==1&&right->sticky.size()==1,"child sticky decisions do not mutate ancestor scope");
}
void grants(const std::string& directory) {
  bool denied=false;
  try { ExecutionState state(directory+"/missing"); } catch(const std::runtime_error&) { denied=true; }
  check(denied,"missing grant denied");
  auto grant=std::filesystem::path(directory)/"grant";
  std::filesystem::create_directory(grant);
  auto outside=std::filesystem::path(directory)/"outside.sqlite";
  { std::ofstream out(outside); out<<"untouched"; }
  std::filesystem::create_symlink(outside,grant/"execution-state.sqlite");
  denied=false;
  try { ExecutionState state(grant.string()); } catch(const std::runtime_error&) { denied=true; }
  check(denied,"symlink escape denied");
  std::filesystem::remove(grant/"execution-state.sqlite");
  std::filesystem::create_hard_link(outside,grant/"execution-state.sqlite");
  denied=false;
  try { ExecutionState state(grant.string()); } catch(const std::runtime_error&) { denied=true; }
  check(denied,"hardlink denied");
  std::ifstream in(outside); std::string bytes; in>>bytes;
  check(bytes=="untouched","denied file unchanged");
}
void durable(const std::string& directory) {
  check(ExecutionState::messageId("r","n","h",1)=="574d9f3ac96f49c3","TS message ID parity");
  check(ExecutionState::messageId("r😀","n","h",1)=="b91897e5a6bca2f8","TS UTF-16 message ID parity");
  std::string first;
  {
    auto state=std::make_shared<ExecutionState>(directory);
    first=state->append("r","n","h",1,"same").at("messageId");
    check(state->append("r","n","h",2,"same").at("payload")==1,"idempotent append");
    state->append("r","n","h",2);
    state->append("r","other","h",999);
    check(state->pending("r","n","h").size()==2,"node isolation");
    state->acknowledge(first);
    state->cache("persistent",{{"value",123}});
  }
  {
    auto state=std::make_shared<ExecutionState>(directory);
    auto messages=state->pending("r","n","h");
    check(messages.size()==1 && messages[0].at("seq")==2,"restart retains pending and ack");
    check(state->maxSequence("r","n","h")==2,"sequence survives restart");
    check(state->cleanup("r","n","h",2)==1,"cleanup consumed below cutoff");
    check(state->cached("persistent")==Json{{"value",123}},"cache survives restart");
    Inbox inbox;
    DurableDelivery delivery(state,"delivery");
    delivery.put("n",inbox,"h",1,{},"edge");
    delivery.put("n",inbox,"h",2,{},"edge");
    auto items=inbox.drainHandle("h"); check(items.size()==2 && *items[0].data==1 && *items[1].data==2,"delivery ordering");
  }
  {
    auto state=std::make_shared<ExecutionState>(directory);
    Inbox inbox; DurableDelivery restarted(state,"delivery"); restarted.restore("n",inbox);
    restarted.put("n",inbox,"h",1,{},"edge");
    auto items=inbox.drainHandle("h"); check(items.size()==2,"restart deduplicates producer replay");
    restarted.acknowledge("n"); check(state->pending("delivery","n").empty(),"successful actor ack");
  }
  {
    ExecutionState state(directory);
    check(state.pending("delivery","n").empty(),"ack survives second restart");
  }
}
// C4 of PT13: the store holds the bytes of a value, as base64 text, never
// a reference to a blob, and a cache key depends on their content.
void storedBytes(const std::string& directory) {
  const auto bytes=[](std::vector<uint8_t> data, BlobKind kind=BlobKind::Uint8Array) {
    return Json::binary(Blob(std::move(data),kind));
  };
  const Json tagged={{"__bytes__","AQID"}};
  check(ExecutionState::cacheKey("u","t",{{"data",bytes({1,2,3})}})==ExecutionState::cacheKey("u","t",{{"data",tagged}}),
        "a cache key is the same for bytes and for their stored form");
  check(ExecutionState::cacheKey("u","t",{{"data",bytes({1,2,3})}})!=ExecutionState::cacheKey("u","t",{{"data",bytes({1,2,4})}}),
        "a cache key depends on byte content");
  check(ExecutionState::cacheKey("u","t",{{"data",bytes({1,2,3})}})!=ExecutionState::cacheKey("u","t",{{"data",bytes({1,2,3},BlobKind::Int8Array)}}),
        "a cache key depends on the byte type");
  const auto path=directory + "/bytes";
  std::filesystem::create_directory(path);
  {
    auto state=std::make_shared<ExecutionState>(path);
    state->cache("bytes",{{"output",bytes({1,2,3})},{"typed",bytes({0,0,128,63},BlobKind::Float32Array)}});
    Inbox inbox;
    DurableDelivery delivery(state,"bytes-run");
    delivery.put("n",inbox,"h",Json{{"frame",bytes({1,2,3},BlobKind::Buffer)}},{},"edge");
    auto items=inbox.drainHandle("h");
    check(items.size()==1 && items[0].data->at("frame").is_binary(),"the inbox holds the blob itself");
  }
  {
    // A new process has no blob. Everything it reads comes from the file.
    auto state=std::make_shared<ExecutionState>(path);
    check(state->cached("bytes")==Json{{"output",tagged},{"typed",{{"__typed__","Float32Array"},{"__bytes__","AACAPw=="}}}},
          "the result cache holds the bytes as base64");
    auto messages=state->pending("bytes-run","n");
    check(messages.size()==1 && messages[0].at("payload").at("data")==Json{{"frame",{{"__bytes__","AQID"},{"__buffer__",true}}}},
          "the journal holds the bytes as base64");
    Inbox inbox; DurableDelivery restarted(state,"bytes-run"); restarted.restore("n",inbox);
    auto items=inbox.drainHandle("h");
    check(items.size()==1 && items[0].data->at("frame").at("__bytes__")=="AQID","a restart restores the bytes from the journal");
  }
}
class TestCatalog final : public NodeCatalog {
public:
  bool failConsumer = true;
  std::optional<Json> describe(const Json&) override { return Json{{"retry_safe",true}}; }
  std::optional<Json> resolve(const std::string& type) override {
    return Json{{"nodeType",type},{"outputs",{{"output","any"}}},{"propertyTypes",{{"value","any"}}},{"descriptorDefaults",{{"retry_safe",true}}}};
  }
  Json validate(const Json&, const std::vector<std::string>&) override { return Json::array(); }
  std::unique_ptr<Executor> create(const Json& node) override {
    auto body=std::make_unique<Body>();
    if (node.at("id")=="consumer" && failConsumer) body->failures=100;
    return body;
  }
};
void runnerRestart(const std::string& directory) {
  check(DurableDelivery::address("a:b","c","d") != DurableDelivery::address("a","b:c","d"),"durable tuple cannot collide across owner/workflow delimiters");
  check(DurableDelivery::address("a","b:c","d") != DurableDelivery::address("a","b","c:d"),"durable tuple cannot collide across workflow/job delimiters");
  check(DurableDelivery::address("","wf","job") != DurableDelivery::address("default","wf","job"),"explicit empty owner is distinct from default fallback");
  check(DurableDelivery::address("a\",\"b","c","d") != DurableDelivery::address("a","b\",\"c","d"),"durable tuple escapes identity strings");
  const auto runAddress=DurableDelivery::address("default","wf","restart");
  TestCatalog catalog;
  Json graph={{"nodes",Json::array({
    {{"id","source"},{"type","test"},{"properties",{{"value",42}}}},
    {{"id","consumer"},{"type","test"},{"properties",Json::object()}}
  })},{"edges",Json::array({{{"id","edge"},{"source","source"},{"sourceHandle","output"},{"target","consumer"},{"targetHandle","value"}}})}};
  {
    RunOptions options; options.jobId="restart"; options.durableState=std::make_shared<ExecutionState>(directory);
    Runner runner(catalog,[](const Json&){},options);
    check(finish(runner.run(graph,Json::object()))==RunStatus::Failed,"failed actor leaves journal");
    check(options.durableState->pending(runAddress,"consumer").size()==1,"runner journals delivery before failure");
  }
  catalog.failConsumer=false;
  {
    RunOptions options; options.jobId="restart"; options.durableState=std::make_shared<ExecutionState>(directory);
    options.executionPolicy=std::make_shared<ExecutionPolicy>();
    options.executionPolicy->userId="";
    Runner runner(catalog,[](const Json&){},options);
    check(finish(runner.run(graph,Json::object()))==RunStatus::Completed,"explicit empty kernel owner completes independently");
    check(options.durableState->pending(runAddress,"consumer").size()==1,"explicit empty owner cannot acknowledge default fallback owner input");
    check(options.durableState->pending(DurableDelivery::address("","wf","restart"),"consumer").empty(),"explicit empty owner acknowledges only its own input");
  }
  {
    RunOptions options; options.jobId="restart"; options.durableState=std::make_shared<ExecutionState>(directory);
    Runner runner(catalog,[](const Json&){},options);
    check(finish(runner.run(graph,Json::object()))==RunStatus::Completed,"restarted runner completes");
    check(runner.outputs().at("consumer")==Json::array({42}),"replayed envelope emits once");
    check(options.durableState->pending(runAddress,"consumer").empty(),"runner acknowledges successful replay");
  }
}
void realGuest(const char* bundle) {
  auto engine=js::createQuickJsEngine(); Guest guest(*engine);
  std::ifstream in(bundle,std::ios::binary);
  std::vector<uint8_t> bytes((std::istreambuf_iterator<char>(in)),{});
  check(!bytes.empty(),"real bundle required"); guest.load(bytes,bundle);
  Loop::current().setPump([&guest] { return guest.pump(); });
  GuestCatalog catalog(guest);
  auto policy=std::make_shared<ExecutionPolicy>(); policy->state=std::make_shared<ExecutionState>();
  policy->cacheNodeTypes.insert("nodetool.constant.String");
  Json graph={{"nodes",Json::array({{{"id","c"},{"type","nodetool.constant.String"},{"properties",{{"value","actual guest"}}}}})},{"edges",Json::array()}};
  for(int i=0;i<2;++i) {
    guest.begin("job","wf");
    RunOptions opts; opts.executionPolicy=policy;
    Runner runner(catalog,[](const Json&){},opts);
    check(finish(runner.run(graph,Json::object()))==RunStatus::Completed,"real guest runner completes");
    check(runner.outputs().dump().find("actual guest")!=std::string::npos,"real guest value");
  }
  auto key=ExecutionState::cacheKey("","nodetool.constant.String",{{"value","actual guest"}});
  check(policy->state->cached(key).has_value(),"real guest populates cache");
  Loop::current().setPump(nullptr);
}
}
int main(int argc,char** argv) {
  try {
    check(argc==3,"usage: state-tests guest-bundle granted-test-directory");
    auto directory=std::filesystem::path(argv[2]) / ("g6-state-" + std::to_string(getpid()));
    std::filesystem::create_directory(directory);
    struct Clean { std::filesystem::path path; ~Clean() { std::filesystem::remove_all(path); } } clean{directory};
    cacheAndRecovery(); streamRecovery(); descendantStickyScope(); grants(directory.string()); durable(directory.string()); storedBytes(directory.string()); runnerRestart(directory.string()); realGuest(argv[1]);
    std::cout << checks << " state checks passed\n";
    return 0;
  } catch(const std::exception& e) { std::cerr << e.what() << '\n'; return 1; }
}
