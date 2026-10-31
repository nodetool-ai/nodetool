#include "core/Session.h"
#include <algorithm>
#include <chrono>
#include <cmath>
#include <fstream>
#include <iostream>
#include <map>
#include <numeric>
#ifdef _WIN32
#include <psapi.h>
#include <windows.h>
#else
#include <sys/resource.h>
#include <sys/utsname.h>
#endif
using namespace nodetool::game;
namespace {
using Clock = std::chrono::steady_clock;
double elapsed(Clock::time_point start) {
  return std::chrono::duration<double, std::milli>(Clock::now() - start)
      .count();
}
Json stats(std::vector<double> values) {
  std::sort(values.begin(), values.end());
  return {
      {"samples", values.size()},
      {"p50Ms", values.at((values.size() - 1) / 2)},
      {"p95Ms",
       values.at(static_cast<std::size_t>(std::ceil(values.size() * .95)) - 1)},
      {"maxMs", values.back()},
      {"meanMs",
       std::accumulate(values.begin(), values.end(), 0.) / values.size()}};
}
} // namespace
int main(int argc, char **argv) {
  try {
    if (argc < 2) {
      throw Error(
          "argument",
          "game-bench <document> [--ticks N] [--warmup N] [--max-p95-ms N]");
    }
    std::size_t ticks = 120, warmup = 30;
    double budget = 0;
    for (int i = 2; i < argc; i += 2) {
      if (i + 1 >= argc) {
        throw Error("argument", "Missing option value");
      }
      const std::string key = argv[i];
      if (key == "--ticks") {
        ticks = std::stoull(argv[i + 1]);
      } else if (key == "--warmup") {
        warmup = std::stoull(argv[i + 1]);
      } else if (key == "--max-p95-ms") {
        budget = std::stod(argv[i + 1]);
      } else {
        throw Error("argument", "Unknown benchmark option");
      }
    }
    if (ticks < 1 || ticks > 100000 || warmup > 10000 ||
        !std::isfinite(budget) || budget < 0) {
      throw Error("argument", "Benchmark limits exceeded");
    }
    std::ifstream input(argv[1]);
    Json document;
    input >> document;
    Document authored(document);
    std::vector<double> transactions;
    for (std::size_t i = 0; i < 12; ++i) {
      const auto revision = authored.inspect().at("revision");
      const auto start = Clock::now();
      authored.transact(
          {{"requestId", "bench-" + std::to_string(i)},
           {"expectedRevision", revision},
           {"operations",
            Json::array({{{"kind", "setTitle"},
                          {"title", "Benchmark " + std::to_string(i)}}})}});
      transactions.push_back(elapsed(start));
    }
    const auto openStart = Clock::now();
    Session session(document);
    const double openMs = elapsed(openStart);
    session.recordTimings(true);
    for (std::size_t i = 0; i < warmup; ++i) {
      session.step();
    }
    std::map<std::string, std::vector<double>> samples;
    std::vector<double> serialization;
    for (std::size_t i = 0; i < ticks; ++i) {
      const auto frame = session.step();
      for (const auto &[key, value] : session.timings().items()) {
        samples[key].push_back(value.get<double>());
      }
      const auto start = Clock::now();
      const auto bytes = Json::to_msgpack(frame);
      serialization.push_back(elapsed(start));
      if (bytes.size() > 16 * 1024 * 1024) {
        throw Error("resource_limit", "Presentation exceeds transport budget");
      }
    }
    const auto checkpoint = session.snapshot();
    const auto expected = session.step();
    const auto restoreStart = Clock::now();
    session.restore(checkpoint);
    const double restoreMs = elapsed(restoreStart);
    auto resumed = session.step();
    auto original = expected;
    resumed.erase("generation");
    original.erase("generation");
    if (resumed != original) {
      throw Error("replay_error", "Benchmark snapshot continuation differs");
    }
    const auto lifecycleStart = Clock::now();
    for (int cycle = 0; cycle < 20; ++cycle) {
      session.reload(document);
      const auto saved = session.snapshot();
      session.step();
      session.restore(saved);
      session.step();
    }
    const double lifecycleMs = elapsed(lifecycleStart);
    Json measured = Json::object();
    for (const auto &[key, values] : samples) {
      measured[key] = stats(values);
    }
    measured["msgpackEncodeMs"] = stats(serialization);
    measured["documentTransactionMs"] = stats(transactions);
    Json report = {{"engine", "native-cpp-1"},
                   {"configuration", GAME_BUILD_CONFIGURATION},
                   {"ticks", ticks},
                   {"warmup", warmup},
                   {"tickRate", 60},
                   {"clock", "steady_clock wall milliseconds"},
                   {"sampling", "serial fixed input ticks, p95 nearest rank"},
                   {"build", checkpoint.at("build")},
                   {"entities", session.frame().at("entities").size()},
                   {"openMs", openMs},
                   {"restoreMs", restoreMs},
                   {"reloadRestoreCycles", 20},
                   {"reloadRestoreMs", lifecycleMs},
                   {"timings", measured},
                   {"replayVerified", true},
                   {"gpu", nullptr},
                   {"resolution", nullptr},
                   {"gpuClaim", "headless simulation only"}};
#ifdef _WIN32
    PROCESS_MEMORY_COUNTERS memory{};
    GetProcessMemoryInfo(GetCurrentProcess(), &memory, sizeof(memory));
    report["peakRssBytes"] = memory.PeakWorkingSetSize;
    report["platform"] = "windows";
#else
    rusage usage{};
    getrusage(RUSAGE_SELF, &usage);
#ifdef __APPLE__
    report["peakRssBytes"] = usage.ru_maxrss;
#else
    report["peakRssBytes"] = static_cast<std::uint64_t>(usage.ru_maxrss) * 1024;
#endif
    utsname system{};
    uname(&system);
    report["platform"] = {{"os", system.sysname},
                          {"architecture", system.machine},
                          {"release", system.release}};
#endif
    const bool passed =
        budget == 0 ||
        measured.at("totalMs").at("p95Ms").get<double>() <= budget;
    report["budget"] = {
        {"maxP95Ms", budget}, {"enforced", budget > 0}, {"passed", passed}};
    std::cout << report.dump() << '\n';
    return passed ? 0 : 2;
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
