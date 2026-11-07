// nodetool-graph-runner: runs a NodeTool graph with the C++ kernel and the
// TypeScript node bodies in an embedded JavaScript engine.
//
//   nodetool-graph-runner run --bundle <guest.js|guest.bin> --graph <graph.json> [--params '<json>'] [--repeat <n>] [--job-summary]
//                             [--sqlite-dir <dir>]
//                             [--workspace <dir>] [--read-root <dir>]... [--asset-dir <dir>]
//                             [--secrets <file.json>] [--allow-http] [--allow-media]
//   nodetool-graph-runner compile --bundle <guest.js> --out <guest.bin>
//
// The host options grant node code what HostOptions describes: a workspace
// directory (created when missing), read-only directories, an asset store,
// secrets from a JSON object file, https media fetches, and media decoding
// in the native media host (no encoders). Nothing is granted by default.
//
// `run` prints every kernel ProcessingMessage as one JSON line on stdout.
// The job summary the library sends after the terminal job_update is
// printed only with --job-summary, so the default output stays comparable
// with the TypeScript kernel's stream. Exit status: 0 completed, 1 failed
// or cancelled, 2 usage error. It runs through gr::GraphRunner, the same
// library API the node editor uses. --sqlite-dir grants node code a directory
// for SQLite database files (HostOptions::sqliteDirectory). Without it, node
// code gets in-memory databases only.
#include "nodetool/graph_runner.h"

#include <nlohmann/json.hpp>

#include <algorithm>
#include <chrono>
#include <climits>
#include <condition_variable>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <map>
#include <mutex>
#include <string>
#include <vector>

namespace {

int usage(const char* message) {
  if (message) std::fprintf(stderr, "error: %s\n", message);
  std::fprintf(stderr,
               "usage:\n"
               "  nodetool-graph-runner run --bundle <guest.js|guest.bin> --graph "
               "<graph.json> [--params '<json>'] [--repeat <n>] [--job-summary]\n"
               "      [--sqlite-dir <dir>]\n"
               "      [--workspace <dir>] [--read-root <dir>]... [--asset-dir <dir>]\n"
               "      [--secrets <file.json>] [--allow-http] [--allow-media]\n"
               "  nodetool-graph-runner compile --bundle <guest.js> --out <guest.bin>\n");
  return 2;
}

bool readFile(const std::string& path, std::string& out) {
  std::ifstream in(path, std::ios::binary);
  if (!in) return false;
  out.assign(std::istreambuf_iterator<char>(in), std::istreambuf_iterator<char>());
  return true;
}

std::string absolute(const std::string& path) {
  std::error_code ec;
  auto p = std::filesystem::absolute(path, ec);
  return ec ? path : p.lexically_normal().string();
}

double msSince(std::chrono::steady_clock::time_point start) {
  return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() -
                                                   start)
      .count();
}

// Runs one job and waits for its last message. Returns the status of its
// first terminal job_update. Messages after that one are the job summary.
std::string runOnce(gr::GraphRunner& runner, const std::string& graph,
                    const std::string& params, bool print, bool printSummary) {
  std::mutex mutex;
  std::condition_variable done;
  std::string status;
  bool finished = false;
  runner.submit("job", "wf", graph, params, [&](const std::string& message, bool last) {
    std::lock_guard lock(mutex);
    if (print && (status.empty() || printSummary)) {
      std::fwrite(message.data(), 1, message.size(), stdout);
      std::fputc('\n', stdout);
      std::fflush(stdout);
    }
    auto msg = nlohmann::json::parse(message);
    const std::string s = msg.value("status", std::string());
    if (status.empty() && msg.value("type", std::string()) == "job_update" &&
        (s == "completed" || s == "failed" || s == "cancelled")) {
      status = s;
    }
    if (last) {
      finished = true;
      done.notify_all();
    }
  });
  std::unique_lock lock(mutex);
  done.wait(lock, [&] { return finished; });
  return status;
}

}  // namespace

