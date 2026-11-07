#include "host/capabilities.h"
#include "js/engine.h"
#include "kernel/guest.h"
#include <filesystem>
#include <fstream>
#include <iterator>
#include <cstdio>
#include <unistd.h>
int main(int argc, char** argv) {
  if (argc < 2 || argc > 3 || (argc == 3 && std::string(argv[2]) != "--no-sqlite")) return 2;
  namespace fs = std::filesystem;
  std::string pattern = (fs::temp_directory_path() / "gr-models-XXXXXX").string();
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
    engine->set(engine->global(), "__modelRoot", engine->string(root.string()));
    gr::Guest guest(*engine, options);
    if (argc == 3 && std::string(argv[2]) == "--no-sqlite") {
      const auto host = engine->get(engine->global(), "__host");
      engine->set(host, "sqlite", engine->undefined());
    }
    std::ifstream file(argv[1]);
    const std::string source{std::istreambuf_iterator<char>(file), {}};
    if (source.empty()) throw std::runtime_error("Empty model test bundle");
    guest.load(std::vector<uint8_t>(source.begin(), source.end()), argv[1]);
    const std::string checks = engine->toString(engine->evaluateScript("String(globalThis.__modelChecks)", "checks.js"));
    if (checks == "undefined" || checks == "0") throw std::runtime_error("Model tests did not finish");
    std::printf("parity: %s\n", engine->toString(engine->evaluateScript("globalThis.__modelParity", "parity.js")).c_str());
    std::printf("documents: %s\n", engine->toString(engine->evaluateScript("globalThis.__documentParity", "documents.js")).c_str());
    std::printf("models: %s checks passed\n", checks.c_str());
    fs::remove_all(root);
    return 0;
  } catch (const std::exception& error) {
    std::fprintf(stderr, "%s\n", error.what());
    fs::remove_all(root);
    return 1;
  }
}
