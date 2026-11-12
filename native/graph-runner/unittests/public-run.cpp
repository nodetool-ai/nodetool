#include "nodetool/graph_runner.h"
#include <nlohmann/json.hpp>
#include <condition_variable>
#include <fstream>
#include <iostream>
#include <iterator>
#include <mutex>
#include <vector>
int main(int argc,char** argv) {
  if (argc < 3) return 2;
  gr::GraphRunner runner(argv[1]);
  if (!runner.waitUntilLoaded(60000)) { std::cerr<<runner.loadError()<<'\n';return 1; }
  std::ifstream graphFile(argv[2]); std::string graph{std::istreambuf_iterator<char>(graphFile),{}};
  std::mutex mutex;std::condition_variable cv;bool done=false; std::vector<std::string> messages;
  runner.submit("job","wf",graph,"{}",[&](const std::string& message,bool last) {
    if (argc > 4) {
      auto value=nlohmann::json::parse(message);
      if (value.value("type","") == "output_update" && value.value("output_name","") == "index" && value.value("value",nlohmann::json()) == 4) runner.cancel("job");
    }
    std::lock_guard lock(mutex);messages.push_back(message); if(last){done=true;cv.notify_all();}
  },argc > 3 ? argv[3] : "");
  {
    std::unique_lock lock(mutex);
    if(!cv.wait_for(lock,std::chrono::seconds(15),[&]{return done;})) {
      // The handler refers to this stack frame, so wait for its last message.
      lock.unlock();runner.cancel("job");lock.lock();
      cv.wait(lock,[&]{return done;});
      std::cerr<<"run timeout\n";return 1;
    }
  }
  for (const auto& message:messages) std::cout<<message<<'\n';
  if(messages.empty())return 1;
  return nlohmann::json::parse(messages.back()).value("status","") == (argc > 4 ? "cancelled" : "completed") ? 0 : 1;
}