int main(int argc, char** argv) {
  if (argc < 2) return usage(nullptr);
  std::string command = argv[1];
  std::map<std::string, std::string> flags;
  gr::HostOptions host;
  bool printSummary = false;
  
  host.gpu.enabled = true;
  for (int i = 2; i < argc; ++i) {
    std::string a = argv[i];
    if (a == "--job-summary") {
      printSummary = true;
      continue;
    }
    if (a == "--no-gpu") { host.gpu.enabled = false; continue; }
    if (a == "--allow-http") {
      host.allowHttpFetch = true;
      continue;
    }
    if (a == "--allow-media") {
      host.allowMedia = true;
      continue;
    }
    if (a == "--read-root" && i + 1 < argc) {
      host.readRoots.push_back(absolute(argv[++i]));
      continue;
    }
    if (a.rfind("--", 0) != 0 || i + 1 >= argc) return usage(("bad argument " + a).c_str());
    flags[a.substr(2)] = argv[++i];
  }
  if (!flags.count("bundle")) return usage("--bundle is required");

  if (command == "compile") {
    if (!flags.count("out")) return usage("--out is required");
    std::string source;
    if (!readFile(flags["bundle"], source)) return usage("cannot read --bundle");
    std::vector<uint8_t> bytecode;
    try {
      bytecode = gr::compileBundle(source, flags["bundle"]);
    } catch (const std::exception& e) {
      std::fprintf(stderr, "compile failed: %s\n", e.what());
      return 1;
    }
    std::ofstream out(flags["out"], std::ios::binary);
    out.write(reinterpret_cast<const char*>(bytecode.data()), std::streamsize(bytecode.size()));
    if (!out) return usage("cannot write --out");
    std::fprintf(stderr, "wrote %zu bytes to %s\n", bytecode.size(), flags["out"].c_str());
    return 0;
  }

  if (command != "run") return usage(("unknown command " + command).c_str());
  if (!flags.count("graph")) return usage("--graph is required");

  std::string graph;
  std::string params = flags.count("params") ? flags["params"] : "{}";
  if (!readFile(flags["graph"], graph)) return usage("cannot read --graph");
  if (!nlohmann::json::accept(graph)) return usage("invalid JSON in --graph");
  if (!nlohmann::json::accept(params)) return usage("invalid JSON in --params");
  {
    std::string probe;
    if (!readFile(flags["bundle"], probe)) return usage("cannot read --bundle");
  }

  if (flags.count("sqlite-dir")) host.sqliteDirectory = absolute(flags["sqlite-dir"]);
  if (flags.count("workspace")) {
    host.workspaceDir = absolute(flags["workspace"]);
    std::error_code ec;
    std::filesystem::create_directories(host.workspaceDir, ec);
    if (ec) return usage("cannot create --workspace");
  }
  if (flags.count("asset-dir")) host.assetDir = absolute(flags["asset-dir"]);
  if (flags.count("secrets")) {
    std::string text;
    if (!readFile(flags["secrets"], text) || !nlohmann::json::accept(text)) {
      return usage("--secrets must name a JSON object file");
    }
    auto secrets = nlohmann::json::parse(text);
    if (!secrets.is_object()) return usage("--secrets must name a JSON object file");
    for (const auto& [key, value] : secrets.items()) {
      if (value.is_string()) host.secrets[key] = value.get<std::string>();
    }
  }

  gr::GraphRunner runner(flags["bundle"], host);
  if (!runner.waitUntilLoaded(INT_MAX)) {
    std::fprintf(stderr, "bundle load failed: %s\n", runner.loadError().c_str());
    return 1;
  }

  // --repeat runs the graph again in the same loaded context. Only the last
  // run's messages are printed, so a reused context can be checked against
  // the reference.
  const int repeat = flags.count("repeat") ? std::max(1, std::stoi(flags["repeat"])) : 1;
  std::string status;
  for (int i = 0; i < repeat; ++i) {
    auto start = std::chrono::steady_clock::now();
    status = runOnce(runner, graph, params, i == repeat - 1, printSummary);
    std::fprintf(stderr, "INFO  | graph-runner | run %d %s in %.1f ms\n", i + 1, status.c_str(),
                 msSince(start));
  }
  if (runner.contextLoads() != 1) {
    std::fprintf(stderr, "WARN  | graph-runner | the context was loaded %d times\n",
                 runner.contextLoads());
  }
  return status == "completed" ? 0 : 1;
}
