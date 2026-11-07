// Conformance executable: warm the explicitly cacheable constant nodes, then
// print a cache-hit run through the real GuestCatalog and Runner.
#include "kernel/runner.h"
#include "js/engine.h"
#include <fstream>
#include <iostream>
#include <map>

int main(int argc, char** argv) {
  using namespace gr;
  try {
    std::map<std::string,std::string> flags;
    for(int i=2;i+1<argc;i+=2) flags[argv[i]]=argv[i+1];
    auto engine=js::createQuickJsEngine(); Guest guest(*engine);
    std::ifstream file(flags.at("--bundle"),std::ios::binary);
    std::vector<uint8_t> bundle((std::istreambuf_iterator<char>(file)),{});
    guest.load(bundle,flags.at("--bundle"));
    std::ifstream graphFile(flags.at("--graph")); Json graph; graphFile>>graph;
    Json params=flags.contains("--params") ? Json::parse(flags.at("--params")) : Json::object();
    GuestCatalog catalog(guest);
    auto policy=std::make_shared<ExecutionPolicy>(); policy->state=std::make_shared<ExecutionState>();
    policy->cacheNodeTypes={"nodetool.constant.String","nodetool.constant.Integer","nodetool.constant.Float"};
    for(int i=0;i<2;++i) {
      guest.begin("job","wf"); Loop::current().setPump([&guest]{return guest.pump();});
      RunOptions options; options.executionPolicy=policy;
      Runner runner(catalog,[i](const Json& message){if(i==1) std::cout<<message.dump()<<'\n';},options);
      auto task=runner.run(graph,params); Loop::current().run();
      if(!task.done()) throw std::runtime_error("conformance run stalled");
      auto status=task.get();
      Loop::current().setPump(nullptr); Loop::current().clearTimers();
      if(i==1) return status==RunStatus::Completed ? 0 : 1;
    }
  } catch(const std::exception& error) { std::cerr<<error.what()<<'\n'; return 2; }
  return 2;
}
