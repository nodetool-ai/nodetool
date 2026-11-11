#include "nodetool/graph_runner.h"
#include <initializer_list>
#include <nlohmann/json.hpp>
#include <sqlite3.h>
#include <algorithm>
#include <condition_variable>
#include <filesystem>
#include <iostream>
#include <mutex>
#include <stdexcept>
#include <vector>

namespace {
using Json = nlohmann::json;
// native-rules #14: file-scope mutable test counters
int checks = 0;
void check(bool value, const char* message) { ++checks; if (!value) throw std::runtime_error(message); }
struct Result { std::string status; Json outputs; int terminals = 0; int parentInvocations = 0; };
Result run(gr::GraphRunner& runner, const Json& graph, const std::string& job = "same-root", const std::string& workflow = "wf") {
  std::mutex mutex; std::condition_variable wake; bool done = false; Result result;
  runner.submit(job,workflow,graph.dump(),"{}",[&](const std::string& text,bool last) {
    std::lock_guard lock(mutex); const auto message = Json::parse(text);
    if (message.value("type","") == "generation_complete" && message.value("node_id","") == "parent") ++result.parentInvocations;
    if (message.value("type","") == "job_update") {
      check(message.value("job_id","") == job && message.value("workflow_id","") == workflow,"public root identity is preserved");
      const auto status = message.value("status","");
      if (status == "completed" || status == "failed" || status == "cancelled") {
        result.status = status;
        if (!message.contains("result")) ++result.terminals;
        else result.outputs = message["result"]["outputs"];
      }
    }
    if (last) { done = true; wake.notify_all(); }
  });
  std::unique_lock lock(mutex);
  if (!wake.wait_for(lock,std::chrono::seconds(30),[&] { return done; })) {
    lock.unlock(); runner.cancel(job); lock.lock(); wake.wait(lock,[&] { return done; });
    throw std::runtime_error("public durable subgraph run timed out");
  }
  check(result.terminals == 1,"exactly one root terminal event");
  return result;
}
void loaded(gr::GraphRunner& runner) { check(runner.waitUntilLoaded(60000),"real default guest loads"); }
struct Database {
  sqlite3* db = nullptr;
  explicit Database(const std::filesystem::path& dir) {
    if (sqlite3_open_v2((dir/"execution-state.sqlite").c_str(),&db,SQLITE_OPEN_READONLY,nullptr) != SQLITE_OK) throw std::runtime_error("state database open failed");
  }
  ~Database() { sqlite3_close(db); }
  Json rows() {
    sqlite3_stmt* stmt = nullptr;
    if (sqlite3_prepare_v2(db,"SELECT run,node,payload,status FROM durable_messages ORDER BY run,node,seq",-1,&stmt,nullptr) != SQLITE_OK) throw std::runtime_error(sqlite3_errmsg(db));
    Json rows = Json::array(); int rc;
    while ((rc = sqlite3_step(stmt)) == SQLITE_ROW) {
      auto text = [&](int column) { return std::string(reinterpret_cast<const char*>(sqlite3_column_text(stmt,column))); };
      rows.push_back({{"address",Json::parse(text(0))},{"node",text(1)},{"payload",Json::parse(text(2))},{"status",text(3)}});
    }
    sqlite3_finalize(stmt); check(rc == SQLITE_DONE,"all durable rows read"); return rows;
  }
};
int pending(const std::filesystem::path& dir) {
  const auto rows = Database(dir).rows(); return std::count_if(rows.begin(),rows.end(),[](const Json& row) { return row["status"] == "pending"; });
}
Json edge(const std::string& id,const std::string& source,const std::string& output,const std::string& target,const std::string& input) {
  return {{"id",id},{"source",source},{"sourceHandle",output},{"target",target},{"targetHandle",input}};
}
Json leaf(const std::string& value,bool corrected = false) {
  Json nodes = Json::array({{{"id","pick"},{"name","pick"},{"type","nodetool.constant.Select"},{"properties",{{"value","good"},{"options",corrected ? Json::array({value}) : Json::array({"good"})}}}}});
  Json edges = Json::array();
  if (!corrected) {
    nodes.push_back({{"id","source"},{"type","nodetool.constant.String"},{"properties",{{"value",value}}}});
    edges.push_back(edge("e","source","output","pick","value"));
  }
  return {{"nodes",nodes},{"edges",edges}};
}
Json sub(const std::string& id,const Json& child) { return {{"id",id},{"name",id},{"type","nodetool.workflows.subgraph.Subgraph"},{"properties",{{"graph",child}}}}; }
// An initializer list, so graph({one}) is an array of one node on every compiler.
// A Json parameter made Clang 18 build the object itself instead.
Json graph(std::initializer_list<Json> nodes) { Json list=Json::array(); for (const auto& node : nodes) { list.push_back(node); } return {{"nodes",list},{"edges",Json::array()}}; }
gr::HostOptions options(const std::filesystem::path& dir) { std::filesystem::create_directories(dir); gr::HostOptions value;value.executionStateDirectory=dir;value.durableInboxes=true;return value; }
void repeatedAndReopened(const std::string& bundle,const std::filesystem::path& dir) {
  const auto opt = options(dir);
  {
    gr::GraphRunner runner(bundle,opt);loaded(runner);
    check(run(runner,graph({sub("parent",leaf("bad"))})).status == "failed","first child fails");
    check(pending(dir) == 1,"failed child input persisted");
    const auto result = run(runner,graph({sub("parent",leaf("bad",true))}));
    check(result.status == "completed" && result.outputs["parent"] == Json::array({"bad"}),"same public root replays exact child input");
    check(pending(dir) == 0,"successful replay acknowledged");
    check(run(runner,graph({sub("parent",leaf("reopen-bad"))}),"reopen-root").status == "failed","second root leaves input pending");
  }
  check(pending(dir) == 1,"pending child survives runner destruction");
  {
    gr::GraphRunner runner(bundle,opt);loaded(runner);
    const auto result=run(runner,graph({sub("parent",leaf("reopen-bad",true))}),"reopen-root");
    check(result.status == "completed" && result.outputs["parent"] == Json::array({"reopen-bad"}),"new public runner replays child after reopen");
    check(pending(dir) == 0,"reopened child acknowledged");
    check(run(runner,graph({sub("parent",leaf("reopen-bad",true))}),"reopen-root").status == "failed","acknowledged child input is not replayed twice");
  }
}
void siblingsAndNested(const std::string& bundle,const std::filesystem::path& dir) {
  const auto opt=options(dir);
  const std::string left="left:/[]\"", right="right";
  {
    gr::GraphRunner runner(bundle,opt);loaded(runner);
    check(run(runner,graph({sub(left,leaf("left-bad")),sub(right,leaf("right-bad"))})).status == "failed","both same-ID child consumers fail");
    check(pending(dir) == 2,"siblings persist distinct pending inputs");
  }
  {
    gr::GraphRunner runner(bundle,opt);loaded(runner);
    auto result=run(runner,graph({sub("unrelated",graph({{{"id","ok"},{"type","nodetool.constant.String"},{"properties",{{"value","noise"}}}}})),sub(right,leaf("right-bad",true)),sub(left,leaf("left-bad",true))}));
    check(result.status == "completed" && result.outputs[left] == Json::array({"left-bad"}) && result.outputs[right] == Json::array({"right-bad"}),"reordering and inserting siblings cannot redirect replay");
    check(pending(dir) == 0,"both reordered siblings acknowledged");
    auto nested=graph({sub("wrapper",graph({sub("inner",leaf("nested-bad"))}))});
    check(run(runner,nested,"nested-root").status == "failed","nested child fails");
  }
  {
    gr::GraphRunner runner(bundle,opt);loaded(runner);
    const auto noise=graph({{{"id","noise-value"},{"type","nodetool.constant.String"},{"properties",{{"value","unrelated"}}}}});
    auto nested=graph({sub("noise",noise),sub("wrapper",graph({sub("other",noise),sub("inner",leaf("nested-bad",true))}))});
    auto result=run(runner,nested,"nested-root");
    check(result.status == "completed" && result.outputs["wrapper"] == Json::array({"unrelated","nested-bad"}),"nested replay is stable under sibling insertions at both depths");
    check(pending(dir) == 0,"nested replay acknowledged");
  }
  bool sawLeft=false,sawRight=false,sawNested=false;
  for (const auto& row:Database(dir).rows()) {
    const auto& address=row["address"];
    if (address.size()!=4 || row["node"]!="pick") continue;
    check(address[0]=="default"&&address[1]=="wf","granted owner and workflow remain in child durable address");
    const auto& scope=address[3];
    sawLeft = sawLeft || scope==Json::array({Json::array({left,Json::object(),0})});
    sawRight = sawRight || scope==Json::array({Json::array({right,Json::object(),0})});
    sawNested = sawNested || scope==Json::array({Json::array({"wrapper",Json::object(),0}),Json::array({"inner",Json::object(),0})});
  }
  check(sawLeft&&sawRight&&sawNested,"exact collision-safe sibling and nested paths persisted");
}
void ownerAndWorkflow(const std::string& bundle,const std::filesystem::path& dir) {
  auto opt=options(dir);opt.context.userId="owner";
  const std::string root="[\"owner\",\"wf\",\"root\",[]]";
  {gr::GraphRunner runner(bundle,opt);loaded(runner);check(run(runner,graph({sub("parent",leaf("bad"))}),root).status=="failed","owner child fails");}
  auto corrected=leaf("bad",true);corrected["nodes"][0]["properties"]["value"]="foreign-default";corrected["nodes"][0]["properties"]["options"].push_back("foreign-default");
  auto retry=graph({sub("parent",corrected)});
  {auto foreign=opt;foreign.context.userId="other";gr::GraphRunner runner(bundle,foreign);loaded(runner);auto result=run(runner,retry,root);check(result.status=="completed"&&result.outputs["parent"]==Json::array({"foreign-default"}),"foreign owner cannot replay child");}
  {gr::GraphRunner runner(bundle,opt);loaded(runner);auto result=run(runner,retry,root,"other-workflow");check(result.status=="completed"&&result.outputs["parent"]==Json::array({"foreign-default"}),"foreign workflow cannot replay child");}
  check(pending(dir)==1,"foreign scopes cannot acknowledge original child input");
  {gr::GraphRunner runner(bundle,opt);loaded(runner);auto result=run(runner,retry,root);check(result.status=="completed"&&result.outputs["parent"]==Json::array({"bad"}),"original owner/workflow receives persisted input");}
  check(pending(dir)==0,"original owner acknowledges child input");
}
void supervisedRetry(const std::string& bundle,const std::filesystem::path& dir) {
  auto opt=options(dir);int childAttempts=0;
  opt.supervisor.maxRetriesPerInvocation=1;
  opt.supervisor.effects=[](const gr::InvocationIdentity&) { return gr::SupervisorEffects{true,0,false}; };
  opt.supervisor.decide=[&](gr::SupervisorRequest request,std::function<bool()>,gr::SupervisorOptions::Completion done) {
    if(request.invocation.nodeId=="pick") {
      ++childAttempts;
      done({request.invocation.attempt==1 ? gr::SupervisorAction::Retry : gr::SupervisorAction::Fail});
    } else done({gr::SupervisorAction::Fail});
  };
  {gr::GraphRunner runner(bundle,opt);loaded(runner);check(run(runner,graph({sub("parent",leaf("retry-bad"))}),"retry-root").status=="failed","supervised consumer retry exhausts on the unchanged real failure");}
  check(childAttempts==2,"real child Select consumer was retried once");
  check(pending(dir)==1,"retry reuses one child delivery instead of creating a second execution scope");
  const auto rows=Database(dir).rows();
  for(const auto& row:rows)if(row["address"].size()==4)check(row["address"][3]==Json::array({Json::array({"parent",Json::object(),0})}),"child consumer retry retains subgraph occurrence zero");
}
void lineageAndOccurrences(const std::string& bundle,const std::filesystem::path& dir) {
  auto child=leaf("unused");child["nodes"][1]={{"id","source"},{"type","nodetool.input.StringInput"},{"properties",{{"name","value"},{"value","good"}}}};
  auto parent=sub("parent",child);parent["dynamic_inputs"]={{"value",{{"type","str"}}}};
  auto root=graph({{{"id","items"},{"type","nodetool.constant.List"},{"properties",{{"value",Json::array({"good","bad"})}}}},{{"id","each"},{"type","nodetool.control.ForEach"}},parent});
  root["edges"]={edge("list","items","output","each","input_list"),edge("item","each","output","parent","value")};
  const auto opt=options(dir);
  {gr::GraphRunner runner(bundle,opt);loaded(runner);check(run(runner,root,"lineages").status=="failed","later correlated child invocation fails");}
  int childPending=0;
  for(const auto& row:Database(dir).rows()) if(row["address"].size()==4&&row["status"]=="pending")++childPending;
  check(childPending==1,"only failing lineage retains child input");
  root["nodes"][2]["properties"]["graph"]=leaf("bad",true);root["nodes"][2]["properties"]["graph"]["nodes"][0]["properties"]["options"].push_back("good");
  {gr::GraphRunner runner(bundle,opt);loaded(runner);auto result=run(runner,root,"lineages");check(result.status=="completed"&&result.outputs["parent"]==Json::array({"good","bad"}),"lineage-specific child input replays only its matching invocation");}
  check(pending(dir)==0,"parent and child correlated deliveries acknowledged");
  auto controlled=graph({{{"id","events"},{"type","nodetool.control.RepeatValue"},{"properties",{{"count",3},{"value",Json::object()}}}},sub("parent",leaf("good"))});
  auto control=edge("control","events","output","parent","__control__");control["edge_type"]="control";controlled["edges"]=Json::array({control});
  {gr::GraphRunner runner(bundle,opt);loaded(runner);auto result=run(runner,controlled,"occurrences");check(result.status=="completed"&&result.parentInvocations==3,"three same-lineage controlled invocations execute");}
  std::vector<int> occurrences;
  for(const auto& row:Database(dir).rows())if(row["address"].size()==4&&row["address"][2]=="occurrences"&&row["node"]=="pick")occurrences.push_back(row["address"][3][0][2]);
  std::sort(occurrences.begin(),occurrences.end());check(occurrences==std::vector<int>({0,1,2}),"same-key occurrences receive distinct stable addresses");
}
}
int main(int argc,char** argv) {
  try {
    if(argc!=3)throw std::runtime_error("usage: public_subgraph_durable <guest.js> <test-directory>");
    const auto base=std::filesystem::path(argv[2])/"public-subgraph-durable";
    std::filesystem::remove_all(base);std::filesystem::create_directories(base);
    repeatedAndReopened(argv[1],base/"repeat");siblingsAndNested(argv[1],base/"siblings");ownerAndWorkflow(argv[1],base/"owner");supervisedRetry(argv[1],base/"retry");lineageAndOccurrences(argv[1],base/"lineage");
    std::cout<<checks<<" public child durable checks passed\n";return 0;
  }catch(const std::exception& error){std::cerr<<error.what()<<'\n';return 1;}
}
