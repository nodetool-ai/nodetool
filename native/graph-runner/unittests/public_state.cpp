#include "nodetool/graph_runner.h"
#include <nlohmann/json.hpp>
#include <sqlite3.h>
#include <algorithm>
#include <atomic>
#include <condition_variable>
#include <filesystem>
#include <iostream>
#include <mutex>
#include <map>
#include <set>
#include <thread>
#include <unistd.h>

namespace {
using Json=nlohmann::json;
// native-rules #14: file-scope mutable test counters
int checks=0;
void check(bool ok,const char* message) { ++checks; if(!ok) throw std::runtime_error(message); }
struct Result { std::string status; Json outputs; std::string jobId; std::string workflowId; };
Result run(gr::GraphRunner& runner,const Json& graph,const std::string& id="job",const std::string& workflowId="wf") {
  std::mutex mutex; std::condition_variable cv; bool finished=false; Result result;
  runner.submit(id,workflowId,graph.dump(),"{}",[&](const std::string& text,bool last) {
    std::lock_guard lock(mutex);
    auto message=Json::parse(text);
    if(message.value("type","")=="job_update") {
      auto status=message.value("status","");
      if(status=="completed"||status=="failed"||status=="cancelled") { result.status=status; result.jobId=message.value("job_id",""); result.workflowId=message.value("workflow_id",""); }
      if(message.contains("result")&&message["result"].contains("outputs")) result.outputs=message["result"]["outputs"];
    }
    if(last) { finished=true; cv.notify_all(); }
  });
  std::unique_lock lock(mutex);
  if(!cv.wait_for(lock,std::chrono::seconds(15),[&]{return finished;})) {
    // Keep handler references alive until cancellation finishes.
    lock.unlock(); runner.cancel(id); lock.lock();
    cv.wait(lock,[&]{return finished;});
    throw std::runtime_error("public job timed out");
  }
  return result;
}
Json constantGraph(const std::string& value) {
  return {{"nodes",Json::array({{{"id","c"},{"type","nodetool.constant.String"},{"properties",{{"value",value}}}},{{"id","out"},{"name","value"},{"type","nodetool.output.Output"},{"properties",{{"name","value"}}}}})},
    {"edges",Json::array({{{"id","e"},{"source","c"},{"sourceHandle","output"},{"target","out"},{"targetHandle","value"}}})}};
}
Json failingGraph() {
  return {{"nodes",Json::array({{{"id","pick"},{"name","pick"},{"type","nodetool.constant.Select"},{"properties",{{"value","bad"},{"options",Json::array({"good"})}}}}})},{"edges",Json::array()}};
}
struct Database {
  sqlite3* db=nullptr;
  explicit Database(const std::filesystem::path& dir) {
    if(sqlite3_open_v2((dir/"execution-state.sqlite").c_str(),&db,SQLITE_OPEN_READWRITE,nullptr)!=SQLITE_OK) throw std::runtime_error("test state open failed");
  }
  ~Database() { sqlite3_close(db); }
  void exec(const char* sql) { if(sqlite3_exec(db,sql,nullptr,nullptr,nullptr)!=SQLITE_OK) throw std::runtime_error(sqlite3_errmsg(db)); }
  int count(const char* sql) {
    sqlite3_stmt* stmt=nullptr;
    if(sqlite3_prepare_v2(db,sql,-1,&stmt,nullptr)!=SQLITE_OK) throw std::runtime_error(sqlite3_errmsg(db));
    int rc=sqlite3_step(stmt); int value=sqlite3_column_int(stmt,0);sqlite3_finalize(stmt);
    if(rc!=SQLITE_ROW) throw std::runtime_error("test count failed");return value;
  }
};
void loaded(gr::GraphRunner& runner) { if(!runner.waitUntilLoaded(60000)) throw std::runtime_error(runner.loadError()); ++checks; }
void publicCache(const std::string& bundle,const std::filesystem::path& directory) {
  gr::HostOptions options; options.executionStateDirectory=directory; options.cacheNodeTypes={"nodetool.constant.String","nodetool.constant.Select"};
  {
    gr::GraphRunner runner(bundle,options);loaded(runner);
    auto result=run(runner,constantGraph("original"));
    check(result.status=="completed"&&result.outputs.at("value")==Json::array({"original"}),"public cold cache execution");
    check(run(runner,failingGraph()).status=="failed","real guest failure");
  }
  {
    Database db(directory);
    check(db.count("SELECT COUNT(*) FROM result_cache")==1,"failed guest result not cached");
    // A persisted valid entry with a distinctive value proves the next public
    // runner reads the cache instead of executing String.process again.
    db.exec("UPDATE result_cache SET value='{\"output\":\"persisted-hit\"}'");
  }
  {
    gr::GraphRunner runner(bundle,options);loaded(runner);
    auto result=run(runner,constantGraph("original"));
    check(result.status=="completed"&&result.outputs.at("value")==Json::array({"persisted-hit"}),"public cache survives runner destruction and is read");
    result=run(runner,constantGraph("changed"));
    check(result.outputs.at("value")==Json::array({"changed"}),"changed properties invalidate cache identity");
  }
  {
    auto otherOwner=options;otherOwner.context.userId="another-owner";
    gr::GraphRunner runner(bundle,otherOwner);loaded(runner);
    auto result=run(runner,constantGraph("original"));
    check(result.outputs.at("value")==Json::array({"original"}),"public cache is scoped to the granted owner");
  }
}
void publicDurable(const std::string& bundle,const std::filesystem::path& directory) {
  gr::HostOptions options;options.executionStateDirectory=directory;options.durableInboxes=true;
  auto graph=failingGraph();graph["nodes"][0]["properties"]["value"]="";
  graph["nodes"].push_back({{"id","source"},{"type","nodetool.constant.String"},{"properties",{{"value","bad"}}}});
  graph["edges"].push_back({{"id","e"},{"source","source"},{"sourceHandle","output"},{"target","pick"},{"targetHandle","value"}});
  {
    gr::GraphRunner runner(bundle,options);loaded(runner);
    check(run(runner,graph,"durable-job").status=="failed","public consumer failure");
  }
  { Database db(directory);check(db.count("SELECT COUNT(*) FROM durable_messages WHERE status='pending'")==1,"public failure persisted pending delivery"); }
  auto ownValue=failingGraph();
  ownValue["nodes"][0]["properties"]["value"]="good";
  Result otherOwnerResult,otherWorkflowResult;
  {
    auto otherOwner=options;otherOwner.context.userId="another-owner";
    gr::GraphRunner runner(bundle,otherOwner);loaded(runner);
    otherOwnerResult=run(runner,ownValue,"durable-job");
  }
  {
    gr::GraphRunner runner(bundle,options);loaded(runner);
    otherWorkflowResult=run(runner,ownValue,"durable-job","another-workflow");
  }
  std::cout<<"Durable isolation outcomes: other-owner="<<otherOwnerResult.status
           <<", other-workflow="<<otherWorkflowResult.status<<'\n';
  { Database db(directory);check(db.count("SELECT COUNT(*) FROM durable_messages WHERE status='pending'")==1,"other owner/workflow cannot acknowledge original pending input"); }
  graph["nodes"][0]["properties"]["options"]=Json::array({"bad"});
  {
    gr::GraphRunner runner(bundle,options);loaded(runner);
    auto result=run(runner,graph,"durable-job");
    check(result.status=="completed"&&result.outputs.at("pick")==Json::array({"bad"}),"public persisted inbox replay emits once");
  }
  { Database db(directory);check(db.count("SELECT COUNT(*) FROM durable_messages WHERE status='pending'")==0,"public successful replay acknowledged"); }
  check(otherOwnerResult.status=="completed"&&otherOwnerResult.outputs.at("pick")==Json::array({"good"}),"different granted owner must not replay original pending input");
  check(otherWorkflowResult.status=="completed"&&otherWorkflowResult.outputs.at("pick")==Json::array({"good"}),"different workflow must not replay original pending input");
  check(otherOwnerResult.jobId=="durable-job"&&otherOwnerResult.workflowId=="wf"&&otherWorkflowResult.jobId=="durable-job"&&otherWorkflowResult.workflowId=="another-workflow","durable scope never rewrites observable job/workflow metadata");
}
bool allows(const gr::SupervisorRequest& request,gr::SupervisorAction action) {
  return std::find(request.allowedActions.begin(),request.allowedActions.end(),action)!=request.allowedActions.end();
}
std::string accountingKey(const gr::InvocationIdentity& identity) {
  return Json::array({identity.jobId,identity.executionScope,identity.nodeId,identity.invocationKey,identity.attempt,identity.invocationOccurrence}).dump();
}
void publicAccountingScopes(const std::string& bundle) {
  const auto child=failingGraph();
  const std::string type="nodetool.workflows.subgraph.Subgraph";
  Json nested={{"nodes",Json::array({{{"id","inner"},{"type",type},{"properties",{{"graph",child}}}}})},{"edges",Json::array()}};
  Json graph={{"nodes",Json::array({
    {{"id","left"},{"type",type},{"properties",{{"graph",child}}}},
    {{"id","right"},{"type",type},{"properties",{{"graph",child}}}},
    {{"id","nested-wrapper"},{"type",type},{"properties",{{"graph",nested}}}}
  })},{"edges",Json::array()}};
  gr::HostOptions options;options.supervisor.maxDecisions=5;
  std::map<std::string,gr::SupervisorEffects> accounts;
  std::set<std::string> begins,reads,decisions,scopes;
  bool distinct=true,consistent=true,allowed=true;
  std::string rootJob="accounting-root";
  options.supervisor.beginAttempt=[&](const gr::InvocationIdentity& identity) {
    if(identity.nodeId!="pick") return;
    const auto key=accountingKey(identity);
    const auto path=Json::parse(identity.executionScope);
    const bool paid=path.is_array()&&!path.empty()&&path[0][0]=="left";
    if(!begins.insert(key).second) distinct=false;
    accounts[key]={true,paid ? 11.0 : 0.0,paid};
    if(identity.jobId!=rootJob) consistent=false;
  };
  options.supervisor.effects=[&](const gr::InvocationIdentity& identity) {
    if(identity.nodeId!="pick") return gr::SupervisorEffects{true,0,false};
    const auto key=accountingKey(identity);reads.insert(key);
    auto account=accounts.find(key);
    if(account==accounts.end()) { consistent=false;return gr::SupervisorEffects{}; }
    return account->second;
  };
  options.supervisor.decide=[&](gr::SupervisorRequest request,std::function<bool()>,gr::SupervisorOptions::Completion done) {
    const auto key=accountingKey(request.invocation);decisions.insert(key);scopes.insert(request.invocation.executionScope);
    const auto account=accounts.find(key);
    if(request.invocation.nodeId!="pick"||request.invocation.jobId!=rootJob||account==accounts.end()||!reads.contains(key)) consistent=false;
    const bool paid=account!=accounts.end()&&account->second.createdAssets;
    if(allows(request,gr::SupervisorAction::Retry)==paid) allowed=false;
    done({!paid&&request.invocation.attempt==1 ? gr::SupervisorAction::Retry : gr::SupervisorAction::Skip});
  };
  gr::GraphRunner runner(bundle,options);loaded(runner);
  auto result=run(runner,graph,rootJob);
  std::cout<<"Accounting identity scopes: "<<Json(scopes).dump()<<", begins="<<begins.size()<<", decisions="<<decisions.size()<<'\n';
  check(distinct,"sibling/nested beginAttempt identities must never collide");
  const std::set<std::string> expected={R"([["left",{},0]])",R"([["right",{},0]])",R"([["nested-wrapper",{},0],["inner",{},0]])"};
  check(scopes==expected,"sibling and nested execution paths are distinct and canonical");
  check(result.status=="completed"&&consistent&&allowed,"per-scope effects authorize only the correct child retries");
  check(begins.size()==5&&begins==reads&&reads==decisions,"all three callbacks identify the same five exact attempts");
  rootJob="accounting-root-next";
  result=run(runner,graph,rootJob);
  check(result.status=="completed"&&distinct&&consistent&&allowed&&begins.size()==10&&begins==reads&&reads==decisions,"next root keeps stable child paths with independent root accounting and a fresh budget");
}
void publicSubgraphSupervisor(const std::string& bundle) {
  auto child=failingGraph();
  Json graph={{"nodes",Json::array({
    {{"id","left"},{"type","nodetool.workflows.subgraph.Subgraph"},{"properties",{{"graph",child}}}},
    {{"id","right"},{"type","nodetool.workflows.subgraph.Subgraph"},{"properties",{{"graph",child}}}}
  })},{"edges",Json::array()}};
  gr::HostOptions options;
  options.supervisor.maxDecisions=1;
  options.supervisor.effects=[](const gr::InvocationIdentity&) { return gr::SupervisorEffects{true,0,false}; };
  std::atomic<int> decisions=0;
  std::vector<std::string> callbackJobs;
  options.supervisor.decide=[&](gr::SupervisorRequest request,std::function<bool()>,gr::SupervisorOptions::Completion done) {
    ++decisions;callbackJobs.push_back(request.invocation.jobId);
    std::cout<<"Subgraph callback: job="<<request.invocation.jobId<<", node="<<request.invocation.nodeId<<", attempt="<<request.invocation.attempt<<'\n';
    done({gr::SupervisorAction::Skip});
  };
  gr::GraphRunner runner(bundle,options);loaded(runner);
  auto result=run(runner,graph,"root-budget");
  std::cout<<"Sibling budget result: status="<<result.status<<", callbacks="<<decisions.load()<<'\n';
  check(decisions==1,"sibling descendants share one root submission decision budget");
  check(result.status=="failed","second sibling failure remains terminal after root budget is exhausted");
  check(callbackJobs==std::vector<std::string>({"root-budget"}),"descendant public request retains root job ID");
  decisions=0;callbackJobs.clear();
  result=run(runner,graph,"next-root-budget");
  check(decisions==1&&result.status=="failed"&&callbackJobs==std::vector<std::string>({"next-root-budget"}),"next root submission receives a fresh decision budget");
  auto retryOptions=options;
  retryOptions.supervisor.maxDecisions=10;
  retryOptions.supervisor.maxRetriesPerInvocation=1;
  std::vector<int> attempts;
  retryOptions.supervisor.decide=[&](gr::SupervisorRequest request,std::function<bool()>,gr::SupervisorOptions::Completion done) {
    attempts.push_back(request.invocation.attempt);
    done({request.invocation.attempt==1 ? gr::SupervisorAction::Retry : gr::SupervisorAction::Skip});
  };
  {
    gr::GraphRunner retryRunner(bundle,retryOptions);loaded(retryRunner);
    auto recovered=run(retryRunner,graph,"scoped-retries");
    std::sort(attempts.begin(),attempts.end());
    check(recovered.status=="completed"&&attempts==std::vector<int>({1,1,2,2}),"identical child node/invocation IDs keep separate retry ceilings");
  }
  auto cancelOptions=options;
  gr::GraphRunner* active=nullptr;
  bool cancelFirst=true;
  int cancelDecisions=0;
  std::function<bool()> cancelled;
  cancelOptions.supervisor.decide=[&](gr::SupervisorRequest request,std::function<bool()> signal,gr::SupervisorOptions::Completion done) {
    ++cancelDecisions;cancelled=signal;
    if(cancelFirst) active->cancel(request.invocation.jobId);
    done({gr::SupervisorAction::Skip});
  };
  {
    gr::GraphRunner cancelRunner(bundle,cancelOptions);active=&cancelRunner;loaded(cancelRunner);
    check(run(cancelRunner,graph,"cancelled-root").status=="cancelled"&&cancelDecisions==1,"cancelled descendant decision does not admit another sibling callback");
    check(cancelled&&cancelled(),"descendant public cancellation handle closes safely");
    cancelFirst=false;cancelDecisions=0;
    check(run(cancelRunner,graph,"after-cancelled-root").status=="failed"&&cancelDecisions==1,"job after cancelled descendants gets a fresh shared budget");
  }
}
void publicSupervisor(const std::string& bundle) {
  gr::HostOptions options;
  std::atomic<int> decisions=0,begun=0;
  std::atomic<bool> legal=true;
  options.supervisor.beginAttempt=[&](const gr::InvocationIdentity& identity) {
    ++begun;if(identity.jobId!="supervised"||identity.nodeId!="pick"||identity.attempt<1) legal=false;
  };
  options.supervisor.effects=[](const gr::InvocationIdentity&) { return gr::SupervisorEffects{true,0,false}; };
  options.supervisor.decide=[&](gr::SupervisorRequest request,std::function<bool()> cancelled,gr::SupervisorOptions::Completion done) {
    ++decisions;if(!allows(request,gr::SupervisorAction::Retry)||cancelled()) legal=false;
    done({gr::SupervisorAction::Retry});
  };
  {
    gr::GraphRunner runner(bundle,options);loaded(runner);
    check(run(runner,failingGraph(),"supervised").status=="failed","public retry exhaustion terminal failure");
    check(decisions==3&&begun==3&&legal,"public default permits exactly two safe retries");
    check(run(runner,failingGraph(),"supervised").status=="failed"&&decisions==6&&begun==6,"public retry budgets reset for each run");
  }
  decisions=0;options.supervisor.beginAttempt={};options.supervisor.maxDecisions=0;
  {gr::GraphRunner runner(bundle,options);loaded(runner);check(run(runner,failingGraph(),"supervised").status=="failed"&&decisions==0,"zero public decision budget invokes no supervisor");}
  options.supervisor.maxDecisions=10;options.supervisor.effects={};
  options.supervisor.decide=[&](gr::SupervisorRequest request,std::function<bool()>,gr::SupervisorOptions::Completion done) {
    ++decisions;if(allows(request,gr::SupervisorAction::Retry)) legal=false;done({gr::SupervisorAction::Retry});
  };
  {
    gr::GraphRunner runner(bundle,options);loaded(runner);
    check(run(runner,failingGraph()).status=="failed"&&decisions==1&&legal,"unknown accounting denies public retry");
  }
  decisions=0;options.supervisor.effects=[](const gr::InvocationIdentity&) { return gr::SupervisorEffects{true,1,true}; };
  {
    gr::GraphRunner runner(bundle,options);loaded(runner);
    check(run(runner,failingGraph()).status=="failed"&&decisions==1&&legal,"paid or asset-producing attempt cannot retry");
  }
  options.supervisor.decide={};
  { gr::GraphRunner runner(bundle,options);loaded(runner);check(run(runner,failingGraph()).status=="failed","no decision grant fails normally"); }
  std::function<bool()> signal;gr::SupervisorOptions::Completion late;
  options.supervisor.decisionTimeout=std::chrono::milliseconds(10);
  options.supervisor.decide=[&](gr::SupervisorRequest,std::function<bool()> cancelled,gr::SupervisorOptions::Completion done) {signal=cancelled;late=done;};
  {
    gr::GraphRunner runner(bundle,options);loaded(runner);
    check(run(runner,failingGraph()).status=="failed","unanswered public decision times out");
    check(signal&&signal(),"public signal observes deadline");late({gr::SupervisorAction::Retry});
    check(run(runner,constantGraph("after-timeout")).status=="completed","late completion does not poison next public job");
  }
  std::vector<std::jthread> workers;
  options.supervisor.decisionTimeout=std::chrono::seconds(1);
  options.supervisor.decide=[&](gr::SupervisorRequest,std::function<bool()>,gr::SupervisorOptions::Completion done) {workers.emplace_back([done]{done({gr::SupervisorAction::Skip});done({gr::SupervisorAction::Retry});});};
  {gr::GraphRunner runner(bundle,options);loaded(runner);check(run(runner,failingGraph()).status=="completed","cross-thread completion accepted, duplicate ignored");}
  workers.clear();
  gr::GraphRunner* active=nullptr;
  options.supervisor.decide=[&](gr::SupervisorRequest request,std::function<bool()> cancelled,gr::SupervisorOptions::Completion done) {signal=cancelled;active->cancel(request.invocation.jobId);done({gr::SupervisorAction::Retry});};
  {gr::GraphRunner runner(bundle,options);active=&runner;loaded(runner);check(run(runner,failingGraph()).status=="cancelled","public cancellation rejects a retry verdict");check(signal&&signal(),"public cancellation signal remains safe after completion");}
}
}
int main(int argc,char** argv) {
  try {
    check(argc==3,"usage: public-state-tests bundle test-directory");
    auto root=std::filesystem::path(argv[2])/("g6-public-"+std::to_string(getpid()));std::filesystem::create_directory(root);
    struct Clean {std::filesystem::path path;~Clean(){std::filesystem::remove_all(path);}} clean{root};
    auto cache=root/"cache",durable=root/"durable";std::filesystem::create_directory(cache);std::filesystem::create_directory(durable);
    publicAccountingScopes(argv[1]);
    publicSubgraphSupervisor(argv[1]);
    publicCache(argv[1],cache);publicDurable(argv[1],durable);publicSupervisor(argv[1]);
    std::cout<<checks<<" public GraphRunner checks passed\n";return 0;
  }catch(const std::exception& error){std::cerr<<error.what()<<'\n';return 1;}
}
