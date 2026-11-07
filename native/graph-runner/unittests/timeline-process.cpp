#include "host/capabilities.h"
#include "js/engine.h"
#include "kernel/guest.h"
#include <filesystem>
#include <fstream>
#include <iterator>
#include <cstdio>
#include <unistd.h>
int main(int argc, char** argv) {
  if (argc != 2) return 2;
  namespace fs = std::filesystem;
  std::string pattern = (fs::temp_directory_path() / "gr-timeline-process-XXXXXX").string();
  const char* temp = mkdtemp(pattern.data());
  if (!temp) return 2;
  const fs::path root(temp);
  try {
    fs::create_directories(root / "assets");
    gr::HostOptions options;
    options.workspaceDir = root.string();
    options.sqliteDirectory = root.string();
    options.assetDir = (root / "assets").string();
    auto engine = gr::js::createQuickJsEngine();
    engine->set(engine->global(), "__timelineRoot", engine->string(root.string()));
    auto console = engine->object();
    auto log = engine->function("log", 0, [](auto& e, const auto& args) {
      for (const auto& arg : args) std::fprintf(stderr, "%s ", e.toString(arg).c_str());
      std::fprintf(stderr, "\n");
      return e.undefined();
    });
    for (const auto* name : {"log", "warn", "error", "debug", "info"}) engine->set(console, name, log);
    engine->set(engine->global(), "console", console);
    options.gpu.enabled = true;
    options.gpu.softwareOnly = true;
    gr::Guest guest(*engine, options);
    std::ifstream file(argv[1]);
    const std::string source{std::istreambuf_iterator<char>(file), {}};
    if (source.empty()) throw std::runtime_error("Empty timeline process test bundle");
    guest.load(std::vector<uint8_t>(source.begin(), source.end()), argv[1]);
    const std::string checks = engine->toString(engine->evaluateScript("String(globalThis.__timelineChecks)", "checks.js"));
    if (checks == "undefined" || checks == "0") throw std::runtime_error("Timeline process tests did not finish");
    std::printf("timeline-result: %s\n", engine->toString(engine->evaluateScript("globalThis.__timelineResult", "parity.js")).c_str());
    std::printf("timeline-checks: %s checks passed\n", checks.c_str());
    fs::remove_all(root);
    return 0;
  } catch (const std::exception& error) {
    std::fprintf(stderr, "%s\n", error.what());
    fs::remove_all(root);
    return 1;
  }
}
