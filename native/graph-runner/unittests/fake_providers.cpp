// Runs unittests/fake-providers.test.mjs twice: with
// HostOptions::fakeProviders and a package assets directory, where no
// provider grant may be called on either transport, and with neither, where
// the grants work as before and package:// refs fail.
#include "kernel/guest.h"
#include <atomic>
#include <chrono>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <iterator>
#include <stdexcept>
#include <string>
#include <vector>

namespace fs = std::filesystem;

namespace {

void writeText(const fs::path& path, const std::string& text) {
  fs::create_directories(path.parent_path());
  std::ofstream(path, std::ios::binary) << text;
}

// Loads the bundle in a fresh engine and returns its result tag.
std::string runBundle(const std::vector<uint8_t>& bundle, const std::string& name,
                      gr::HostOptions options, std::atomic<int>& grantCalls) {
  for (const char* operation : {"provider:fixture:open", "provider:fixture:generateMessage",
                                "provider:fixture:jobs:start", "prediction:fixture:text_to_image"}) {
    options.context.operations[operation] = [&grantCalls](const std::string&) {
      ++grantCalls;
      return std::string("\"host\"");
    };
  }
  // The same grants on the asynchronous transport, under another provider id.
  for (const char* operation : {"provider:fixture-async:open", "provider:fixture-async:generateMessage",
                                "provider:fixture-async:close", "prediction:fixture-async:text_to_image"}) {
    options.context.asyncOperations[operation] = [&grantCalls](std::string, std::stop_token,
                                                               gr::host::ContextCompletion done) {
      ++grantCalls;
      done(gr::host::ContextResult::value("\"host\""));
    };
  }
  auto engine = gr::js::createQuickJsEngine();
  gr::Guest guest(*engine, options);
  guest.load(bundle, name);
  return engine->toString(
      engine->evaluateScript("String(globalThis.__fakeProvidersResult)", "result.js"));
}

}  // namespace

int main(int argc, char** argv) {
  try {
    if (argc != 2) throw std::runtime_error("Expected fixture bundle");
    std::ifstream input(argv[1], std::ios::binary);
    const std::vector<uint8_t> bundle{std::istreambuf_iterator<char>(input), {}};

    const fs::path temp = fs::temp_directory_path() /
        ("gr-fake-providers-" + std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()));
    struct RemoveDirectory {
      fs::path path;
      ~RemoveDirectory() {
        std::error_code error;
        fs::remove_all(path, error);
      }
    } cleanup{temp};
    const fs::path packages = temp / "packages";
    writeText(packages / "nodetool-base" / "recipe-inputs" / "voice.wav", "RIFF-fixture");
    writeText(packages / "outside.txt", "outside the package");
    writeText(temp / "secret.txt", "outside the root");
    fs::create_symlink(temp / "secret.txt", packages / "nodetool-base" / "link.wav");

    std::atomic<int> grantCalls{0};
    gr::HostOptions fake;
    fake.fakeProviders = true;
    fake.packageAssetsDir = packages.string();
    const std::string fakeResult = runBundle(bundle, argv[1], fake, grantCalls);
    std::cout << fakeResult << '\n';
    if (fakeResult != "fake:ok") throw std::runtime_error("Fake provider checks did not complete");
    if (grantCalls != 0) throw std::runtime_error("A provider grant was called with fake providers");

    const std::string realResult = runBundle(bundle, argv[1], gr::HostOptions{}, grantCalls);
    std::cout << realResult << '\n';
    if (realResult != "real:ok") throw std::runtime_error("Checks without fake providers did not complete");
    if (grantCalls != 1) throw std::runtime_error("The granted prediction was not called without fake providers");
    return 0;
  } catch (const std::exception& e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
