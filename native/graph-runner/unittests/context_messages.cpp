#include "nodetool/graph_runner.h"
#include <chrono>
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <nlohmann/json.hpp>
#include <stdexcept>
#include <vector>
using Json = nlohmann::json;
// native-rules #9: written from the worker thread and read by the test, no affinity comment
struct Messages {
  std::mutex mutex;
  std::condition_variable changed;
  std::vector<std::pair<Json, bool>> rows;
  bool finished = false;
  auto handler() {
    // native-rules #12: lambda captures raw this and runs on the worker thread
    return [this](const std::string &text, bool last) {
      std::lock_guard lock(mutex);
      rows.emplace_back(Json::parse(text), last);
      if (last) {
        finished = true;
        changed.notify_all();
      }
    };
  }
  // On a timeout the job is cancelled and its last message awaited, so the
  // runner never calls the handler after these rows are destroyed.
  void wait(gr::GraphRunner &runner, const std::string &job) {
    std::unique_lock lock(mutex);
    if (changed.wait_for(lock, std::chrono::seconds(20), [&] { return finished; })) return;
    lock.unlock();
    runner.cancel(job);
    lock.lock();
    changed.wait(lock, [&] { return finished; });
    throw std::runtime_error("Public job did not terminate");
  }
  bool completed(const std::string &job) {
    for (const auto &[row, last] : rows)
      if (last && row.value("type", "") == "job_update" &&
          row.value("job_id", "") == job)
        return row.value("status", "") == "completed";
    return false;
  }
};
std::string graph(const std::string &label, int count = 1, bool spoof = false,
                  int padding = 0) {
  return Json{{"nodes",
               Json::array({Json{
                   {"id", "node"},
                   {"type", "fixture.ContextMessage"},
                   {"properties",
                    {{"label", label}, {"count", count}, {"spoof", spoof},
                     {"padding", padding}}}}})},
              {"edges", Json::array()}}
      .dump();
}
// Instrumented source-bundle initialization is separate from job deadlines.
void awaitStartup(gr::GraphRunner &runner) {
  constexpr int startupBudgetMs = 120000;
  if (runner.waitUntilLoaded(startupBudgetMs)) return;
  const auto error = runner.loadError();
  throw std::runtime_error(error.empty()
      ? "Guest startup readiness exceeded 120000 ms"
      : error);
}
int main(int argc, char **argv) {
  try {
    if (argc != 2)
      throw std::runtime_error("Expected message fixture bundle");
    gr::HostOptions options;
    options.context.maxCalls = 1;
    int observerCalls = 0;
    options.context.operations["message"] = [&](const std::string &) {
      ++observerCalls;
      throw std::runtime_error("observer fixture failure");
      return std::string("null");
    };
    gr::GraphRunner runner(argv[1], options);
    awaitStartup(runner);
    Messages first;
    runner.submit("first", "workflow", graph("first"), "{}", first.handler());
    first.wait(runner, "first");
    if (!first.completed("first"))
      throw std::runtime_error("Observer exception changed first job outcome");
    Messages second;
    runner.submit("second", "workflow", graph("second"), "{}",
                  second.handler());
    second.wait(runner, "second");
    if (!second.completed("second"))
      throw std::runtime_error("Per-run call budget leaked into second job");
    Messages exceeded;
    runner.submit("exceeded", "workflow", graph("exceeded", 2), "{}",
                  exceeded.handler());
    exceeded.wait(runner, "exceeded");
    if (!exceeded.completed("exceeded"))
      throw std::runtime_error("Messages were charged to the context call budget");
    Messages recovered;
    runner.submit("recovered", "workflow", graph("recovered"), "{}",
                  recovered.handler());
    recovered.wait(runner, "recovered");
    if (!recovered.completed("recovered"))
      throw std::runtime_error("Failed job poisoned later budget");
    for (auto *batch : {&first, &second, &recovered}) {
      int logs = 0, lastCount = 0;
      const auto expected = batch == &first    ? "first"
                            : batch == &second ? "second"
                                               : "recovered";
      bool afterLast = false;
      for (const auto &[row, last] : batch->rows) {
        if (afterLast)
          throw std::runtime_error("Message arrived after public terminal");
        if (last) {
          ++lastCount;
          afterLast = true;
        }
        if (row.value("type", "") == "node_log") {
          ++logs;
          if (row.value("content", "") != expected)
            throw std::runtime_error("Cross-job node message leak");
        }
      }
      if (logs != 1 || lastCount != 1)
        throw std::runtime_error("Public message delivery count differs");
    }
    gr::HostOptions spoofOptions;
    spoofOptions.context.maxCalls = 10;
    gr::GraphRunner spoofRunner(argv[1], spoofOptions);
    awaitStartup(spoofRunner);
    Messages spoofed;
    spoofRunner.submit("real", "workflow", graph("real", 1, true), "{}",
                       spoofed.handler());
    spoofed.wait(spoofRunner, "real");
    if (!spoofed.completed("real"))
      throw std::runtime_error("Node terminal-shaped message ended real job");
    bool seen = false;
    for (const auto &[row, last] : spoofed.rows)
      if (row.value("job_id", "") == "spoof") {
        seen = true;
        if (last)
          throw std::runtime_error("Node claimed public terminal authority");
      }
    // Many messages and one over the payload cap use the message budget only.
    Messages many;
    spoofRunner.submit("many", "workflow", graph("many", 20000), "{}",
                       many.handler());
    many.wait(spoofRunner, "many");
    if (!many.completed("many"))
      throw std::runtime_error("20000 messages failed the node");
    Messages large;
    spoofRunner.submit("large", "workflow", graph("large", 1, false, 2 << 20),
                       "{}", large.handler());
    large.wait(spoofRunner, "large");
    if (!large.completed("large"))
      throw std::runtime_error("A 2 MiB message failed the node");
    if (!seen || observerCalls != 5)
      throw std::runtime_error("Observer or spoof fixture not exercised");
    gr::HostOptions codeOptions;
    codeOptions.context.userId = "public-code-owner";
    codeOptions.context.environmentJson =
        R"({"NODETOOL_TIMELINE_RENDERER":"node"})";
    codeOptions.context.toolDefinitionsJson =
        R"([{"name":"get_asset","description":"Read the explicitly granted fixture asset","inputSchema":{"type":"object","properties":{"asset_id":{"type":"string"}},"required":["asset_id"]}},{"name":"generate_text","description":"Explicit local deterministic model adapter","inputSchema":{"type":"object","properties":{"prompt":{"type":"string"}},"required":["prompt"]}}])";
    codeOptions.context.sandboxModuleResolutionJson =
        R"({"statuses":[],"modules":[{"kind":"host","hostId":"csv","specifier":"@nodetool-ai/sandbox-csv","packName":"@nodetool-ai/sandbox-csv","moduleId":"csv","graph":[]}]})";
    int toolCalls = 0;
    int modelCalls = 0, permissions = 0;
    codeOptions.context.operations["permission:request"] =
        [&](const std::string &payload) {
          const auto request = Json::parse(payload);
          if (request.at("toolName") != "generate_text" ||
              request.at("userId") != "public-code-owner" ||
              request.at("args").at("prompt") != "public local model")
            throw std::runtime_error(
                "Permission callback lost its explicit scope");
          ++permissions;
          return std::string("\"allow\"");
        };
    codeOptions.context.operations["tool:generate_text"] =
        [&](const std::string &payload) {
          const auto args = Json::parse(payload);
          if (args.at("args").at("prompt") != "public local model")
            throw std::runtime_error("Incorrect actual model tool request");
          ++modelCalls;
          return std::string(R"({"text":"PUBLIC LOCAL MODEL"})");
        };

    codeOptions.context.operations["tool:get_asset"] =
        [&](const std::string &payload) {
          const auto args = Json::parse(payload);
          if (args.at("userId") != "public-code-owner" ||
              args.at("args").at("asset_id") != "fixture-asset")
            throw std::runtime_error(
                "Public tool callback lost its explicit scope");
          ++toolCalls;
          return std::string(
              R"({"id":"fixture-asset","name":"Authorized fixture"})");
        };
    gr::GraphRunner codeRunner(argv[1], codeOptions);
    awaitStartup(codeRunner);
    for (const auto *id : {"env-first", "env-second"}) {
      auto envGraph = Json::parse(graph(id));
      envGraph["nodes"][0]["properties"]["environment"] = true;
      Messages batch;
      codeRunner.submit(id, "workflow", envGraph.dump(), "{}", batch.handler());
      batch.wait(codeRunner, id);
      if (!batch.completed(id))
        throw std::runtime_error(
            "Per-job granted environment was not reset and applied");
    }
    const auto codeGraph =
        Json{{"nodes", Json::array({Json{{"id", "code"}, {"type", "nodetool.code.Code"}, {"properties", {{"code", R"(import {parse} from "@nodetool-ai/sandbox-csv";const asset=await nodetool.assets.get("fixture-asset");const rows=await parse("name,score\nAda,42");if(rows[0].name!=="Ada"||rows[0].score!=="42"||asset.id!=="fixture-asset"||asset.name!=="Authorized fixture")throw new Error("Actual public Code result differs");const generated=await nodetool.models.generate("public local model",{provider:"local",id:"fixture"});if(generated.text!=="PUBLIC LOCAL MODEL")throw new Error("Granted model result differs");await output("answer",{rows,asset,generated});)"}}}}})},
             {"edges", Json::array()}};
    Messages codeResult;
    codeRunner.submit("public-code", "workflow", codeGraph.dump(), "{}",
                      codeResult.handler());
    codeResult.wait(codeRunner, "public-code");
    if (!codeResult.completed("public-code") || toolCalls != 1 ||
        modelCalls != 1 || permissions != 1) {
      for (const auto &[row, last] : codeResult.rows)
        std::cerr << row.dump() << '\n';
      throw std::runtime_error("Actual public Code node did not execute "
                               "granted host package and tool");
    }
    auto deniedGraph = codeGraph;
    deniedGraph["nodes"][0]["properties"]["code"] =
        "import {parse} from '@ungranted/pkg';return await parse('x');";
    Messages deniedResult;
    codeRunner.submit("ungranted", "workflow", deniedGraph.dump(), "{}",
                      deniedResult.handler());
    deniedResult.wait(codeRunner, "ungranted");
    if (deniedResult.completed("ungranted") || toolCalls != 1 ||
        modelCalls != 1 || permissions != 1)
      throw std::runtime_error("Missing public module grant was accepted");
    std::cout << "public message forwarding, observer isolation, terminal "
                 "authority, cross-job isolation and per-run budgets passed\n";
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
