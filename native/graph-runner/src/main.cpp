// nodetool-graph-runner: runs a NodeTool graph with the C++ kernel and the
// TypeScript node bodies in an embedded JavaScript engine.
//
//   nodetool-graph-runner run --bundle <guest.js|guest.bin> --graph <graph.json> [--params '<json>'] [--repeat <n>] [--job-summary]
//                             [--sqlite-dir <dir> [--models-db <file>]]
//                             [--workspace <dir>] [--read-root <dir>]... [--asset-dir <dir>]
//                             [--secrets <file.json>] [--allow-http] [--allow-media]
//                             [--media-encoder <name>]...
//                             [--package-assets <dir>] [--fake-providers] [--host-threads <n>]
//   nodetool-graph-runner compile --bundle <guest.js> --out <guest.bin>
//
// The host options grant node code what HostOptions describes: a workspace
// directory (created when missing), read-only directories, an asset store,
// secrets from a JSON object file, https media fetches, and media decoding
// in the native media host (no encoders), a read-only directory for
// package:// sample media, and fake providers (every provider id answers
// with the runtime's FakeProvider). Nothing is granted by default.
//
// `run` prints every kernel ProcessingMessage as one JSON line on stdout.
// The job summary the library sends after the terminal job_update is
// printed only with --job-summary, so the default output stays comparable
// with the TypeScript kernel's stream. Exit status: 0 completed, 1 failed
// or cancelled, 2 usage error. It runs through gr::GraphRunner, the same
// library API the node editor uses. --sqlite-dir grants node code a directory
// for SQLite database files (HostOptions::sqliteDirectory). Without it, node
// code gets in-memory databases only. --models-db names the model database
// inside that directory (ContextOptions::modelOptionsJson databasePath), so
// context.createAsset can save media outputs into --asset-dir.
//
// --host-threads sets the thread count of each process lane that runs native
// host jobs (HostOptions::cpuThreads, ioThreads and networkThreads). 0 runs
// them inline on the runner thread (HostOptions::inlineHostJobs). Without the
// flag the lanes have their default sizes. After the last run the CLI destroys
// the runner and gives the lanes kLaneShutdownGrace to finish. If a lane thread
// is still running a job then, it prints a warning and ends the process with
// std::quick_exit and the run's exit status, so static destructors never run
// under a live job.
#include "nodetool/graph_runner.h"
#include "nodetool/host_lanes.h"

#include <nlohmann/json.hpp>

#include <algorithm>
#include <chrono>
#include <climits>
#include <condition_variable>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <map>
#include <mutex>
#include <string>
#include <vector>
#if defined(_WIN32)
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <psapi.h>
#else
#include <sys/resource.h>
#if defined(__APPLE__)
#include <mach/mach.h>
#else
#include <unistd.h>
#endif
#endif

