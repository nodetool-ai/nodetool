#include "nodetool/graph_runner.h"
#include <nlohmann/json.hpp>
#include <chrono>
#include <condition_variable>
#include <fstream>
#include <iostream>
#include <mutex>
#include <stdexcept>
#include <vector>
using Json = nlohmann::json;
// native-rules #9: written from the worker thread and read by the test, no affinity comment
struct Job {
  std::mutex mutex;
  std::condition_variable changed;
  std::vector<Json> messages;
  bool done = false;
  gr::GraphRunner::MessageHandler handler() {
    return [this](const std::string& text, bool last) {
      std::lock_guard lock(mutex);
      messages.push_back(Json::parse(text));
      done = last;
      changed.notify_all();
    };
  }
  void finish(const std::string& status) {
    std::unique_lock lock(mutex);
    if (!changed.wait_for(lock, std::chrono::seconds(30), [this] { return done; })) throw std::runtime_error("Job timeout");
    if (messages.back().value("status", "") != status) throw std::runtime_error("Unexpected job result: " + messages.back().dump());
  }
  Json output() {
    std::lock_guard lock(mutex);
    Json values = Json::array();
    for (const auto& m : messages) if (m.value("type", "") == "output_update" && m.value("node_id", "") == "out") values.push_back(m.at("value"));
    if (values.size() != 1) throw std::runtime_error("Expected one Yoga output");
    return values[0];
  }
};
Json edge(const char* source, const char* target, const char* input) {
  return {{"id", std::string(source) + target}, {"source", source}, {"sourceHandle", "output"}, {"target", target}, {"targetHandle", input}};
}
int main(int argc, char** argv) {
  if (argc != 3) return 2;
  try {
    std::ifstream referenceFile(argv[2]); Json reference; referenceFile >> reference;
    Job first, second, cancelled, afterCancel;
    gr::GraphRunner runner(argv[1]);
    if (!runner.waitUntilLoaded(60000)) throw std::runtime_error(runner.loadError());
    Json graph = {{"nodes", {{{"id", "yoga"}, {"type", "nodetool.test.YogaLayout"}},
                             {{"id", "out"}, {"type", "nodetool.output.Output"}, {"data", {{"name", "layout"}}}}}},
                  {"edges", {edge("yoga", "out", "value")}}};
    if (!runner.canRun(graph.dump())) throw std::runtime_error(runner.unsupportedReason(graph.dump()));
    runner.submit("first", "yoga", graph.dump(), "{}", first.handler());
    first.finish("completed");
    runner.submit("second", "yoga", graph.dump(), "{}", second.handler());
    second.finish("completed");
    if (first.output() != reference || second.output() != reference) throw std::runtime_error("Yoga output differs across jobs or from Node");
    if (runner.contextLoads() != 1) throw std::runtime_error("Context reloaded between jobs");
    Json longGraph = {{"nodes", {{{"id", "repeat"}, {"type", "nodetool.control.RepeatCount"}, {"data", {{"count", 1000000000}}}},
                                 {{"id", "out"}, {"type", "nodetool.output.Output"}, {"data", {{"name", "count"}}}}}},
                      {"edges", {edge("repeat", "out", "value")}}};
    runner.submit("cancelled", "yoga", longGraph.dump(), "{}", cancelled.handler());
    {
      std::unique_lock lock(cancelled.mutex);
      if (!cancelled.changed.wait_for(lock, std::chrono::seconds(30), [&] {
        for (const auto& m : cancelled.messages) if (m.value("type", "") == "output_update") return true;
        return false;
      })) throw std::runtime_error("Cancellation fixture did not start");
    }
    if (!runner.cancel("cancelled")) throw std::runtime_error("Running job did not accept cancellation");
    cancelled.finish("cancelled");
    runner.submit("after-cancel", "yoga", graph.dump(), "{}", afterCancel.handler());
    afterCancel.finish("completed");
    if (afterCancel.output() != reference || runner.contextLoads() != 1) throw std::runtime_error("Yoga did not recover in the same guest context");
    std::cout << Json({{"layoutJobs", 3}, {"cancelledJobs", 1}, {"contextLoads", runner.contextLoads()}, {"matchesNode", true}}).dump() << '\n';
    return 0;
  } catch (const std::exception& e) { std::cerr << e.what() << '\n'; return 1; }
}
