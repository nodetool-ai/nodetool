// Runs guest endpoint calls against ProviderJobs with a fixture worker:
// progress, parts in both directions, errors, cancellation and concurrency.
#include "host/context.h"
#include "kernel/guest.h"
#include "nodetool/provider_jobs.h"
#include <atomic>
#include <chrono>
#include <fstream>
#include <iostream>
#include <iterator>
#include <nlohmann/json.hpp>
#include <stdexcept>
#include <thread>
using Json = nlohmann::json;
using namespace std::chrono_literals;

int main(int argc, char **argv) {
  try {
    if (argc != 2)
      throw std::runtime_error("Expected fixture bundle");
    std::atomic<int> cancelledCalls{0}, maxConcurrent{0}, running{0};
    gr::host::ProviderJobs jobs([&](const gr::host::ProviderJobs::Call &call) {
      const auto args = Json::parse(call.argsJson);
      if (call.method == "uploadMedia") {
        const auto size = args.at("bytes").at("__bytes__").get<std::string>().size();
        return Json("https://cdn.fixture.invalid/upload/" + std::to_string(size) + "/" +
                    args.at("mimeType").get<std::string>())
            .dump();
      }
      if (call.method == "downloadMedia") {
        if (args.at("url") != "https://cdn.fixture.invalid/result.bin")
          throw std::runtime_error("Unexpected download URL");
        return Json{{"__bytes__", "YWJj"}}.dump();
      }
      const auto model = args.at("model").get<std::string>();
      if (model == "fail")
        throw std::runtime_error("vendor refused the request");
      if (model == "slow") {
        while (!call.cancelled())
          std::this_thread::sleep_for(5ms);
        ++cancelledCalls;
        throw std::runtime_error("cancelled");
      }
      if (model == "large") {
        return Json{{"output",
                     {{"inputChars", call.argsJson.size()},
                      {"padding", std::string(3 * 1024 * 1024, 'a')},
                      {"text", "Grüße"}}},
                    {"requestId", nullptr}}
            .dump();
      }
      if (model == "concurrent") {
        const int now = ++running;
        int seen = maxConcurrent.load();
        while (now > seen && !maxConcurrent.compare_exchange_weak(seen, now)) {
        }
        std::this_thread::sleep_for(150ms);
        --running;
        return Json{{"output", {{"model", model}}}, {"requestId", "c"}}.dump();
      }
      call.progress(R"({"message":"queued","progress":0.25})");
      call.progress(R"({"message":"running","progress":0.75})");
      return Json{{"output",
                   {{"echo", args.at("input")},
                    {"model", model},
                    {"route", args.value("route", "")},
                    {"capability", args.at("capability")},
                    {"nodeId", args.value("nodeId", "")}}},
                  {"requestId", "req-1"},
                  {"metadata", {{"credits", 3}}}}
          .dump();
    });

    auto engine = gr::js::createQuickJsEngine();
    gr::HostOptions options;
    gr::Guest guest(*engine, options);
    auto host = engine->get(engine->global(), "__host");
    auto context = engine->object();
    gr::host::ContextOptions grants;
    jobs.grant(grants, {"fixture"});
    gr::host::installContext(*engine, context, grants);
    engine->set(host, "context", context);
    std::ifstream input(argv[1]);
    std::string source{std::istreambuf_iterator<char>(input), {}};
    guest.load({source.begin(), source.end()}, argv[1]);
    const auto result = engine->toString(
        engine->evaluateScript("JSON.stringify(globalThis.__providerJobsResult)", "result.js"));
    std::cout << result << '\n';
    if (result != "\"ok\"")
      throw std::runtime_error("Guest provider job checks did not complete");
    if (cancelledCalls != 1)
      throw std::runtime_error("Aborting the guest call did not cancel the worker");
    if (maxConcurrent < 2)
      throw std::runtime_error("Provider jobs did not run concurrently");
    return 0;
  } catch (const std::exception &e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