namespace {

// How long the lanes get to finish their jobs before the CLI exits.
constexpr auto kLaneShutdownGrace = std::chrono::seconds(2);

int usage(const char* message) {
  if (message) std::fprintf(stderr, "error: %s\n", message);
  std::fprintf(stderr,
               "usage:\n"
               "  nodetool-graph-runner run --bundle <guest.js|guest.bin> --graph "
               "<graph.json> [--params '<json>'] [--repeat <n>] [--job-summary]\n"
               "      [--sqlite-dir <dir> [--models-db <file>]]\n"
               "      [--workspace <dir>] [--read-root <dir>]... [--asset-dir <dir>]\n"
               "      [--secrets <file.json>] [--allow-http] [--allow-media]\n"
               "      [--media-encoder <name>]...\n"
               "      [--package-assets <dir>] [--fake-providers] [--host-threads <n>]\n"
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

#if defined(_WIN32)
size_t residentBytes() {
  PROCESS_MEMORY_COUNTERS counters{};
  return GetProcessMemoryInfo(GetCurrentProcess(), &counters, sizeof(counters)) ? counters.WorkingSetSize : 0;
}
size_t peakResidentBytes() {
  PROCESS_MEMORY_COUNTERS counters{};
  return GetProcessMemoryInfo(GetCurrentProcess(), &counters, sizeof(counters)) ? counters.PeakWorkingSetSize : 0;
}
#elif defined(__APPLE__)
size_t residentBytes() {
  mach_task_basic_info info{};
  mach_msg_type_number_t count = MACH_TASK_BASIC_INFO_COUNT;
  if (task_info(mach_task_self(), MACH_TASK_BASIC_INFO, reinterpret_cast<task_info_t>(&info), &count) != KERN_SUCCESS) return 0;
  return info.resident_size;
}
size_t peakResidentBytes() {
  rusage usage{};
  getrusage(RUSAGE_SELF, &usage);
  return static_cast<size_t>(usage.ru_maxrss);
}
#else
size_t residentBytes() {
  std::ifstream in("/proc/self/statm");
  size_t total = 0, resident = 0;
  in >> total >> resident;
  return resident * static_cast<size_t>(sysconf(_SC_PAGESIZE));
}
size_t peakResidentBytes() {
  rusage usage{};
  getrusage(RUSAGE_SELF, &usage);
  return static_cast<size_t>(usage.ru_maxrss) * 1024;
}
#endif

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
  bool benchLoad = false;
  
  host.gpu.enabled = true;
  // One process runs one bundle load's worth of jobs: a spare context would
  // only delay the exit.
  host.spareContext = false;
  // The CLI's one runner owns the process's admission limits.
  host.admissionLedger = gr::newAdmissionLedger();
  for (int i = 2; i < argc; ++i) {
    std::string a = argv[i];
    if (a == "--job-summary") {
      printSummary = true;
      continue;
    }
    if (a == "--bench-load") { benchLoad = true; continue; }
    if (a == "--no-gpu") { host.gpu.enabled = false; continue; }
    if (a == "--allow-http") {
      host.allowHttpFetch = true;
      continue;
    }
    if (a == "--allow-media") {
      host.allowMedia = true;
      continue;
    }
    if (a == "--media-encoder" && i + 1 < argc) {
      // Grants one libav encoder to the media host; repeat for more.
      host.mediaEncoders.push_back(argv[++i]);
      continue;
    }
    if (a == "--fake-providers") {
      host.fakeProviders = true;
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
    // The node type snapshot that lets later loads of this build evaluate
    // node modules on first use. It sits in <stem>.assets, which the source
    // bundle and the bytecode share. The load that makes it evaluates every
    // module, so the old snapshot goes first.
    const std::string assets = gr::defaultBundleAssetsDir(flags["bundle"]);
    std::error_code ec;
    if (std::filesystem::is_directory(assets, ec)) {
      std::filesystem::remove(std::filesystem::path(assets) / "types.json", ec);
      gr::HostOptions snapshotHost = host;
      snapshotHost.writeTypeSnapshot = true;
      gr::GraphRunner runner(flags["bundle"], snapshotHost);
      if (!runner.waitUntilLoaded(600000)) {
        std::fprintf(stderr, "type snapshot failed: %s\n", runner.loadError().c_str());
        return 1;
      }
      if (std::filesystem::exists(std::filesystem::path(assets) / "types.json", ec)) {
        std::fprintf(stderr, "wrote the node type snapshot to %s/types.json\n", assets.c_str());
      }
    }
    return 0;
  }

  if (command != "run") return usage(("unknown command " + command).c_str());
  if (!flags.count("graph") && !benchLoad) return usage("--graph is required");

  std::string graph;
  std::string params = flags.count("params") ? flags["params"] : "{}";
  if (!benchLoad && !readFile(flags["graph"], graph)) return usage("cannot read --graph");
  if (!benchLoad && !nlohmann::json::accept(graph)) return usage("invalid JSON in --graph");
  if (!nlohmann::json::accept(params)) return usage("invalid JSON in --params");
  {
    std::string probe;
    if (!readFile(flags["bundle"], probe)) return usage("cannot read --bundle");
  }

  if (flags.count("sqlite-dir")) host.sqliteDirectory = absolute(flags["sqlite-dir"]);
  if (flags.count("models-db")) {
    if (host.sqliteDirectory.empty()) return usage("--models-db needs --sqlite-dir");
    host.context.modelOptionsJson = nlohmann::json{{"databasePath", flags["models-db"]}}.dump();
  }
  if (flags.count("workspace")) {
    host.workspaceDir = absolute(flags["workspace"]);
    std::error_code ec;
    std::filesystem::create_directories(host.workspaceDir, ec);
    if (ec) return usage("cannot create --workspace");
  }
  if (flags.count("asset-dir")) host.assetDir = absolute(flags["asset-dir"]);
  if (flags.count("package-assets")) {
    host.packageAssetsDir = absolute(flags["package-assets"]);
    std::error_code ec;
    if (!std::filesystem::is_directory(host.packageAssetsDir, ec)) return usage("--package-assets must name a directory");
  }
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

  if (flags.count("host-threads")) {
    long threads = -1;
    try {
      threads = std::stol(flags["host-threads"]);
    } catch (const std::exception&) {
    }
    if (threads < 0 || threads > 256) return usage("--host-threads must be a number from 0 to 256");
    if (threads == 0) {
      host.inlineHostJobs = true;
    } else {
      host.cpuThreads = host.ioThreads = host.networkThreads = static_cast<size_t>(threads);
    }
  }

  std::string status;
  {
    gr::GraphRunner runner(flags["bundle"], host);
    if (!runner.waitUntilLoaded(INT_MAX)) {
      std::fprintf(stderr, "bundle load failed: %s\n", runner.loadError().c_str());
      return 1;
    }

    if (benchLoad) {
      // Resident size after load. The phase times are in the "load phases"
      // log line on stderr, which parity/bench-load.mjs reads.
      std::printf("{\"resident_bytes\":%zu,\"peak_resident_bytes\":%zu}\n", residentBytes(), peakResidentBytes());
      return 0;
    }

    // --repeat runs the graph again in the same loaded context. Only the last
    // run's messages are printed, so a reused context can be checked against
    // the reference.
    const int repeat = flags.count("repeat") ? std::max(1, std::stoi(flags["repeat"])) : 1;
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
  }
  const int exitStatus = status == "completed" ? 0 : 1;
  const gr::HostShutdown lanes =
      gr::shutdownHostLanes(std::chrono::steady_clock::now() + kLaneShutdownGrace);
  if (lanes.status == gr::HostShutdownStatus::TimedOut) {
    std::fprintf(stderr,
                 "WARN  | graph-runner | %zu host lane threads still running a job, exiting without "
                 "static teardown\n",
                 lanes.supervisor->liveThreads());
    std::fflush(stdout);
    std::fflush(stderr);
    std::quick_exit(exitStatus);
  }
  return exitStatus;
}
