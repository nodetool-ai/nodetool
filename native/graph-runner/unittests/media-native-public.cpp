// Public API only: no Engine, Guest, installMedia, or replacement capabilities.
#include "nodetool/graph_runner.h"
#include <algorithm>
#include <atomic>
#include <condition_variable>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <mutex>
#include <nlohmann/json.hpp>
#include <thread>
#include <unistd.h>
using Json = nlohmann::json;
namespace {
// native-rules #14: file-scope mutable test counters
int checks = 0;
void check(bool ok, const std::string &why) {
  ++checks;
  if (!ok)
    throw std::runtime_error(why);
}
Json graph(const std::string &mode) {
  return {{"nodes", Json::array({{{"id", "media"},
                                  {"name", "media"},
                                  {"type", "fixture.MediaNativePublic"},
                                  {"properties", {{"mode", mode}}}}})},
          {"edges", Json::array()}};
}
// native-rules #9: written from the worker thread and read by the test, no affinity comment
struct Run {
  std::mutex mutex;
  std::condition_variable cv;
  bool done = false, ready = false;
  std::string status;
  Json messages = Json::array(), outputs;
  gr::GraphRunner::MessageHandler handler() {
    // native-rules #12: lambda captures raw this and runs on the worker thread
    return [this](const std::string &text, bool last) {
      std::lock_guard lock(mutex);
      auto msg = Json::parse(text);
      messages.push_back(msg);
      if (msg.value("content", "") == "media-native-cancel-ready")
        ready = true;
      if (msg.value("type", "") == "job_update") {
        auto s = msg.value("status", "");
        if (s == "completed" || s == "failed" || s == "cancelled")
          status = s;
        if (msg.contains("result") && msg["result"].contains("outputs"))
          outputs = msg["result"]["outputs"];
      }
      if (last)
        done = true;
      cv.notify_all();
    };
  }
  void wait(gr::GraphRunner &runner, const std::string &job) {
    std::unique_lock lock(mutex);
    if (!cv.wait_for(lock, std::chrono::seconds(60), [&] { return done; })) {
      lock.unlock();
      runner.cancel(job);
      lock.lock();
      cv.wait(lock, [&] { return done; });
      throw std::runtime_error("Public media job timeout");
    }
  }
  Json result() {
    return Json::parse(outputs.at("media").at(0).get<std::string>());
  }
};
void loaded(gr::GraphRunner &runner) {
  check(runner.waitUntilLoaded(60000),
        "Public guest load failed: " + runner.loadError());
  auto types = runner.supportedNodeTypes();
  if (std::find(types.begin(), types.end(), "fixture.MediaNativePublic") ==
      types.end()) {
    Run probe;
    auto g = graph("codec");
    g["nodes"][0]["type"] = "nodetool.parity.Probe";
    runner.submit("load-probe", "wf", g.dump(), "{}", probe.handler());
    probe.wait(runner, "load-probe");
    throw std::runtime_error("Public media fixture was not admitted: " +
                             probe.messages.dump());
  }
}
void verify(const Json &result, bool rendered = true) {
  check(result.at("bytes").get<int>() > 12, "No MP4 bytes");
  check(result.at("probe").at("durationSec") == 1, "Duration mismatch");
  check(result.at("probe").at("video").at("width") == 8, "Width mismatch");
  if (rendered) {
    check(result.at("metadata").at("render_mode") == "composited",
          "Not actual compositor output: " + result.at("metadata").dump());
  }
  std::ifstream file(result.at("path").get<std::string>(), std::ios::binary);
  char magic[8]{};
  file.read(magic, 8);
  check(file.gcount() == 8 && std::string(magic + 4, 4) == "ftyp",
        "No independent MP4 signature");
}
} // namespace
int main(int argc, char **argv) {
  if (argc < 2 || argc > 3)
    return 2;
  std::string pattern =
      (std::filesystem::temp_directory_path() / "gr-media-public-XXXXXX")
          .string();
  char *temp = mkdtemp(pattern.data());
  if (!temp)
    return 2;
  std::filesystem::path root(temp);
  std::filesystem::create_directory(root / "assets");
  try {
    gr::HostOptions options;
    options.workspaceDir = root;
    options.sqliteDirectory = root;
    options.assetDir = root / "assets";
    options.context.userId = "alice";
    options.context.modelOptionsJson = Json{
        {"databasePath", (root / "timeline.sqlite").string()},
        {"assetRoot",
         (root / "assets").string()}}.dump();
    options.context.environmentJson =
        R"({"NODETOOL_TIMELINE_RENDERER":"node"})";
    options.gpu.enabled = true;
    options.gpu.softwareOnly = true;
    {
      gr::GraphRunner runner(argv[1], options);
      loaded(runner);
      Run r;
      runner.submit("denied", "wf", graph("codec").dump(), "{}", r.handler());
      r.wait(runner, "denied");
      check(r.status == "failed" &&
                r.messages.dump().find("native media grant is disabled") !=
                    std::string::npos,
            "Default-deny public media grant failed");
    }
    options.allowMedia = true;
    options.mediaEncoders = {"aac"};
    {
      gr::GraphRunner runner(argv[1], options);
      loaded(runner);
      Run r;
      runner.submit("codec-denied", "wf", graph("codec").dump(), "{}",
                    r.handler());
      r.wait(runner, "codec-denied");
      check(r.status == "failed" &&
                r.messages.dump().find("codec is not granted") !=
                    std::string::npos,
            "Encoder allowlist was not enforced");
    }
    options.mediaEncoders = {"libx264", "aac"};
    std::atomic<bool> cancelled = false;
    options.context.cancelled = [&] { return cancelled.load(); };
    const bool codecOnly = argc == 3 && std::string(argv[2]) == "codec";
    const std::string mode = codecOnly ? "codec" : "render-video";
    Json reports = Json::array();
    {
      gr::GraphRunner runner(argv[1], options);
      loaded(runner);
      for (const char *job : {"first", "second"}) {
        Run r;
        runner.submit(job, "wf", graph(mode).dump(), "{}", r.handler());
        r.wait(runner, job);
        check(r.status == "completed",
              "Public render failed: " + r.messages.dump());
        auto result = r.result();
        verify(result, !codecOnly);
        reports.push_back(result);
      }
      check(reports[0]["calls"] == 1 && reports[1]["calls"] == 2 &&
                runner.contextLoads() == 1,
            "Two render jobs did not reuse the cached Yoga/JS context");
      for (bool apiCancel : {false, true}) {
        const std::string job = apiCancel ? "api-cancel" : "predicate-cancel";
        Run r;
        runner.submit(job, "wf", graph("cancel").dump(), "{}", r.handler());
        bool started = false;
        for (int spin = 0; spin < 30000; ++spin) {
          if (std::filesystem::exists(root / (job + "-input.mp4"))) {
            started = true;
            break;
          }
          {
            std::lock_guard lock(r.mutex);
            if (r.done)
              break;
          }
          std::this_thread::sleep_for(std::chrono::milliseconds(1));
        }
        if (!started) {
          runner.cancel(job);
          r.wait(runner, job);
          throw std::runtime_error("Native encoder did not open its output: " +
                                   r.messages.dump());
        }
        if (apiCancel)
          check(runner.cancel(job), "Public cancel rejected running encoder");
        else
          cancelled = true;
        r.wait(runner, job);
        cancelled = false;
        check(apiCancel ? r.status == "cancelled" : r.status == "failed",
              "Unexpected cancellation status: " + r.messages.dump());
        if (!apiCancel)
          check(r.messages.dump().find("native media cancelled") !=
                    std::string::npos,
                "Embedder predicate did not reach native codec poll");
        Run after;
        runner.submit(job + "-after", "wf", graph(mode).dump(), "{}",
                      after.handler());
        after.wait(runner, job + "-after");
        check(after.status == "completed",
              "Next render failed after cancellation: " +
                  after.messages.dump());
        verify(after.result(), !codecOnly);
        reports.push_back(after.result());
      }
      if (argc == 3 && std::string(argv[2]) == "image") {
        Run r;
        runner.submit("still", "wf", graph("render-image").dump(), "{}",
                      r.handler());
        r.wait(runner, "still");
        check(r.status == "completed",
              "Still-image public render failed: " + r.messages.dump());
        verify(r.result());
        reports.push_back(r.result());
      }
    }
    std::ofstream(root / "public-results.json") << reports.dump(2);
    std::cout << "public-media-checks: " << checks
              << "\npublic-media-root: " << root << "\n"
              << reports.dump() << "\n";
    return 0;
  } catch (const std::exception &e) {
    std::cerr << e.what() << "\npublic-media-root: " << root << "\n";
    return 1;
  }
}
