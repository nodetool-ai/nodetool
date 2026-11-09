#include "nodetool/graph_runner.h"
#include <nlohmann/json.hpp>
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <set>

namespace {
using Json=nlohmann::json;
// native-rules #14: file-scope mutable test counters
int checks=0;
void check(bool value,const char* message) { ++checks;if(!value) throw std::runtime_error(message); }
std::string identityKey(const gr::InvocationIdentity& identity) {
  return Json::array({identity.jobId,identity.executionScope,identity.nodeId,identity.invocationKey,identity.attempt,identity.invocationOccurrence}).dump();
}
std::string run(gr::GraphRunner& runner,const Json& graph,const std::string& job) {
  std::mutex mutex;std::condition_variable cv;bool done=false;std::string status;
  runner.submit(job,"controlled-occurrence",graph.dump(),"{}",[&](const std::string& text,bool last) {
    std::lock_guard lock(mutex);const auto message=Json::parse(text);
    if(message.value("type","")=="job_update") status=message.value("status","");
    if(last) {done=true;cv.notify_all();}
  });
  std::unique_lock lock(mutex);
  if(!cv.wait_for(lock,std::chrono::seconds(15),[&]{return done;})) {
    lock.unlock();runner.cancel(job);lock.lock();cv.wait(lock,[&]{return done;});
    throw std::runtime_error("controlled occurrence job timed out");
  }
  return status;
}
Json graph() {
  return {{"nodes",Json::array({
    {{"id","events"},{"type","nodetool.control.RepeatValue"},{"properties",{{"count",3},{"value",Json::object()}}}},
    {{"id","pick"},{"type","nodetool.constant.Select"},{"properties",{{"value","bad"},{"options",Json::array({"good"})}}}}
  })},{"edges",Json::array({{{"id","control"},{"source","events"},{"sourceHandle","output"},{"target","pick"},{"targetHandle","__control__"},{"edge_type","control"}}})}};
}
}
int main(int argc,char** argv) {
  try {
    check(argc==2,"usage: public-invocation-occurrence bundle");
    gr::HostOptions options;options.supervisor.maxDecisions=20;options.supervisor.maxRetriesPerInvocation=1;
    bool retry=false,legacy=true;
    std::string expectedJob="three-independent-skips";
    std::vector<std::string> begins,effects,decided;
    std::vector<int> attempts;
    std::vector<std::uint64_t> occurrences;
    options.supervisor.beginAttempt=[&](const gr::InvocationIdentity& identity) {if(identity.nodeId=="pick") begins.push_back(identityKey(identity));};
    options.supervisor.effects=[&](const gr::InvocationIdentity& identity) {
      if(identity.nodeId=="pick") effects.push_back(identityKey(identity));
      return gr::SupervisorEffects{true,0,false};
    };
    options.supervisor.decide=[&](gr::SupervisorRequest request,std::function<bool()>,gr::SupervisorOptions::Completion done) {
      const auto& identity=request.invocation;
      legacy=legacy&&identity.jobId==expectedJob&&identity.executionScope=="[]"&&identity.nodeId=="pick"&&identity.invocationKey=="{}";
      decided.push_back(identityKey(identity));attempts.push_back(identity.attempt);occurrences.push_back(identity.invocationOccurrence);
      done({retry&&identity.attempt==1 ? gr::SupervisorAction::Retry : gr::SupervisorAction::Skip});
    };
    gr::GraphRunner runner(argv[1],options);check(runner.waitUntilLoaded(60000),"current guest must load");
    const auto skipStatus=run(runner,graph(),"three-independent-skips");
    const auto skipBegins=begins,skipEffects=effects,skipDecisions=decided;
    const auto skipOccurrences=occurrences;
    const auto skipUnique=std::set<std::string>(decided.begin(),decided.end()).size();
    std::cout<<"Skip status="<<skipStatus<<", callbacks="<<decided.size()<<", unique="<<skipUnique<<'\n';
    begins.clear();effects.clear();decided.clear();attempts.clear();occurrences.clear();retry=true;expectedJob="three-independent-retries";
    const auto retryStatus=run(runner,graph(),"three-independent-retries");
    std::cout<<"Retry status="<<retryStatus<<", attempts="<<Json(attempts).dump()<<", identities="<<Json(decided).dump()<<'\n';
    check(skipStatus=="completed"&&skipDecisions.size()==3,"three independent controlled skips must complete");
    check(skipUnique==3,"controlled invocations must have distinct public exact-attempt identities");
    check(skipOccurrences==std::vector<std::uint64_t>({0,1,2}),"same-lineage invocations advance occurrence once each");
    check(skipBegins==skipEffects&&skipEffects==skipDecisions,"three callback types must match each skipped invocation");
    check(retryStatus=="completed"&&attempts==std::vector<int>({1,2,1,2,1,2}),"each controlled invocation receives its own one-retry budget");
    check(std::set<std::string>(decided.begin(),decided.end()).size()==6,"all six controlled retry attempts have unique public identities");
    check(occurrences==std::vector<std::uint64_t>({0,0,1,1,2,2}),"retries retain the selected occurrence");
    check(begins==effects&&effects==decided,"begin/effects/decide agree for all six controlled attempts");
    check(legacy,"lineage key, root cancellation ID and execution scope retain their meanings");
    begins.clear();effects.clear();decided.clear();attempts.clear();occurrences.clear();retry=false;expectedJob="next-controlled-job";
    check(run(runner,graph(),expectedJob)=="completed"&&occurrences==std::vector<std::uint64_t>({0,1,2}),"next root job starts a fresh occurrence sequence");
    auto limited=options;limited.supervisor.maxDecisions=1;
    retry=true;expectedJob="limited-controlled";begins.clear();effects.clear();decided.clear();attempts.clear();occurrences.clear();
    gr::GraphRunner limitedRunner(argv[1],limited);check(limitedRunner.waitUntilLoaded(60000),"limited runner guest loads");
    check(run(limitedRunner,graph(),expectedJob)=="failed"&&attempts==std::vector<int>({1}),"occurrence separation never resets the shared root decision budget");
    std::cout<<checks<<" controlled invocation occurrence checks passed\n";return 0;
  }catch(const std::exception& error){std::cerr<<error.what()<<'\n';return 1;}
}
